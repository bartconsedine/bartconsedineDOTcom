'use client';

import { useEffect, useRef, useState } from 'react';
import { emptyPlan, MAX_BYTES, metrics, STATUSES, validatePlan } from './model';
import './trip.css';
import OptionExplorer from './option-explorer.js';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const dateLabel = value => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Dates to decide';
const newId = () => crypto.randomUUID();
function Field({ label, value, onChange, type = 'text', ...props }) {
  return <label className="jp-field"><span>{label}</span><input type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} {...props}/></label>;
}
function Notes({ label, value, onChange, maxLength = 3000 }) {
  return <label className="jp-field jp-wide"><span>{label}</span><textarea value={value} maxLength={maxLength} rows={3} onChange={event => onChange(event.target.value)}/></label>;
}

export default function JapanTrip({ workspaceOwner, permission = 'owner' } = {}) {
  const endpoint = '/api/admin/apps/japan-trip' + (workspaceOwner ? `?owner=${encodeURIComponent(workspaceOwner)}` : '');
  const readOnly = permission === 'viewer';
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [filter, setFilter] = useState('All');
  const [undo, setUndo] = useState(null);
  const [importing, setImporting] = useState(null);
  const fileInput = useRef(null);
  const busy = useRef(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load your plan. Check your sign-in and database connection, then retry.');
      const data = await response.json();
      const value = data.plan ? validatePlan(data.plan) : emptyPlan();
      setPlan(value); setSavedAt(data.updatedAt); setDirty(!readOnly && Boolean(data.plan && !data.updatedAt));
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function change(next) {
    if (readOnly) return;
    setPlan(next); setDirty(true); setMessage(''); setError('');
  }
  function patch(key, value) { change({ ...plan, [key]: value }); }
  function update(group, id, key, value) {
    patch(group, plan[group].map(row => row.id === id ? { ...row, [key]: value } : row));
  }
  function remove(group, id) {
    setUndo({ group, row: plan[group].find(row => row.id === id), index: plan[group].findIndex(row => row.id === id) });
    patch(group, plan[group].filter(row => row.id !== id));
  }
  async function save() {
    if (busy.current || readOnly) return;
    setError(''); setMessage('');
    try { validatePlan(plan); } catch (failure) { setError(failure.message); return; }
    busy.current = true; setSaving(true);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, expectedAt: savedAt }) });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(response.status === 400 || response.status === 413 || response.status === 409 ? data.error : 'Save failed. Your edits are still here. Check your sign-in and database connection, then retry.');
      }
      const data = await response.json();
      setDirty(false); setUndo(null); setSavedAt(data.updatedAt); setMessage('Saved to your private workspace.');
    } catch (failure) { setError(failure.message); }
    finally { busy.current = false; setSaving(false); }
  }
  async function readImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      if (file.size > MAX_BYTES) throw new Error('Import is too large.');
      setImporting(validatePlan(JSON.parse(await file.text())));
    } catch (failure) { setError(failure instanceof SyntaxError ? 'Choose a valid Japan plan JSON export.' : failure.message); }
  }
  function exportPlan() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'japan-trip.json'; link.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <section className="jp-loading" role="status">Loading your Japan plan…</section>;
  if (!plan) return <section className="jp-loading"><p role="alert">{error}</p><button onClick={load}>Retry loading</button></section>;
  const stats = metrics(plan);
  const openTasks = plan.tasks.filter(task => !task.done);
  const risks = plan.days.filter(day => day.risk.trim());
  const sortedDays = [...plan.days].sort((a, b) => a.date.localeCompare(b.date));
  const countDays = plan.start && plan.end ? Math.round((Date.parse(plan.end) - Date.parse(plan.start)) / 86400000) + 1 : null;

  return <div className="jp">
    <section className="jp-hero">
      <div className="jp-sun" aria-hidden="true"/>
      <div className="jp-hero-copy"><p className="jp-kicker">YOUR NEXT ADVENTURE · 日本</p><h2>{plan.title}</h2><p>{plan.start ? `${dateLabel(plan.start)} – ${dateLabel(plan.end)}, ${plan.end ? plan.end.slice(0, 4) : plan.start.slice(0, 4)}` : 'A little Tokyo. A lot of powder.'} · {plan.travelers} {plan.travelers === 1 ? 'traveler' : 'travelers'}</p></div>
      <div className="jp-route" aria-hidden="true"><span>NYC</span><i/><span>TOKYO</span><i/><span>HOKKAIDO</span></div>
    </section>
    <div className="jp-toolbar">
      <p role="status">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved ${new Date(savedAt).toLocaleString()}` : 'Start your plan or import a snapshot'}</p>
      <button className="jp-primary" disabled={saving || !dirty || readOnly} onClick={save}>{saving ? 'Saving…' : error && dirty ? 'Retry save' : 'Save changes'}</button>
    </div>
    {error && <p className="jp-alert" role="alert">{error}</p>}
    {message && <p className="jp-success" role="status">{message}</p>}
    {undo && <div className="jp-alert">Entry removed. <button disabled={saving} onClick={() => { const rows = [...plan[undo.group]]; rows.splice(undo.index, 0, undo.row); patch(undo.group, rows); setUndo(null); }}>Undo removal</button></div>}
    <nav className="jp-tabs" aria-label="Trip sections">{['Overview', 'Explore 10 options', 'Itinerary', 'Bookings', 'Checklist', 'Trip settings'].map(name => <button key={name} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}>{name}</button>)}</nav>
    {readOnly && <p className="jp-alert">View-only access · You can browse this shared plan. Only its owner and invited editors can save changes.</p>}
    {tab === 'Explore 10 options' && <OptionExplorer plan={plan}/>}
    <fieldset className="jp-editor" disabled={saving || readOnly}>
      {tab === 'Overview' && <>
        <section className="jp-panel"><p className="jp-kicker">COMPARE YOUR ROUTES</p><h3>Ten ways to spend your Japan trip</h3><p>Explore maps, daily timelines, riding days and the tradeoffs of each itinerary.</p><button onClick={() => setTab('Explore 10 options')}>Browse 10 itineraries</button></section>
        <div className="jp-metrics">{[[countDays ?? '—', 'Trip days'], [stats.riding, 'Full riding days'], [`${stats.booked}/${stats.total}`, 'Bookings confirmed'], [money(stats.forecast), stats.unpriced ? 'Known costs · USD' : 'Forecast · USD']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        {!plan.days.length && !plan.bookings.length && <section className="jp-empty"><h3>Your trip starts here.</h3><p>Import your reviewed trip snapshot, or add your dates, flights and first decisions.</p><button onClick={() => fileInput.current?.click()}>Import plan</button><button onClick={() => setTab('Trip settings')}>Set trip dates</button></section>}
        <div className="jp-columns">
          <section className="jp-panel"><p className="jp-kicker">NEXT UP</p><h3>Make it happen</h3>{stats.next ? <div className="jp-next"><strong>{stats.next.item}</strong><span>{dateLabel(stats.next.due)} · {stats.next.status}</span><p>{stats.next.notes}</p></div> : <p>No open booking deadlines. Add one in Bookings.</p>}{stats.overdue.length > 0 && <p className="jp-warning">{stats.overdue.length} open booking {stats.overdue.length === 1 ? 'deadline has' : 'deadlines have'} passed.</p>}<ul className="jp-list">{openTasks.slice(0, 4).map(task => <li key={task.id}><label><input type="checkbox" checked={task.done} onChange={event => update('tasks', task.id, 'done', event.target.checked)}/>{task.title}</label></li>)}</ul><button onClick={() => setTab('Checklist')}>Open checklist</button></section>
          <section className="jp-panel"><p className="jp-kicker">THE NUMBERS</p><h3>Room for adventure</h3><dl className="jp-budget"><div><dt>Target · whole trip</dt><dd>{plan.budget ? money(plan.budget) : 'Not set'}</dd></div><div><dt>Estimated</dt><dd>{money(stats.estimated)}</dd></div><div><dt>Actual costs entered</dt><dd>{money(stats.actual)}</dd></div><div><dt>Forecast per traveler</dt><dd>{money(stats.perTraveler)}</dd></div><div className={plan.budget && stats.remaining < 0 ? 'jp-warning' : ''}><dt>{plan.budget && stats.remaining < 0 ? 'Over target' : 'Remaining'}</dt><dd>{plan.budget ? money(Math.abs(stats.remaining)) : 'Set a target'}</dd></div></dl><p className="jp-warning">{stats.unpriced ? `${stats.unpriced} ${stats.unpriced === 1 ? 'item still needs' : 'items still need'} a price. This is a partial forecast.` : ''}</p><p>Forecast uses actual cost where entered, otherwise the estimate. “Not needed” items are excluded. Amounts are USD.</p><button onClick={() => setTab('Bookings')}>Review costs</button></section>
        </div>
        {risks.length > 0 && <section className="jp-panel"><p className="jp-kicker">KEEP AN EYE ON</p><h3>Timing & open questions</h3><ul className="jp-list">{risks.map(day => <li key={day.id}><strong>{dateLabel(day.date)} · {day.location}</strong><p>{day.risk}</p></li>)}</ul></section>}
        <section className="jp-panel"><h3>Planning notebook</h3><Notes label="Ideas, restaurants, links to research and decisions" value={plan.notes} maxLength={16000} onChange={value => patch('notes', value)}/></section>
      </>}
      {tab === 'Itinerary' && <>
        <div className="jp-section-heading"><div><h3>Day by day</h3><p>Times are local to each location. Mark only full days as riding days.</p></div><button onClick={() => patch('days', [...plan.days, { id: newId(), date: plan.start || '', location: '', morning: '', afternoon: '', evening: '', sleep: '', risk: '', riding: false }])}>Add day</button></div>
        {!sortedDays.length && <p className="jp-empty">No itinerary yet. Add the arrival day, then build around your flights.</p>}
        {sortedDays.map(day => <details className="jp-entry" key={day.id}><summary><span className="jp-date">{dateLabel(day.date)}</span><strong>{day.location || 'New day'}</strong><span>{day.riding ? 'Riding day' : day.sleep || 'Plan the day'}</span></summary><div className="jp-entry-body"><div className="jp-form-grid"><Field label="Date" type="date" value={day.date} onChange={value => update('days', day.id, 'date', value)}/><Field label="Location" value={day.location} maxLength={120} onChange={value => update('days', day.id, 'location', value)}/>{['morning', 'afternoon', 'evening', 'sleep', 'risk'].map(key => <Field key={key} label={key === 'risk' ? 'Timing risk / open question' : key[0].toUpperCase() + key.slice(1)} value={day[key]} maxLength={1500} onChange={value => update('days', day.id, key, value)}/>)}</div><label className="jp-check"><input type="checkbox" checked={day.riding} onChange={event => update('days', day.id, 'riding', event.target.checked)}/>Full riding day</label><button className="jp-remove" onClick={() => remove('days', day.id)}>Remove day</button></div></details>)}
      </>}
      {tab === 'Bookings' && <>
        <div className="jp-section-heading"><div><h3>From maybe to booked</h3><p>Flights, stays, transfers, lift passes and daily spending. Confirmation codes stay private.</p></div><button onClick={() => patch('bookings', [...plan.bookings, { id: newId(), item: '', status: 'Not started', due: '', provider: '', estimate: null, actual: null, confirmation: '', url: '', notes: '' }])}>Add booking / cost</button></div>
        <label className="jp-filter">Show <select value={filter} onChange={event => setFilter(event.target.value)}><option>All</option><option>Open</option>{STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
        {!plan.bookings.length && <p className="jp-empty">No bookings yet. Add your flight first, including its current confirmation status.</p>}
        {plan.bookings.filter(row => filter === 'All' || (filter === 'Open' ? !['Booked', 'Not needed'].includes(row.status) : row.status === filter)).map(row => <details className="jp-entry" key={row.id}><summary><strong>{row.item || 'New booking'}</strong><span className={`jp-status ${row.status === 'Booked' ? 'jp-confirmed' : ''}`}>{row.status}</span><span>{row.actual === null && row.estimate === null ? 'Cost to confirm' : money(row.actual ?? row.estimate)}</span></summary><div className="jp-entry-body"><div className="jp-form-grid"><Field label="Booking / cost" value={row.item} maxLength={160} onChange={value => update('bookings', row.id, 'item', value)}/><label className="jp-field"><span>Status</span><select value={row.status} onChange={event => update('bookings', row.id, 'status', event.target.value)}>{STATUSES.map(status => <option key={status}>{status}</option>)}</select></label><Field label="Decision deadline" type="date" value={row.due} onChange={value => update('bookings', row.id, 'due', value)}/><Field label="Provider / route" value={row.provider} maxLength={200} onChange={value => update('bookings', row.id, 'provider', value)}/><Field label="Estimate · USD (blank if unknown)" type="number" min="0" step="0.01" value={row.estimate} onChange={value => update('bookings', row.id, 'estimate', value === '' ? null : Number(value))}/><Field label="Actual · USD (blank if unknown)" type="number" min="0" step="0.01" value={row.actual} onChange={value => update('bookings', row.id, 'actual', value === '' ? null : Number(value))}/><Field label="Confirmation code(s)" value={row.confirmation} maxLength={200} onChange={value => update('bookings', row.id, 'confirmation', value)}/><Field label="Provider link · HTTPS" type="url" value={row.url} maxLength={2000} onChange={value => update('bookings', row.id, 'url', value)}/><Notes label="Flight times, cancellation policy and next steps" value={row.notes} onChange={value => update('bookings', row.id, 'notes', value)}/></div>{row.url.startsWith('https://') && <a className="jp-text-link" href={row.url} target="_blank" rel="noreferrer">Open provider</a>}<button className="jp-remove" onClick={() => remove('bookings', row.id)}>Remove booking</button></div></details>)}
      </>}
      {tab === 'Checklist' && <>
        <div className="jp-section-heading"><div><h3>Before you go</h3><p>{plan.tasks.length - openTasks.length} of {plan.tasks.length} complete · packing, reservations and loose ends</p></div><button onClick={() => patch('tasks', [...plan.tasks, { id: newId(), title: '', due: '', done: false }])}>Add task</button></div>
        {!plan.tasks.length && <p className="jp-empty">Add the things you need to arrange, check or pack.</p>}
        {plan.tasks.map(task => <div className="jp-task" key={task.id}><label className="jp-check"><input type="checkbox" aria-label={`Complete ${task.title || 'new task'}`} checked={task.done} onChange={event => update('tasks', task.id, 'done', event.target.checked)}/></label><Field label="Task" value={task.title} maxLength={500} onChange={value => update('tasks', task.id, 'title', value)}/><Field label="Due" type="date" value={task.due} onChange={value => update('tasks', task.id, 'due', value)}/><button className="jp-remove" onClick={() => remove('tasks', task.id)} aria-label={`Remove ${task.title || 'new task'}`}>Remove</button></div>)}
      </>}
      {tab === 'Trip settings' && <>
        <section className="jp-panel"><h3>The shape of your trip</h3><div className="jp-form-grid"><Field label="Trip name" value={plan.title} maxLength={120} onChange={value => patch('title', value)}/><Field label="Travelers" type="number" min="1" max="20" step="1" value={plan.travelers} onChange={value => patch('travelers', Number(value))}/><Field label="Departure date" type="date" value={plan.start} onChange={value => patch('start', value)}/><Field label="Return date" type="date" value={plan.end} onChange={value => patch('end', value)}/><Field label="Target budget · whole trip · USD" type="number" min="0" step="0.01" value={plan.budget} onChange={value => patch('budget', Number(value))}/></div></section>
        <section className="jp-panel"><h3>Source & transfers</h3><p>Keep the canonical Sheet linked here. Imports are reviewed snapshots; edits here do not update the Sheet. Recheck older fares and schedules before booking.</p><div className="jp-form-grid"><Field label="Canonical trip Sheet · HTTPS" type="url" value={plan.sourceUrl} maxLength={2000} onChange={value => patch('sourceUrl', value)}/><Field label="Source last read" type="date" value={plan.sourceReadAt} onChange={value => patch('sourceReadAt', value)}/></div><div className="jp-actions"><button onClick={() => fileInput.current?.click()}>Import plan JSON</button><button onClick={exportPlan}>Export current plan{dirty ? ' (includes unsaved edits)' : ''}</button></div><p>Import replaces this planning document after review. Save to confirm it in Supabase. You can also update this plan from chat. Reload to see those changes; saving an older copy is blocked. Export unsaved edits before reloading to reconcile a conflict.</p></section>
      </>}
      {importing && <section className="jp-import" role="region" aria-label="Review import"><h3>Review import: {importing.title}</h3><p>{dateLabel(importing.start)} – {dateLabel(importing.end)} · {importing.days.length} days · {importing.bookings.length} bookings · {importing.tasks.length} tasks</p><p>This replaces the current editor, including unsaved edits. The database changes only when you save.</p><button className="jp-primary" onClick={() => { change(importing); setImporting(null); setUndo(null); setTab('Overview'); }}>Use this plan</button><button onClick={() => setImporting(null)}>Cancel import</button></section>}
      <input ref={fileInput} type="file" accept="application/json,.json" aria-label="Import Japan plan JSON" className="sr-only" tabIndex={-1} onChange={readImport}/>
    </fieldset>
    <footer className="jp-footer"><span>{permission === 'owner' ? 'Your private app · Shared only with people you invite' : 'Shared app · Access is controlled by its owner'}</span>{plan.sourceUrl.startsWith('https://') && <a href={plan.sourceUrl} target="_blank" rel="noreferrer">Open canonical Sheet{plan.sourceReadAt ? ` · snapshot read ${dateLabel(plan.sourceReadAt)}` : ''}</a>}</footer>
  </div>;
}
