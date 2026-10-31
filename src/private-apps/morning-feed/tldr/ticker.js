'use client';
import { useEffect, useRef, useState } from 'react';
import { readingSeconds, headlineSize, fitHeadline, issueDate, checkedAgo } from './layout.js';
import QRCode from 'qrcode';
import './ticker.css';
export default function TldrTicker({ endpoint, display = false, visible = true, onExpired }) {
  const [enabled, setEnabled] = useState(true);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sourceTrigger = useRef(null);
  const [summaryIndex, setSummaryIndex] = useState(0);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reduced, setReduced] = useState(false);
  const region = useRef(null), headline = useRef(null), current = useRef(null);
  const articles = data?.articles ?? [];
  const active = articles[index % Math.max(1, articles.length)];
  current.current = active;
  const summaries = active?.editions.filter((e, i, all) => e.summary && all.findIndex(other => other.summary === e.summary) === i) ?? [];
  const summary = summaries[summaryIndex % Math.max(1, summaries.length)]?.summary ?? active?.summary ?? '';
  const seconds = readingSeconds(summary);
  useEffect(() => { setSummaryIndex(0); }, [active?.url]);
  useEffect(() => {
    const title = headline.current?.querySelector?.('.tldr-title');
    if (!title) return;
    const fit = () => fitHeadline(title); fit();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    observer?.observe(title.parentElement);
    return () => observer?.disconnect();
  }, [active?.title, display]);
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
  }, [endpoint, enabled, history]);
  useEffect(() => {
    if (!enabled || !visible || paused || sourcesOpen || reduced || !articles.length) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % articles.length), seconds * 1000);
    return () => clearInterval(timer);
  }, [enabled, visible, paused, sourcesOpen, reduced, articles.length, seconds, active?.url]);
  useEffect(() => {
    setQr(''); if (!paused) return;
    let disposed = false;
    QRCode.toDataURL(paused.url, { width: 520, margin: 4, errorCorrectionLevel: 'M' }).then(value => { if (!disposed) setQr(value); }).catch(() => { if (!disposed) setError('QR unavailable. Use the article link or retry.'); });
    return () => { disposed = true; };
  }, [paused]);
  function resume() { setPaused(null); headline.current?.focus(); }
  function move(direction) {
    if (!articles.length) return;
    const next = (index + direction + articles.length) % articles.length;
    setIndex(next); if (paused) setPaused(articles[next]);
  }
  useEffect(() => {
    if ((!display && !paused && !sourcesOpen) || !enabled) return;
    function key(event) {
      if (sourcesOpen && ['Escape', 'Backspace', 'BrowserBack', 'GoBack'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); setSourcesOpen(false); sourceTrigger.current?.focus(); return; }
      if (sourcesOpen && event.key === 'Tab' && !region.current?.closest('[data-tv-remote]')) { const controls = region.current?.querySelectorAll('.tldr-source-reader button, .tldr-source-reader a'); if (controls?.length) { event.preventDefault(); const i = [...controls].indexOf(document.activeElement); controls[(i + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus(); } return; }
      const atHeadline = event.target === headline.current || event.target?.classList?.contains('morning-display');
      if (paused && ['Escape', 'Backspace', 'BrowserBack', 'GoBack'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); resume(); return; }
      if (region.current?.closest('[data-tv-remote]') && event.key !== 'MediaPlayPause') return;
      if ((paused || atHeadline) && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowLeft' ? -1 : 1); return; }
      if (!paused && atHeadline && ['Enter', ' ', 'MediaPlayPause'].includes(event.key) && active) { event.preventDefault(); event.stopPropagation(); setPaused({ ...active, summary }); return; }
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
  useEffect(() => { if (paused) region.current?.querySelector('.tldr-reader button')?.focus(); }, [Boolean(paused)]);
  useEffect(() => { if (sourcesOpen) region.current?.querySelector('.tldr-source-reader button')?.focus(); }, [sourcesOpen]);
  const upcoming = articles.length > 1 ? Array.from({ length: Math.min(3, articles.length - 1) }, (_, offset) => ({ article: articles[(index + offset + 1) % articles.length], index: (index + offset + 1) % articles.length })) : [];
  return <section ref={region} className={`tldr${display ? ' tldr-tv' : ''}`} aria-label="TLDR news ticker">
    <div className="tldr-toolbar"><div className="tldr-masthead"><strong>TLDR<span className="tldr-masthead-dot">.</span></strong><span>THE DAILY SIGNAL<br/><small>TECH / AI / DEV / INFOSEC / DEVOPS</small></span></div><div className="tldr-toolbar-end"><span className="tldr-live">{!enabled ? 'OFF' : paused ? 'PAUSED' : reduced ? 'MANUAL' : 'ON AIR'}</span><button aria-pressed={enabled} onClick={() => { setEnabled(!enabled); setPaused(null); setSourcesOpen(false); }}>{enabled ? 'Turn ticker off' : 'Turn ticker on'}</button></div></div>
    {enabled && <><div className="tldr-editorial"><article className="tldr-story">
      <div className="tldr-meta"><span>{active?.editions.map(e => `${e.edition.toUpperCase()} · ${issueDate(e.date)}`).join(' / ') || 'PUBLIC NEWSLETTERS'}</span><span>{active ? `${index % articles.length + 1} / ${articles.length}` : '—'}</span></div>
      {active ? <><button ref={headline} className="tldr-headline" onClick={() => setPaused({ ...active, summary })} aria-label={`Read ${active.title} on your phone`}><span className="tldr-title" style={{ '--headline-size': `${headlineSize(active.title.length)}px` }}>{active.title}</span></button>
      <div className="tldr-summary-label"><span>THE TLDR SUMMARY</span><span>{new URL(active.url).hostname.replace(/^www\./, '')}</span></div>
      <div className="tldr-summary">{summary || 'No summary was published for this archive item. Open the article for details.'}</div>
      {summaries.length > 1 && <div className="tldr-summary-editions" aria-label="Newsletter summary versions">{summaries.map((e, i) => <button key={`${e.edition}-${issueDate(e.date)}`} aria-pressed={summaryIndex === i} onClick={() => setSummaryIndex(i)}>{`${e.edition.toUpperCase()} summary`}</button>)}</div>}
      </> : <div className="tldr-empty"><h2>{loading ? 'Gathering the signal.' : 'Waiting for the next signal.'}</h2><p role="status">{loading ? 'Loading public TLDR issues…' : 'No headlines available. Sources will retry automatically.'}</p></div>}
    </article><aside className="tldr-next" aria-label="Upcoming headlines"><p className="tldr-rail-label">UP NEXT <span>↗</span></p>{upcoming.map(({ article, index: nextIndex }, i) => <button key={article.url} className="tldr-next-story" onClick={() => setIndex(nextIndex)}><span className="tldr-next-number">0{i + 1}</span><span><small>{article.editions.map(e => e.edition.toUpperCase()).join(' / ')}</small><strong>{article.title}</strong></span></button>)}<p className="tldr-rail-note">Five editions.<br/>One clear view.</p></aside></div>
      <div className="tldr-bottom"><div className="tldr-controls"><button disabled={!articles.length} onClick={() => move(-1)} aria-label="Previous headline">←</button><button className="tldr-pause" disabled={!active} onClick={() => paused ? resume() : setPaused({ ...active, summary })}>{paused ? 'Resume ticker' : 'Pause / show QR'}</button><button disabled={!articles.length} onClick={() => move(1)} aria-label="Next headline">→</button></div><div className="tldr-history"><button disabled={loading || !data?.history} onClick={() => setHistory(Math.max(0, (data?.history ?? 0) - 1))}>Newer issues</button><button disabled={loading || !data?.hasOlder} onClick={() => setHistory((data?.history ?? 0) + 1)}>Older issues</button><button disabled={loading || history === 0} onClick={() => setHistory(0)}>Latest</button></div></div>
      <div className="tldr-footnote"><p className="tldr-help">{display ? 'D-pad selects · OK opens · Back resumes' : 'Pause any story to open it on your phone.'} {reduced ? 'Manual advance · reduced motion' : `Auto advance · ${seconds}s reading time`} {loading && ' · Refreshing…'}</p><button ref={sourceTrigger} className="tldr-source-trigger" onClick={() => setSourcesOpen(true)}>{`${data?.history ? `Issue history · page ${data.history + 1}` : 'Latest public issues'} · Issue dates & sources`}</button></div>
      {error && <p className="tldr-error" role="alert">{error}</p>}
    </>}
    {enabled && sourcesOpen && <div className="tldr-source-reader" role="dialog" aria-modal="true" aria-label="Issue dates and sources"><header><div><p className="tldr-live">FROM THE PUBLIC ARCHIVES</p><h2>Five editions. Every issue, dated.</h2></div><button data-tv-cancel onClick={() => { setSourcesOpen(false); sourceTrigger.current?.focus(); }}>Back to News</button></header><div className="tldr-source-grid">{data?.sources.map(s => <a className="tldr-source-card" key={s.edition} href={`https://tldr.tech/${s.edition}/archives`} target="_blank" rel="noopener noreferrer"><strong>{s.edition.toUpperCase()}</strong><span>{issueDate(s.date)}<small>{s.count ? `${s.count} stories` : ''}</small></span><p>{s.status === 'current' ? 'Latest available issue' : s.status === 'older' ? 'Older issue · archive may lag email' : s.status === 'cached' ? 'Stale cache · retrying source' : 'Source unavailable · keeping loaded headlines'}</p><small>{checkedAgo(s.checkedAt)}</small></a>)}</div><p className="tldr-source-note">Full source summaries from public TLDR archives. Email can arrive before the archive updates. Sponsors are excluded.</p></div>}
    {enabled && paused && <div className="tldr-reader" role="dialog" aria-modal="true" aria-label="Paused headline"><div className="tldr-reader-copy"><p className="tldr-live">PAUSED / OPEN ON YOUR PHONE</p><h2>{paused.title}</h2><p className="tldr-reader-meta">{paused.editions.map(e => `${e.edition.toUpperCase()} · ${issueDate(e.date)}`).join(' / ')}</p><div className="tldr-summary">{paused.summary}</div><button data-tv-cancel onClick={resume}>Resume ticker · Back</button><a href={paused.url} target="_blank" rel="noopener noreferrer">Open article ↗</a></div><div className="tldr-qr">{qr ? <img src={qr} width="520" height="520" alt="Scan to open this article on your phone"/> : <p role="status">Preparing QR…</p>}<p>SCAN TO READ · {new URL(paused.url).hostname}</p></div></div>}
  </section>;
}
