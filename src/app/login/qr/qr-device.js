'use client';
import {useEffect,useRef,useState} from 'react';
export default function QrDevice(){
 const [label,setLabel]=useState(''),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false);
 async function call(action){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
 const r=await fetch('/api/admin-qr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(action==='start'?{label}: {})})});const result=await r.json();if(!r.ok)throw Error(result.error);if(result.connected){window.location.assign(result.destination);return;}setData(result.cancelled?null:result);
 }catch(e){setError(e.message);setData(null);}finally{lock.current=false;setBusy(false);}}
 useEffect(()=>{if(!data||!['pending','ready'].includes(data.status))return;const timer=setTimeout(()=>call(data.status==='ready'?'exchange':'poll'),2500);return()=>clearTimeout(timer);},[data]);
 return <div><label>Device name <input maxLength={100} value={label} onChange={e=>setLabel(e.target.value)} placeholder="Living room TV" disabled={!!data||busy}/></label>{!data?<button disabled={busy||!label.trim()} onClick={()=>call('start')}>Generate QR code</button>:<><p>Request code: <strong>{data.confirmation}</strong></p>{data.qr&&<img src={data.qr} width="280" height="280" alt="Scan to review full admin sign-in on your phone"/>}<p>Scan with your signed-in admin phone. Verify the device name and matching request code, then approve full access and choose the same Google account. The request expires in 10 minutes.</p><button disabled={busy} onClick={()=>call('cancel')}>Cancel sign-in</button></>}{error&&<p role="alert">{error}</p>}</div>;
}
