'use client';
import { useFormStatus } from 'react-dom';
import { signInWithGoogle } from './actions';

function GoogleButton({ configured }) {
  const { pending } = useFormStatus();
  return <button className="button dark" disabled={!configured || pending}><span aria-hidden="true">G</span>{pending ? 'Opening Google…' : 'Continue with Google'}<span aria-hidden="true">↗</span></button>;
}
export default function LoginForm({ configured }) {
  return <form action={signInWithGoogle} className="login-form"><GoogleButton configured={configured}/></form>;
}
