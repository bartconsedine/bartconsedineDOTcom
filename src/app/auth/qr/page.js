import {redirect} from 'next/navigation';
import {serverClient} from '@/lib/supabase';
import {verifyAdmin} from '@/lib/auth-policy';
import {validRequest,qrEnabled,qrCall} from '@/lib/admin-qr/api';
import Consent from './consent';
export const dynamic='force-dynamic';
export const metadata={title:'Approve admin device',robots:{index:false,follow:false}};
export default async function Page({searchParams}){
 const {request:id,result}=await searchParams;
 const enabled=qrEnabled();
 const client=await serverClient(),actor=await verifyAdmin(client);
 if(!actor.ok){if(actor.status===401)redirect(`/login?next=${encodeURIComponent(`/auth/qr${validRequest(id)?`?request=${id}`:''}`)}`);return <main id="main"><h1>Admin verification unavailable</h1><a href="/login">Sign in with your approved Google account</a></main>;}
 let pending,devices,error;
 try{devices=(await qrCall(client.rpc.bind(client),'list',null)).devices;if(id&&enabled){if(!validRequest(id))throw Error();pending=await qrCall(client.rpc.bind(client),'inspect',id);}}
 catch{error='This request expired, was already approved, or could not be loaded. Generate a new request on the target device.';}
 return <main id="main" className="login-page"><div className="login-panel"><h1>Admin device approval</h1>{!enabled&&<p>New admin QR sign-in is disabled. Existing devices can still be revoked here.</p>}<p>Signed in as {actor.user.email}.</p>{result==='relayed'&&<p role="status">Google sign-in returned to the target device. Check its screen to confirm completion.</p>}{result==='declined'&&<p role="status">Sign-in declined. This request cannot grant access.</p>}{result==='failed'&&<p role="alert">Could not relay sign-in. Cancel and start again on the target device.</p>}{error?<p role="alert">{error}</p>:<Consent id={id} pending={pending} devices={devices||[]}/>}<p><a href="/auth/tv">Manage read-only TV screens</a> · <a href="/admin">Back to admin</a></p></div></main>;
}
