'use client';
import { useEffect, useRef, useState } from 'react';
import { pageForOffset, textPages } from './pagination.js';
export default function PagedText({ text = '', label = 'Summary', onPage, onActivate, activationRef, activationClassName, activationLabel, textClassName, hideSinglePageControls = false }) {
  const pane = useRef(null), measure = useRef(null);
  const source = useRef(text), offset = useRef(0), pageCallback = useRef(onPage);
  pageCallback.current = onPage;
  const [pages, setPages] = useState([text]), [page, setPage] = useState(0);
  useEffect(() => {
    let disposed = false;
    if (source.current !== text) { source.current = text; offset.current = 0; setPages([text]); setPage(0); pageCallback.current?.(0); }
    if (!pane.current || !measure.current) return;
    const fit = () => {
      if (disposed) return;
      const height = pane.current.clientHeight;
      if (!height || !pane.current.clientWidth) return;
      const next = textPages(text, value => { measure.current.textContent = value; return measure.current.getBoundingClientRect().height <= height - 2; });
      measure.current.textContent = '';
      const nextPage = pageForOffset(next, offset.current);
      setPages(next); setPage(nextPage); pageCallback.current?.(nextPage);
    };
    fit(); let frame;
    const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    const observer = new ResizeObserver(resize); observer.observe(pane.current);
    window.addEventListener('resize', resize);
    document.fonts?.ready.then(fit);
    return () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', resize); cancelAnimationFrame(frame); };
  }, [text]);
  const current = Math.min(page, pages.length - 1);
  function change(next) { const target = Math.max(0, Math.min(next, pages.length - 1)); offset.current = pages.slice(0, target).reduce((total, value) => total + value.length, 0); setPage(target); pageCallback.current?.(target); }
  return <div className="tv-paged" aria-label={label}><div ref={pane} className="tv-paged-pane">{onActivate ? <button ref={activationRef} className={activationClassName} aria-label={activationLabel} onClick={onActivate}><span className={textClassName || 'tv-paged-copy'} data-text-page>{pages[current]}</span></button> : <div className={textClassName || 'tv-paged-copy'} data-text-page>{pages[current]}</div>}<div ref={measure} className={`tv-paged-copy tv-paged-measure${textClassName ? ` ${textClassName}` : ''}`} aria-hidden="true"/></div>{(!hideSinglePageControls || pages.length > 1) && <div className="tv-page-controls"><button disabled={current === 0} aria-label={`Previous ${label.toLowerCase()} page`} onClick={() => change(current - 1)}>←</button><span aria-live="polite" aria-atomic="true">{label} {current + 1} / {pages.length}</span><button disabled={current + 1 === pages.length} aria-label={`Next ${label.toLowerCase()} page`} onClick={() => change(current + 1)}>→</button></div>}</div>;
}
