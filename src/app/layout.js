import './globals.css';

export const metadata = {
  metadataBase: new URL('https://bartconsedine.com'),
  title: { default: 'Barton Consedine | AI, Engineering & Strategy', template: '%s · Barton Consedine' },
  description: 'Barton leads AI for Engineering at Magnite. His work connects AI, software engineering, and business strategy.',
  icons: { icon: '/icon.svg' },
  openGraph: { title: 'Barton Consedine', description: 'AI, engineering, and strategy. Making AI useful in practice.', images: ['/images/headshot.jpeg'], type: 'website' },
};

export default function RootLayout({ children }) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
