export default function robots() { return { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/admin', '/login', '/auth'] }, sitemap: 'https://bartconsedine.com/sitemap.xml' }; }
