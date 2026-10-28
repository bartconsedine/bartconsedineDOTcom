const config = {
  poweredByHeader: false,
  async redirects() {
    return [{ source: '/resume', destination: '/images/resume.pdf', permanent: false }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }, ...['/auth/qr/:path*', '/api/admin-qr', '/api/admin/qr', '/login/qr'].map(source => ({source, headers:[{key:'Referrer-Policy',value:'no-referrer'}]}))];
  },
};
export default config;
