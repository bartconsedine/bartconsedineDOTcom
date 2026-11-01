'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cardArticle } from '../tv/card-article.js';
import { subscribeTvHistory, openTvOverlay, closeTvOverlay } from '../tv/history.js';
import { readingSeconds, headlineSize, fitHeadline, issueDate, checkedAgo } from './layout.js';
import PagedText from '../tv/paged-text';
import { articleId, createNewsProgress, newestFirst } from './progress-model.js';
import './ticker.css';
export default function TldrTicker({ endpoint, progressEndpoint = null, display = false, visible = true, onExpired, cardStories = [] }) {
  const [enabled, setEnabled] = useState(true);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sourceTrigger = useRef(null), returnFocus = useRef(null), cardsRef = useRef(cardStories);
  cardsRef.current = cardStories;
  const [readingPage, setReadingPage] = useState(0);
  const [summaryIndex, setSummaryIndex] = useState(0);
  const [readerSummary, setReaderSummary] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reduced, setReduced] = useState(false);
  const region = useRef(null), headline = useRef(null), current = useRef(null);
  const [readIds, setReadIds] = useState(null);
  const [showRead, setShowRead] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const [progressError, setProgressError] = useState('');
  const [savingReads, setSavingReads] = useState(0);
  const progress = useRef(null), failedReads = useRef(new Map()), moving = useRef(false), refreshProgress = useRef(null);
  const allArticles = useMemo(() => newestFirst(data?.articles ?? []), [data]);
  const progressPending = progressEndpoint && !readIds && !progressError;
  const articles = useMemo(() => progressPending ? [] : progressEndpoint && readIds && !showRead ? allArticles.filter(article => !readIds.has(article.readId)) : allArticles, [progressPending, progressEndpoint, readIds, showRead, allArticles]);
  const activeIndex = progressEndpoint ? Math.max(0, articles.findIndex(article => article.url === selectedUrl)) : index % Math.max(1, articles.length);
  const active = articles[activeIndex];
  current.current = active;
  const summaries = active?.editions.filter((e, i, all) => e.summary && all.findIndex(other => other.summary === e.summary) === i) ?? [];
  const summary = summaries[summaryIndex % Math.max(1, summaries.length)]?.summary ?? active?.summary ?? '';
  const seconds = readingSeconds(summary);
  useEffect(() => {
    if (!progressEndpoint) return;
    const client = createNewsProgress({ endpoint: progressEndpoint });
    progress.current = client; setReadIds(null); failedReads.current.clear();
    let disposed = false, busy = false;
    async function refresh() {
      if (busy || (typeof document.visibilityState === 'string' && document.visibilityState === 'hidden')) return;
      busy = true;
      try { const ids = await client.load(); if (!disposed) { setReadIds(ids); if (!failedReads.current.size) setProgressError(''); } }
      catch (error) { if (!disposed) setProgressError(error.message); }
      finally { busy = false; }
    }
    refreshProgress.current = refresh;
    refresh();
    const wake = () => refresh();
    window.addEventListener('focus', wake); document.addEventListener?.('visibilitychange', wake);
    const timer = setInterval(wake, 60000);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', wake); document.removeEventListener?.('visibilitychange', wake); if (progress.current === client) { progress.current = null; refreshProgress.current = null; } };
  }, [progressEndpoint]);
  useEffect(() => { if (visible && progressEndpoint) { setSelectedUrl(null); refreshProgress.current?.(); } }, [visible, progressEndpoint]);

  async function markRead(article) {
    if (!progressEndpoint || !article) return;
    const client = progress.current;
    if (!client) return;
    setSavingReads(value => value + 1);
    try {
      const ids = await client.mark(article.url);
      if (progress.current !== client) return;
      failedReads.current.delete(article.url); setReadIds(ids);
      if (!failedReads.current.size) setProgressError('');
    } catch (error) { if (progress.current === client) { failedReads.current.set(article.url, article); setProgressError(error.message); } }
    finally { setSavingReads(value => Math.max(0, value - 1)); }
  }
  async function retryProgress() {
    if (failedReads.current.size) { for (const article of [...failedReads.current.values()]) await markRead(article); }
    else { try { setReadIds(await progress.current.load()); setProgressError(''); } catch (error) { setProgressError(error.message); } }
  }
  useEffect(() => { setSummaryIndex(0); }, [active?.url]);
  useEffect(() => {
    const title = headline.current?.querySelector?.('.tldr-title');
    if (!title) return;
    if (!visible) return;
    const fit = () => fitHeadline(title); fit();
    let frame;
    const resize = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(fit); };
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); window.cancelAnimationFrame(frame); };
  }, [active?.title, display, visible]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches); update();
    preference.addEventListener?.('change', update);
    return () => preference.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, busy = false;
    const controller = new AbortController();
    async function refresh() {
      if (busy) return; busy = true; setLoading(true);
      try {
        const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}feed=tldr&history=${history}`;
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (response.status === 401 || response.status === 403) { if (!disposed) { setData(null); setPaused(null); onExpired?.(); setError('Sign in or connect this TV again.'); } return; }
        if (!response.ok) throw Error();
        const next = await response.json();
        if (!Array.isArray(next.articles) || !Array.isArray(next.sources)) throw Error();
        if (progressEndpoint) next.articles = await Promise.all(next.articles.map(async article => ({ ...article, readId: await articleId(article.url) })));
        if (!disposed) {
          // Keep last-loaded editions on a cold-cache partial outage, clearly marked unavailable.
          setData(previous => {
            const merged = { ...next, articles: next.articles.map(article => ({ ...article, editions: [...article.editions] })) };
            if (previous?.history === next.history) {
              const failed = new Set(next.sources.filter(s => s.status === 'unavailable').map(s => s.edition));
              for (const article of previous.articles) {
                const editions = article.editions.filter(e => failed.has(e.edition));
                if (!editions.length) continue;
                const existing = merged.articles.find(a => a.url === article.url);
                if (existing) existing.editions.push(...editions.filter(e => !existing.editions.some(old => old.edition === e.edition && old.date === e.date))); else merged.articles.push({ ...article, editions });
              }
              merged.sources = next.sources.map(source => source.status === 'unavailable' ? { ...previous.sources.find(s => s.edition === source.edition), ...source, date: previous.sources.find(s => s.edition === source.edition)?.date ?? null } : source);
            }
            return merged;
          });
          const found = next.articles.findIndex(a => a.url === current.current?.url);
          setIndex(Math.max(0, found)); setError('');
        }
      } catch { if (!disposed) setError('Refresh unavailable. Keeping the last loaded headlines; retrying every minute.'); }
      finally { busy = false; if (!disposed) setLoading(false); }
    }
    refresh(); const timer = setInterval(refresh, 60000);
    return () => { disposed = true; controller.abort(); clearInterval(timer); };
  }, [endpoint, enabled, history, progressEndpoint]);
  useEffect(() => {
    if (!enabled || !visible || paused || sourcesOpen || readingPage > 0 || reduced || !articles.length || (progressEndpoint && !readIds)) return;
    const timer = setInterval(() => progressEndpoint ? setSelectedUrl(articles[(activeIndex + 1) % articles.length].url) : setIndex(i => (i + 1) % articles.length), seconds * 1000);
    return () => clearInterval(timer);
  }, [enabled, visible, paused, sourcesOpen, readingPage, reduced, articles.length, seconds, active?.url, readIds, progressEndpoint]);
  function pauseStory(article) { setReaderSummary(false); const snapshot = { ...article, summary: article === active ? summary : article.summary }; setPaused(snapshot); openTvOverlay(window, 'article', snapshot); if (allArticles.some(item => item.url === article.url)) void markRead(article); }
  function resume() { if (!closeTvOverlay(window, 'article')) setPaused(null); headline.current?.focus(); }
  function closeSources() { setSourcesOpen(false); closeTvOverlay(window, 'sources'); sourceTrigger.current?.focus(); }
  async function move(direction) {
    if (paused && progressEndpoint) {
      const position = allArticles.findIndex(article => article.url === paused.url);
      if (position !== -1) pauseStory(allArticles[(position + direction + allArticles.length) % allArticles.length]);
      return;
    }
    if (!articles.length || moving.current) return;
    const next = (activeIndex + direction + articles.length) % articles.length;
    if (!progressEndpoint) { setIndex(next); if (paused) pauseStory(articles[next]); return; }
    moving.current = true;
    try { await markRead(active); setSelectedUrl(articles[next]?.url); }
    finally { moving.current = false; }
  }
  async function selectStory(article, nextIndex) {
    if (!progressEndpoint) { setIndex(nextIndex); return; }
    if (moving.current) return;
    moving.current = true;
    try { await markRead(active); setSelectedUrl(article.url); }
    finally { moving.current = false; }
  }
  useEffect(() => {
    if ((!display && !paused && !sourcesOpen) || !enabled) return;
    function key(event) {
      if (sourcesOpen && ['Escape', 'Backspace', 'BrowserBack', 'GoBack'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); closeSources(); return; }
      if (sourcesOpen && event.key === 'Tab' && !region.current?.closest('[data-tv-remote]')) { const controls = region.current?.querySelectorAll('.tldr-source-reader button, .tldr-source-reader a'); if (controls?.length) { event.preventDefault(); const i = [...controls].indexOf(document.activeElement); controls[(i + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus(); } return; }
      const atHeadline = event.target === headline.current || event.target?.classList?.contains('morning-display');
      if (paused && ['Escape', 'Backspace', 'BrowserBack', 'GoBack'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); resume(); return; }
      if (region.current?.closest('[data-tv-remote]') && event.key !== 'MediaPlayPause') return;
      if ((paused || atHeadline) && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowLeft' ? -1 : 1); return; }
      if (!paused && atHeadline && ['Enter', ' ', 'MediaPlayPause'].includes(event.key) && active) { event.preventDefault(); event.stopPropagation(); pauseStory(active); return; }
      if (paused && event.key === 'Tab') {
        const controls = region.current?.querySelectorAll('.tldr-reader a, .tldr-reader button');
        if (controls?.length) { event.preventDefault(); const i = [...controls].indexOf(document.activeElement); controls[(i + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus(); } return;
      }
      if (['ArrowDown', 'ArrowUp'].includes(event.key) && (paused || atHeadline || region.current?.contains(event.target))) {
        const controls = region.current?.querySelectorAll(paused ? '.tldr-reader a, .tldr-reader button' : 'button:not(:disabled)');
        if (controls?.length) { event.preventDefault(); event.stopPropagation(); const i = [...controls].indexOf(document.activeElement); controls[(i + (event.key === 'ArrowUp' ? controls.length - 1 : 1)) % controls.length].focus(); }
      }
    }
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [display, enabled, paused, sourcesOpen, active, summary, index, articles]);
  const readerWasOpen = useRef(false);
  useEffect(() => {
    if (paused) (region.current?.closest('.morning') || region.current)?.querySelector?.('.tldr-reader button')?.focus();
    else if (readerWasOpen.current) {
      // Restore after the portal is removed. The last unread story may have
      // removed/disabled its trigger, so keep focus on an available News control.
      const trigger = returnFocus.current;
      const target = trigger?.isConnected && !trigger.disabled ? trigger : headline.current || region.current?.querySelector?.('.tldr-controls button:not(:disabled)');
      target?.focus({ preventScroll: true });
    }
    readerWasOpen.current = Boolean(paused);
  }, [Boolean(paused)]);
  useEffect(() => { if (sourcesOpen) region.current?.querySelector('.tldr-source-reader button')?.focus(); }, [sourcesOpen]);
  const previousOverlay = useRef(null);
  useEffect(() => subscribeTvHistory(window, location => { if (!location) return; const was = previousOverlay.current; previousOverlay.current = location.overlay; if (location.overlay === 'article' && was !== 'article') { returnFocus.current = document.activeElement; setReaderSummary(false); } const article = location.payload?.kind === 'card' ? cardArticle(location.payload.cardId, cardsRef.current) : location.payload; setPaused(location.overlay === 'article' ? article : null); if (location.overlay === 'article' && !article) closeTvOverlay(window, 'article'); setSourcesOpen(location.overlay === 'sources'); if (was === 'sources' && !location.overlay) window.queueMicrotask?.(() => sourceTrigger.current?.focus()); }), []);
  const upcoming = articles.length > 1 ? Array.from({ length: Math.min(3, articles.length - 1) }, (_, offset) => ({ article: articles[(activeIndex + offset + 1) % articles.length], index: (activeIndex + offset + 1) % articles.length })) : [];
  const progressStatus = progressEndpoint && <div className="tldr-progress" aria-live="polite">{progressError ? <><span role="alert">{progressError}</span> <button disabled={savingReads > 0} onClick={retryProgress}>{failedReads.current.size ? 'Retry saving progress' : 'Retry loading progress'}</button></> : <span>{savingReads ? 'Saving read status…' : progressPending ? 'Loading reading progress…' : readIds ? 'Reading progress saved across your sessions' : ''}</span>}</div>;
  return <section ref={region} className={`tldr${display ? ' tldr-tv' : ''}`} aria-label="TLDR news ticker">
    <div className="tldr-toolbar"><div className="tldr-masthead"><strong>TLDR<span className="tldr-masthead-dot">.</span></strong><span>THE DAILY SIGNAL<br/><small>TECH / AI / DEV / INFOSEC / DEVOPS</small></span></div><div className="tldr-toolbar-end"><span className="tldr-live">{!enabled ? 'OFF' : paused ? 'PAUSED' : reduced ? 'MANUAL' : 'ON AIR'}</span><button aria-pressed={enabled} onClick={() => { setEnabled(!enabled); setPaused(null); setSourcesOpen(false); }}>{enabled ? 'Turn ticker off' : 'Turn ticker on'}</button></div></div>
    {enabled && <><div className="tldr-editorial"><article className="tldr-story">
      <div className="tldr-meta"><span>{active?.editions.map(e => `${e.edition.toUpperCase()} · ${issueDate(e.date)}`).join(' / ') || 'PUBLIC NEWSLETTERS'}</span><span>{active ? `${activeIndex + 1} / ${articles.length}${readIds?.has(active.readId) ? ' · Read' : ''}` : '—'}</span></div>
      {active ? <><button ref={headline} className="tldr-headline" onClick={event => { event?.currentTarget?.focus({ preventScroll: true }); pauseStory(active); }} aria-label={`Open ${active.title} in the TV reader`}><span className="tldr-title" style={{ '--headline-size': `${headlineSize(active.title.length)}px` }}>{active.title}</span></button>
      <div className="tldr-summary-label"><span>THE TLDR SUMMARY</span><span>{new URL(active.url).hostname.replace(/^www\./, '')}</span></div>
      <div className="tldr-summary">{display ? <PagedText text={summary || 'No summary was published for this archive item. Open the article for details.'} label="Summary" onPage={setReadingPage}/> : summary}</div>
      {summaries.length > 1 && <div className="tldr-summary-editions" aria-label="Newsletter summary versions">{summaries.map((e, i) => <button key={`${e.edition}-${issueDate(e.date)}`} aria-pressed={summaryIndex === i} onClick={() => setSummaryIndex(i)}>{`${e.edition.toUpperCase()} summary`}</button>)}</div>}
      </> : <div className="tldr-empty"><h2>{progressPending || loading ? 'Gathering the signal.' : allArticles.length && readIds ? 'You’re caught up.' : 'Waiting for the next signal.'}</h2><p role="status">{progressPending ? 'Loading your saved reading progress…' : loading ? 'Loading public TLDR issues…' : allArticles.length && readIds ? 'New stories appear here automatically. Choose All stories to revisit read articles.' : 'No headlines available. Sources will retry automatically.'}</p></div>}
    </article><aside className="tldr-next" aria-label="Upcoming headlines"><p className="tldr-rail-label">UP NEXT <span>↗</span></p>{upcoming.map(({ article, index: nextIndex }, i) => <button key={article.url} className="tldr-next-story" disabled={savingReads > 0} onClick={() => selectStory(article, nextIndex)}><span className="tldr-next-number">0{i + 1}</span><span><small>{article.editions.map(e => e.edition.toUpperCase()).join(' / ')}</small><strong>{article.title}</strong></span></button>)}<p className="tldr-rail-note">Newest issues first.<br/>{progressEndpoint && !showRead ? 'Unread stories.' : 'Five editions.'}</p></aside></div>
      <div className="tldr-bottom"><div className="tldr-controls"><button disabled={!articles.length || savingReads > 0} onClick={() => move(-1)} aria-label="Previous headline">←</button><button className="tldr-pause" disabled={!active} onClick={event => { event?.currentTarget?.focus({ preventScroll: true }); paused ? resume() : pauseStory(active); }}>{paused ? 'Resume ticker' : 'Open article'}</button><button disabled={!articles.length || savingReads > 0} onClick={() => move(1)} aria-label="Next headline">→</button>{progressEndpoint && <button aria-pressed={showRead} onClick={() => { setShowRead(!showRead); setSelectedUrl(null); }}>{showRead ? 'Unread stories' : 'All stories'}</button>}</div><div className="tldr-history"><button disabled={loading || !data?.history} onClick={() => { setHistory(Math.max(0, (data?.history ?? 0) - 1)); setSelectedUrl(null); }}>Newer issues</button><button disabled={loading || !data?.hasOlder} onClick={() => { setHistory((data?.history ?? 0) + 1); setSelectedUrl(null); }}>Older issues</button><button disabled={loading || history === 0} onClick={() => { setHistory(0); setSelectedUrl(null); }}>Latest</button></div></div>
      <div className="tldr-footnote"><p className="tldr-help">{display ? 'D-pad selects · OK opens article · Back returns' : 'Pause any story to open it on your phone.'} {reduced ? 'Manual advance · reduced motion' : `Auto advance · ${seconds}s reading time`} {loading && ' · Refreshing…'}</p><button ref={sourceTrigger} className="tldr-source-trigger" onClick={() => { setSourcesOpen(true); openTvOverlay(window, 'sources'); }}>{`${data?.history ? `Issue history · page ${data.history + 1}` : 'Latest public issues'} · Issue dates & sources`}</button></div>
      {error && <p className="tldr-error" role="alert">{error}</p>}
      {!paused && progressStatus}
    </>}
    {enabled && sourcesOpen && <div className="tldr-source-reader" role="dialog" aria-modal="true" aria-label="Issue dates and sources"><header><div><p className="tldr-live">FROM THE PUBLIC ARCHIVES</p><h2>Five editions. Every issue, dated.</h2></div><button data-tv-cancel onClick={closeSources}>Back to News</button></header><div className="tldr-source-grid">{data?.sources.map(s => <button className="tldr-source-card" key={s.edition} onClick={() => pauseStory({ kind:'archive', title: `${s.edition.toUpperCase()} public archive`, url: `https://tldr.tech/${s.edition}/archives`, summary: 'Public issue archive. Return to News for complete individual newsletter summaries.', editions: [{edition:s.edition,date:s.date}] })}><strong>{s.edition.toUpperCase()}</strong><span>{issueDate(s.date)}<small>{s.count ? `${s.count} stories` : ''}</small></span><p>{s.status === 'current' ? 'Latest available issue' : s.status === 'older' ? 'Older issue · archive may lag email' : s.status === 'cached' ? 'Stale cache · retrying source' : 'Source unavailable · keeping loaded headlines'}</p><small>{checkedAgo(s.checkedAt)}</small></button>)}</div><p className="tldr-source-note">Full source summaries from public TLDR archives. Email can arrive before the archive updates. Sponsors are excluded.</p></div>}
    {paused && createPortal(<div className="tldr-reader tv-article-reader" role="dialog" aria-modal="true" aria-label="Article reader"><header className="tv-article-toolbar"><button data-tv-cancel onClick={resume}>← Return to TV</button><span>{new URL(paused.url).hostname.replace(/^www\./, '')}</span><button aria-pressed={!readerSummary} onClick={() => setReaderSummary(false)}>Read site</button><button aria-pressed={readerSummary} onClick={() => setReaderSummary(true)}>{paused.kind === 'card' ? 'Card details' : paused.kind === 'archive' ? 'Archive details' : 'TLDR summary'}</button></header><div><p className="tv-article-notice">{readerSummary ? (paused.kind === 'card' ? 'Complete saved card details.' : paused.kind === 'archive' ? 'Public archive information.' : 'Complete original newsletter summary. The publisher’s full article is available in Read site.') : 'Embedded public website. If the publisher blocks embedding or requires a login, use the details button above. Back returns to your previous screen.'}</p>{progressStatus}</div>{readerSummary ? <div className="tv-article-summary"><h2>{paused.title}</h2><PagedText text={paused.summary} label="Summary"/></div> : <iframe title={`Article: ${paused.title}`} src={paused.url} tabIndex={0} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" className="tv-article-frame"/>}</div>, region.current?.closest('.morning') || region.current)}

  </section>;
}
