'use client';

import { useEffect, useState } from 'react';
import { blankListing, checkoutLink, checks, listingText, MAX_LISTINGS, omarchyGuide, priceLabel, SLUG, software, stages } from './model';
import styles from './screen.module.css';

export default function LaptopSales({ workspaceOwner, permission = 'owner' }) {
  const endpoint = `/api/admin/apps/${SLUG}?owner=${encodeURIComponent(workspaceOwner)}`;
  const [snapshot, setSnapshot] = useState(null);
  const [selection, setSelection] = useState(null);
  const [form, setForm] = useState(null);
  const [loadAttempt, retryLoad] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');
  const canEdit = permission !== 'viewer';

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw Error();
        const result = await response.json();
        if (!controller.signal.aborted) setSnapshot(result);
      } catch {
        if (!controller.signal.aborted) setNotice({ error: true, text: 'Could not load inventory from Supabase.' });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [endpoint, loadAttempt]);

  function open(item, editMode = false) {
    if (form && !window.confirm('Discard the unsaved listing edits?')) return;
    setSelection(item?.id ?? null);
    setForm(editMode && canEdit ? { ...(item ?? blankListing) } : null);
    setNotice(null);
    setCopyStatus('');
  }

  function edit(field, value) {
    setForm(current => ({ ...current, [field]: value }));
    setCopyStatus('');
  }

  async function save(event) {
    event.preventDefault();
    const next = { ...form, id: selection ?? crypto.randomUUID() };
    const listings = selection
      ? snapshot.listings.map(item => item.id === selection ? next : item)
      : [...snapshot.listings, next];
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listings, expectedAt: snapshot.updatedAt }),
      });
      const data = await response.json();
      if (!response.ok) throw Error([400, 409].includes(response.status) ? data.error : 'Save failed. Your edits are still here. Try again.');
      setSnapshot(current => ({ ...current, ...data }));
      setSelection(next.id);
      setForm(null);
      setNotice({ text: 'Saved to Supabase.' });
    } catch (error) {
      setNotice({ error: true, text: error instanceof SyntaxError ? 'Save failed. Your edits are still here. Try again.' : error.message });
    } finally {
      setSaving(false);
    }
  }

  const listings = snapshot?.listings ?? [];
  const selected = listings.find(item => item.id === selection);
  const shareText = selected?.stage === 'ready' && snapshot.supportEmail && !form
    ? listingText(selected, snapshot.supportEmail) : '';
  const counts = Object.fromEntries(Object.keys(stages).map(stage => [stage, listings.filter(item => item.stage === stage).length]));
  const fields = [
    ['model', 'Laptop model', 'e.g. Lenovo ThinkPad T480', 100],
    ['specs', 'Hardware specs', 'CPU, RAM, storage, display, and battery health', 240],
    ['condition', 'Condition and included accessories', 'List wear, faults, charger, and any missing parts', 500],
    ['price', 'Price in USD', '249.00', 9],
    ['checkout', 'Live Stripe payment link', 'https://buy.stripe.com/…', 150],
  ];

  return <div className={styles.workspace}>
    <section className={styles.banner} aria-label="Laptop sales overview">
      <div>
        <p className={styles.kicker}>REFURBISH · LIST · SHIP</p>
        <h2>Give good hardware a second life.</h2>
        <p>Prepare each laptop for a new owner, then share a one-unit checkout link.</p>
      </div>
      <div className={styles.stats} aria-label="Inventory by stage">
        {Object.entries(stages).map(([stage, label]) => <div key={stage}><strong>{snapshot ? counts[stage] : '–'}</strong><span>{label}</span></div>)}
      </div>
    </section>

    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="inventory-heading">
        <div className={styles.heading}>
          <div><p className={styles.kicker}>01 / INVENTORY</p><h2 id="inventory-heading">Laptops</h2></div>
          {canEdit && snapshot && <button className={styles.primary} disabled={saving || listings.length >= MAX_LISTINGS} onClick={() => open(null, true)}>+ Add laptop</button>}
        </div>
        {loading && <p role="status">Loading inventory…</p>}
        {notice && <p className={notice.error ? styles.error : styles.feedback} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
        {!loading && !snapshot && <button className={styles.secondary} onClick={() => {
          setLoading(true);
          setNotice(null);
          retryLoad(value => value + 1);
        }}>Retry loading</button>}
        {snapshot && listings.length === 0 && !form && <div className={styles.empty}><strong>No laptops yet</strong><p>Add a laptop to start its preparation checklist.</p></div>}
        {listings.length > 0 && <ul className={styles.inventory}>{listings.map(item => <li key={item.id}>
          <button className={styles.row} aria-pressed={selection === item.id} disabled={saving} onClick={() => open(item)}>
            <span><strong>{item.model}</strong><small>{item.price ? priceLabel(item.price) : 'Price pending'}</small></span>
            <span className={styles.badge}>{stages[item.stage]}</span>
          </button>
        </li>)}</ul>}
        {form && <form className={styles.form} onSubmit={save}>
          <fieldset disabled={saving}>
            <legend>{selection ? 'Edit laptop' : 'New laptop'}</legend>
            <div className={styles.fields}>{fields.map(([name, label, placeholder, maxLength]) => <label key={name}>
              {label}
              {name === 'condition'
                ? <textarea value={form[name]} placeholder={placeholder} maxLength={maxLength} onChange={event => edit(name, event.target.value)} rows={3}/>
                : <input value={form[name]} placeholder={placeholder} maxLength={maxLength} onChange={event => edit(name, event.target.value)}
                  required={name === 'model'} type={name === 'checkout' ? 'url' : 'text'} inputMode={name === 'price' ? 'decimal' : undefined}/>}
            </label>)}</div>
            <div className={styles.checklist}>
              <h3>Preparation checklist</h3>
              {Object.entries(checks).map(([key, label]) => <label key={key}>
                <input type="checkbox" checked={form.checks[key]} onChange={event => edit('checks', { ...form.checks, [key]: event.target.checked })}/>{label}
              </label>)}
            </div>
            <label>Stage
              <select value={form.stage} onChange={event => edit('stage', event.target.value)}>
                {Object.entries(stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <p>Confirm payment in Stripe before marking paid. Deactivate the link in Stripe if you withdraw a listing.</p>
            <div className={styles.actions}>
              <button className={styles.primary} type="submit">{saving ? 'Saving…' : 'Save laptop'}</button>
              <button className={styles.secondary} type="button" onClick={() => setForm(null)}>Cancel edit</button>
            </div>
          </fieldset>
        </form>}
        {selected && !form && <div className={styles.details}>
          <h3>{selected.model}</h3>
          <p>{[selected.specs, selected.condition].filter(Boolean).join(' · ')}</p>
          {selected.stage === 'ready' && !shareText && <p>Configure the support mailbox before sharing the listing.</p>}
          {shareText && <details>
            <summary>Share listing</summary>
            <label>Customer listing<textarea readOnly rows={8} value={shareText}/></label>
            <button className={styles.secondary} type="button" onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareText);
                setCopyStatus('Listing copied.');
              } catch { setCopyStatus('Select the listing text to copy it.'); }
            }}>Copy listing</button>
            <span className={styles.feedback} role="status">{copyStatus}</span>
          </details>}
          {canEdit && <button className={styles.secondary} onClick={() => open(selected, true)}>Edit laptop</button>}
        </div>}
      </section>

      <aside className={styles.side} aria-label="Sales setup">
        <section className={styles.panel}>
          <p className={styles.kicker}>02 / CHECKOUT</p>
          <h2>One laptop, one link</h2>
          <p>Create a one-time USD payment link for each unit. Set quantity and the payment limit to one, then collect shipping details.</p>
          <a className={styles.link} href={checkoutLink} target="_blank" rel="noreferrer">Open Stripe Payment Links ↗</a>
        </section>
        <section className={styles.panel}>
          <p className={styles.kicker}>03 / EMAIL SUPPORT</p>
          <h2>Support inbox</h2>
          {snapshot?.supportEmail
            ? <p><a className={styles.link} href={`mailto:${snapshot.supportEmail}`}>{snapshot.supportEmail}</a></p>
            : <p>{snapshot ? 'Mailbox setup required.' : loading ? 'Checking mailbox configuration…' : 'Mailbox configuration unavailable.'}</p>}
          <p>Customers can email <strong>Setup</strong>, <strong>Office</strong>, or <strong>Creative</strong> as the subject for an automatic guide. New questions get an acknowledgment. Messages and replies go to your inbox for follow-up.</p>
        </section>
        <section className={styles.panel}>
          <p className={styles.kicker}>04 / INCLUDED SOFTWARE</p>
          <h2>Ready for work and creative projects</h2>
          <dl className={styles.software}>{software.map(([name, purpose]) => <div key={name}><dt>{name}</dt><dd>{purpose}</dd></div>)}</dl>
          <a className={styles.link} href={omarchyGuide} target="_blank" rel="noreferrer">Omarchy first-boot guide ↗</a>
        </section>
      </aside>
    </div>
  </div>;
}
