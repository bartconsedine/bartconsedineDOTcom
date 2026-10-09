'use client';

import { useState } from 'react';
import { work } from '@/lib/content';

export default function WorkGrid() {
  const [filter, setFilter] = useState('All work');
  const items = work.filter(item => filter === 'All work' || item.category === filter);
  return <>
    <div className="work-filters" aria-label="Filter selected work">{['All work', 'Engineering', 'Growth'].map(label => <button key={label} type="button" aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</div>
    <p className="sr-only" aria-live="polite">Showing {items.length} work highlights</p>
    <div className="work-grid">{items.map(item => <article className={`work-card ${item.id}`} key={item.id} aria-label={`${item.company}: ${item.role}`}>
      <div className="work-art" aria-hidden="true"><span className="art-label">{item.company}</span><div className="art-shape"><i/><i/><i/></div><span className="art-number">{item.number} / SELECTED WORK</span></div>
      <div className="work-copy"><p className="eyebrow">{item.role}</p><h3>{item.title}</h3><p>{item.description}</p><div className="tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div><details><summary>About this work <span aria-hidden="true">+</span></summary><p>{item.detail}</p></details></div>
    </article>)}</div>
  </>;
}
