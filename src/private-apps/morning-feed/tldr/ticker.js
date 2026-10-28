'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import './ticker.css';
export default function TldrTicker({ endpoint, display = false, onExpired }) {
  const [enabled, setEnabled] = useState(true);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reduced, setReduced] = useState(false);
  const region = useRef(null), headline = useRef(null), current = useRef(null);
  const articles = data?.articles ?? [];
  const active = articles[index % Math.max(1, articles.length)];
  current.current = active;
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
    if (!enabled || paused || reduced || !articles.length) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % articles.length), 16000);
    return () => clearInterval(timer);
  }, [enabled, paused, reduced, articles.length]);
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
    if ((!display && !paused) || !enabled) return;
    function key(event) {
      const atHeadline = event.target === headline.current || event.target?.classList?.contains('morning-display');
      if (paused && ['Escape', 'Backspace', 'BrowserBack', 'GoBack'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); resume(); return; }
      if ((paused || atHeadline) && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowLeft' ? -1 : 1); return; }
      if (!paused && atHeadline && ['Enter', ' ', 'MediaPlayPause'].includes(event.key) && active) { event.preventDefault(); event.stopPropagation(); setPaused(active); return; }
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
  }, [display, enabled, paused, active, index, articles]);
  useEffect(() => { if (paused) region.current?.querySelector('.tldr-reader button')?.focus(); }, [Boolean(paused)]);
  return <section ref={region} className={`tldr${display ? ' tldr-tv' : ''}`} aria-label="TLDR news ticker">
    <div className="tldr-toolbar"><strong>TLDR <span>THE NEWS WIRE</span></strong><button aria-pressed={enabled} onClick={() => { setEnabled(!enabled); setPaused(null); }}>{enabled ? 'Turn ticker off' : 'Turn ticker on'}</button></div>
    {enabled && <><div className="tldr-wire"><span className="tldr-live">{paused ? 'PAUSED' : reduced ? 'MANUAL' : 'ON AIR'}</span>{active ? <button ref={headline} className="tldr-headline" onClick={() => setPaused(active)}><span key={active.url} className={reduced ? '' : 'tldr-scroll'}>{active.title}</span></button> : <p role="status">{loading ? 'Loading public TLDR issues…' : 'No headlines available. Sources will retry automatically.'}</p>}</div>
      {active && <div className="tldr-meta"><span>{active.editions.map(e => `${e.edition.toUpperCase()} · ${e.date}`).join(' / ')}</span><span>{index % articles.length + 1} / {articles.length} headlines</span></div>}
      <div className="tldr-controls"><button disabled={!articles.length} onClick={() => move(-1)} aria-label="Previous headline">←</button><button disabled={!active} onClick={() => paused ? resume() : setPaused(active)}>{paused ? 'Resume ticker' : 'Pause / show QR'}</button><button disabled={!articles.length} onClick={() => move(1)} aria-label="Next headline">→</button><button disabled={loading || !data?.history} onClick={() => setHistory(Math.max(0, (data?.history ?? 0) - 1))}>Newer issues</button><button disabled={loading || !data?.hasOlder} onClick={() => setHistory((data?.history ?? 0) + 1)}>Older issues</button><button disabled={loading || history === 0} onClick={() => setHistory(0)}>Latest</button></div>
      <p className="tldr-help">{display ? 'OK pauses for QR · Back resumes · ← → headlines · ↑ ↓ controls' : 'Pause any headline to open it on your phone.'} {reduced && 'Reduced motion: use arrows to advance.'} {loading && 'Refreshing…'}</p>
      {error && <p role="alert">{error}</p>}
      <details className="tldr-sources"><summary>{data?.history ? `Issue history · page ${data.history + 1}` : 'Latest public issues'} · dates & source status</summary><ul>{data?.sources.map(s => <li key={s.edition}><a href={`https://tldr.tech/${s.edition}/archives`} target="_blank" rel="noopener noreferrer">{s.edition.toUpperCase()}</a> · {s.date || 'No issue loaded'} · {s.status === 'current' ? 'archive checked' : s.status === 'older' ? 'older issue — archive may lag email' : s.status === 'cached' ? 'stale cache — retrying source' : 'source unavailable — keeping loaded headlines'}{s.checkedAt && ` · checked ${s.checkedAt}`}</li>)}</ul><p>Public archives may lag your email. Sponsor items are excluded. No Gmail connection is used.</p></details>
    </>}
    {enabled && paused && <div className="tldr-reader" role="dialog" aria-modal="true" aria-label="Paused headline"><div className="tldr-reader-copy"><p className="tldr-live">PAUSED / OPEN ON YOUR PHONE</p><h2>{paused.title}</h2><p>{paused.editions.map(e => `${e.edition.toUpperCase()} · ${e.date}`).join(' / ')}</p><p>Scan with your phone camera.</p><button onClick={resume}>Resume ticker · Back</button><a href={paused.url} target="_blank" rel="noopener noreferrer">Open article ↗</a></div><div className="tldr-qr">{qr ? <img src={qr} width="520" height="520" alt="Scan to open this article on your phone"/> : <p role="status">Preparing QR…</p>}<p>{new URL(paused.url).hostname}</p></div></div>}
  </section>;
}
