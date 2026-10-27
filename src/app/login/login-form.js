'use client';
import { useFormStatus } from 'react-dom';
import { signInWithGoogle } from './actions';

function GoogleButton({ configured }) {
  const { pending } = useFormStatus();
  return <button className="button dark" disabled={!configured || pending}><span aria-hidden="true">G</span>{pending ? 'Opening Google…' : 'Continue with Google'}</button>;
}
export default function LoginForm({ configured, next = '/admin' }) {
  return <form action={signInWithGoogle} className="login-form"><input type="hidden" name="next" value={next}/><GoogleButton configured={configured}/></form>;
}
