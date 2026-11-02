// Only our reviewed OAuth and TV consent pages support login continuation.
// Never redirect to external URLs, protocol-relative paths or arbitrary admin APIs.
export function loginReturn(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\\]/.test(value)) return '/admin';
  try {
    const url = new URL(value, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid' || !['/auth/robot-party/authorize', '/auth/tv', '/auth/qr'].includes(url.pathname) || url.hash) return '/admin';
    if (url.pathname === '/auth/qr' && ([...url.searchParams.keys()].some(k => k !== 'request') || url.searchParams.getAll('request').length > 1 || (url.searchParams.has('request') && !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('request'))))) return '/admin';
    if (url.pathname === '/auth/tv' && (
      [...url.searchParams.keys()].some(key => key !== 'code') || url.searchParams.getAll('code').length > 1 ||
      (url.searchParams.has('code') && !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code')))
    )) return '/admin';
    return url.pathname + url.search;
  } catch { return '/admin'; }
}

export const LOGIN_RETURN_COOKIE = 'robot-party-login-return';
