import { createHash, randomBytes } from 'node:crypto';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

export const flowCookie = '__Host-bc-google-flow';
export const idCookie = '__Host-bc-identity';
export const refreshCookie = '__Host-bc-refresh';
export const secureCookie = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' };
const verifiers = new Map();
const random = () => randomBytes(32).toString('base64url');
const valid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export function beginGoogle(config) {
  const state = random(), nonce = random(), verifier = random();
  const url = new URL('/oauth2/authorize', config.domain);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: config.clientId, redirect_uri: config.callback,
    identity_provider: 'Google', scope: 'openid email profile', state, nonce,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString();
  return { cookie: [state, nonce, verifier].join('.'), url: url.href };
}

export function readGoogleFlow(cookie, state) {
  const parts = typeof cookie === 'string' ? cookie.split('.') : [];
  if (parts.length !== 3 || !parts.every(valid) || !valid(state) || parts[0] !== state) throw Error('Expired Google sign-in');
  return { nonce: parts[1], verifier: parts[2] };
}

export function googleClaims(claims, nonce) {
  const identities = claims.identities;
  if ((nonce !== undefined && claims.nonce !== nonce) || !claims.sub || !claims.origin_jti ||
      typeof claims.email !== 'string' || !claims.email || claims.email_verified !== true ||
      !Array.isArray(identities) || identities.length !== 1 ||
      identities[0].providerName !== 'Google' || identities[0].providerType !== 'Google' ||
      typeof identities[0].userId !== 'string' || !identities[0].userId) throw Error('Unverified Google identity');
  return { email: claims.email.toLowerCase(), subject: identities[0].userId };
}

export async function verifyGoogleToken(config, token, nonce) {
  const key = config.poolId + '/' + config.clientId;
  if (!verifiers.has(key)) verifiers.set(key, CognitoJwtVerifier.create({
    userPoolId: config.poolId, tokenUse: 'id', clientId: config.clientId,
  }));
  const claims = await verifiers.get(key).verify(token);
  return googleClaims(claims, nonce);
}

export async function tokenRequest(config, parameters) {
  const response = await fetch(new URL('/oauth2/token', config.domain), {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ client_id: config.clientId, ...parameters }),
  });
  if (!response.ok) throw Error('Cognito token exchange failed');
  return response.json();
}
