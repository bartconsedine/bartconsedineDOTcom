'use client';
import { useState } from 'react';
export default function TvConsent({ code, confirmation, devices = [] }) {
  const [approved, setApproved] = useState(false);
  const [removed, setRemoved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(value) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/tv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Update failed. Retry.');
      if (value.action === 'approve' && data.approved) setApproved(true);
      else if (value.action === 'revoke' && data.revoked) setRemoved(current => [...current, value.id]);
      else throw Error('The server did not confirm your update. Retry.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <>
    {code && (approved ? <div role="status"><h2>TV connected.</h2><p>Your morning feed will appear on the TV automatically. You can close this page.</p></div> : <><h2>Connect this TV?</h2><p>Only approve if you started this request and the code on your TV matches:</p><p className="tv-code">{confirmation}</p><p>This TV can read your saved Morning signal feed for 30 days. It cannot edit your feed or open other workspace apps.</p><button disabled={busy} onClick={() => send({ action: 'approve', code })}>{busy ? 'Connecting…' : 'Approve TV'}</button><p><a href="/admin/apps/morning-feed">Cancel and return to your morning</a></p></>)}
    <h2>Connected TVs</h2><p>You can disconnect a screen here at any time. Its next refresh will end access.</p>
    {devices.filter(device => !removed.includes(device.id)).length ? <ul>{devices.filter(device => !removed.includes(device.id)).map(device => <li key={device.id}><strong>TV {device.code}</strong><span> · expires {new Date(device.expiresAt).toLocaleDateString('en-US', { timeZone: 'UTC' })} </span><button disabled={busy} onClick={() => send({ action: 'revoke', id: device.id })}>Disconnect TV {device.code}</button></li>)}</ul> : <p>No previously connected TVs.</p>}
    {error && <p role="alert">{error}</p>}
  </>;
}
