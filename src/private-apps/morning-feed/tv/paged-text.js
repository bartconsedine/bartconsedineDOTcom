'use client';
import { useEffect, useRef, useState } from 'react';
import { textPages } from './pagination.js';
export default function PagedText({ text = '', label = 'Summary', onPage }) {
  const pane = useRef(null), measure = useRef(null);
  const [pages, setPages] = useState([text]), [page, setPage] = useState(0);
  useEffect(() => {
    let disposed = false;
    if (!pane.current || !measure.current) return;
    const fit = () => {
      if (disposed) return;
      const height = pane.current.clientHeight;
      if (!height || !pane.current.clientWidth) return;
      const next = textPages(text, value => { measure.current.textContent = value; return measure.current.getBoundingClientRect().height <= height - 2; });
      measure.current.textContent = '';
      setPages(next); setPage(0); onPage?.(0);
    };
    fit(); let frame;
    const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    const observer = new ResizeObserver(resize); observer.observe(pane.current);
    window.addEventListener('resize', resize);
    document.fonts?.ready.then(fit);
    return () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', resize); cancelAnimationFrame(frame); };
  }, [text]);
  const current = Math.min(page, pages.length - 1);
  function change(next) { setPage(next); onPage?.(next); }
  return <div className="tv-paged" aria-label={label}><div ref={pane} className="tv-paged-pane"><div className="tv-paged-copy" data-text-page>{pages[current]}</div><div ref={measure} className="tv-paged-copy tv-paged-measure" aria-hidden="true"/></div><div className="tv-page-controls"><button disabled={current === 0} aria-label={`Previous ${label.toLowerCase()} page`} onClick={() => change(current - 1)}>←</button><span>{label} {current + 1} / {pages.length}</span><button disabled={current + 1 === pages.length} aria-label={`Next ${label.toLowerCase()} page`} onClick={() => change(current + 1)}>→</button></div></div>;
}
