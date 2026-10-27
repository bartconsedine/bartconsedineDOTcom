'use client';

import { useState } from 'react';
import { buildOptions, labelDate, places, project, routeFor, sources } from './options.js';
import { coastline } from './coastline.js';

function Map({ option, dayIndex, onDay, zoom, setZoom }) {
  const active = option.days[dayIndex].place;
  const route = routeFor(option);
  const keys = [...new Set(route)];
  return <section className="jo-map-panel" aria-label="Interactive itinerary map">
    <div className="jo-map-tools"><span>JAPAN · {zoom ? 'HOKKAIDO DETAIL' : 'FULL ROUTE'}</span><button onClick={() => setZoom(!zoom)}>{zoom ? 'Show Japan' : 'Zoom to Hokkaido'}</button></div>
    <svg className="jo-map" viewBox={zoom ? '835 180 260 180' : '620 70 600 950'} aria-label={`Route for ${option.title}; use the location buttons below to select a stop`} role="img">
      <rect x="0" y="0" width="1500" height="1600" fill="#102733"/>
      {coastline.map((ring, index) => <path key={index} d={ring.map(([lon, lat], i) => `${i ? 'L' : 'M'}${project(lon, lat).join(',')}`).join(' ') + 'Z'} fill="#29454d" stroke="#527079" strokeWidth="1"/>)}
      <polyline points={route.map(key => project(places[key].lon, places[key].lat).join(',')).join(' ')} fill="none" stroke="#b4d6d5" strokeWidth={zoom ? 1.3 : 2.5} strokeDasharray={zoom ? '4 4' : '9 8'}/>
      {keys.filter(key => !zoom || key !== 'T').map(key => {
        const [x, y] = project(places[key].lon, places[key].lat);
        return <g key={key}><circle cx={x} cy={y} r={active === key ? zoom ? 6 : 12 : zoom ? 4 : 8} fill={places[key].color} stroke={active === key ? '#fff' : '#102733'} strokeWidth={zoom ? 1.5 : 3}/>{(!zoom || keys.length < 4) && <text x={x + (zoom ? 8 : 18)} y={y - (zoom ? 9 : 16)} fill="#eef7f4" fontSize={zoom ? 9 : 22}>{places[key].name}</text>}</g>;
      })}
      {!zoom && <><text x="720" y="500" fill="#93aeb9" fontSize="22">HND ↔ CTS</text><text x="720" y="535" fill="#93aeb9" fontSize="16">Proposed domestic flights</text></>}
    </svg>
    <div className="jo-map-key" aria-label="Select map location">{keys.map(key => <button key={key} aria-pressed={active === key} onClick={() => onDay(option.days.findIndex(d => d.place === key))}><i style={{ background: places[key].color }}/>{places[key].name}</button>)}</div>
    <p className="jo-caption">Geographic overview · lines connect destinations, not roads or flight tracks. Natural Earth public-domain coastline.</p>
  </section>;
}

export default function OptionExplorer({ plan }) {
  const options = buildOptions(plan);
  const [selected, setSelected] = useState('balanced');
  const [dayIndex, setDayIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [minimum, setMinimum] = useState(0);
  const option = options.find(o => o.id === selected) ?? options[0];
  if (!option) return <section className="jp-empty"><h3>Options need the reviewed trip dates</h3><p>These ten proposals cover January 27–February 5, 2027. Your editor dates differ. Check Trip settings against your flight evidence; proposals do not shift bookings automatically.</p></section>;
  const day = option.days[dayIndex];
  const choose = id => { setSelected(id); setDayIndex(0); };
  const visible = options.filter(o => o.riding >= minimum);
  return <section className="jo">
    <div className="jo-heading"><p className="jp-kicker">TEN WAYS TO JAPOW</p><h3>Find your kind of Japan.</h3><p>Compare time on snow, time in the city, and the effort of moving between them.</p></div>
    <div className="jo-flight"><strong>Flight anchors · all times local</strong><span>Jan 27 · JFK 12:30 → Jan 28 · HND 16:55</span><span>Feb 5 · HND 11:05 → JFK 10:00, same date</span><small>American / Japan Airlines · saved flight evidence · On request; ticket issuance unverified.</small></div>
    <p className="jo-notice">All ten are proposals, not reservations. Eight hotel nights: Jan 28–Feb 4. Every route sleeps in Tokyo Feb 4. Domestic flights, hotels, passes and transfers need availability checks; costs are unknown. Browsing does not change your saved plan.</p>
    <div className="jo-layout">
      <aside className="jo-options"><label className="jp-field"><span>Minimum full riding days</span><select value={minimum} onChange={e => { const next = Number(e.target.value); setMinimum(next); if (option.riding < next) choose(options.find(o => o.riding >= next).id); }}><option value="0">All ten options</option><option value="3">3 or more days</option><option value="4">4 or more days</option><option value="5">5 days</option></select></label><label className="jp-field jo-mobile-picker"><span>Choose itinerary</span><select value={selected} onChange={e => choose(e.target.value)}>{visible.map(o => <option key={o.id} value={o.id}>{o.title} · {o.riding} riding days</option>)}</select></label><p className="jo-caption">{visible.length} options · select to explore</p>
        {visible.map(o => <button className="jo-option" key={o.id} aria-pressed={o.id === selected} onClick={() => choose(o.id)}><small>{String(options.indexOf(o) + 1).padStart(2, '0')} · {o.tag}</small><strong>{o.title}</strong><span>{o.riding} riding days · {o.tokyo} Tokyo nights</span><span>{o.complexity} transfer complexity</span></button>)}
      </aside>
      <div className="jo-detail">
        <header className="jo-title"><p className="jp-kicker">{option.tag}</p><h3>{option.title}</h3><p>{option.summary}</p></header>
        <Map option={option} dayIndex={dayIndex} onDay={setDayIndex} zoom={zoom} setZoom={setZoom}/>
        <div className="jo-night-bars" aria-label="Nights by location">{Object.keys(places).filter(key => option.nights.includes(key)).map(key => <div key={key} style={{ flex: [...option.nights].filter(p => p === key).length, borderColor: places[key].color }}><strong>{[...option.nights].filter(p => p === key).length} nights</strong><span>{places[key].name}</span></div>)}</div>
        <section className="jp-panel"><div className="jo-timeline-heading"><h4>Day-by-day timeline</h4><span>Japan local time · proposed windows</span></div><div className="jo-days">{option.days.map((d, index) => <button key={d.date} aria-pressed={dayIndex === index} onClick={() => setDayIndex(index)} style={{ borderBottomColor: places[d.place].color }}><span>{labelDate(d.date)}</span><strong>{places[d.place].name.split(' /')[0]}</strong><small>{d.riding ? 'Ride' : d.transfer ? 'Travel' : index === 0 ? 'Arrive' : 'City'}</small></button>)}</div>
          <label className="jp-field"><span>Scrub timeline · {labelDate(day.date)} · {places[day.place].name}</span><input type="range" min="0" max="7" step="1" value={dayIndex} onChange={e => setDayIndex(Number(e.target.value))}/></label>
          <div className="jo-day-detail" aria-live="polite"><h4>{labelDate(day.date)} · {places[day.place].name}</h4>{day.blocks.map(([time, text]) => <div className="jo-time" key={time}><time>{time}</time><p>{text}</p></div>)}<p className="jo-sleep">Sleep: {places[day.place].name} · lodging unbooked</p></div>
        </section>
        <div className="jp-columns"><section className="jp-panel"><h4>Why choose it</h4><ul>{option.pros.map(p => <li key={p}>{p}</li>)}</ul></section><section className="jp-panel"><h4>The tradeoffs</h4><ul>{option.cons.map(p => <li key={p}>{p}</li>)}</ul></section></div>
        <details className="jp-panel"><summary>Planning assumptions & sources · checked Oct 26, 2026</summary><p>Full riding days exclude every flight and hotel-move day. A Tokyo overnight reduces connection pressure but does not guarantee recovery from a cancellation. Return as early as practical on your selected return day. Jan 27 is the outbound aircraft night; Feb 5 is departure and arrival home.</p><p>Domestic flight windows are planning targets, not airline schedules. Niseko’s operator currently lists a 45-minute minimum domestic-arrival connection; allow more for snowboard baggage and winter disruption. Exact services must be matched to the flight you select. Rail seats and local transfers must also be checked for the chosen dates.</p>{sources.map(([name, url]) => <a className="jp-text-link" key={url} href={url} target="_blank" rel="noreferrer">{name} ↗</a>)}</details>
      </div>
    </div>
    <details className="jp-panel"><summary>Compare all ten at a glance</summary><div className="jo-table-wrap"><table><caption>Counts exclude transfer days; costs remain unquoted.</caption><thead><tr><th>Option</th><th>Full riding days</th><th>Tokyo nights</th><th>Hotel moves</th><th>Return to Tokyo</th></tr></thead><tbody>{options.map(o => <tr key={o.id}><th><button onClick={() => { setMinimum(0); choose(o.id); }}>{o.title}</button></th><td>{o.riding}</td><td>{o.tokyo}</td><td>{o.moves}</td><td>{labelDate(o.days.find(d => d.transfer && d.place === 'T').date)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
