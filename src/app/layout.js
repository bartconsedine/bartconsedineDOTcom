import './globals.css';

export const metadata = {
  metadataBase: new URL('https://bartconsedine.com'),
  title: { default: 'Bart Consedine | Software, growth & the space between', template: '%s · Bart Consedine' },
  description: 'Software engineer, digital marketer, and entrepreneur. A selection of work spanning advertising technology, connected TV, and growth.',
  icons: { icon: '/icon.svg' },
  openGraph: { title: 'Bart Consedine', description: 'Software, growth & the space between.', images: ['/images/headshot.jpeg'], type: 'website' },
};

export default function RootLayout({ children }) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
