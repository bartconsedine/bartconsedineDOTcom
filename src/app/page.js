import Link from 'next/link';
import WorkGrid from '@/components/work-grid';
import './portfolio.css';

export default function Home() {
  return <div className="portfolio">
    <header className="folio-header folio-width">
      <Link className="folio-signature" href="/" aria-label="Bart Consedine home">bc.</Link>
      <nav aria-label="Main navigation"><a href="#about">About</a><a href="#work">Work</a><a href="#contact">Contact</a></nav>
    </header>
    <main id="main">
      <section className="folio-hero folio-width" aria-labelledby="intro-title">
        <h1 id="intro-title">Bart <span>Consedine</span></h1>
        <div className="hero-stage">
          <div className="hero-statement"><h2>Leading AI <br/>Engineering <br/>at Magnite</h2><a className="folio-link hero-index" href="#work">Explore my work</a></div>
          <figure className="folio-portrait"><img src="/images/headshot-cutout.png" alt="Bart Consedine" width="1254" height="1254" fetchPriority="high"/></figure>
        </div>
      </section>
      <section id="about" className="folio-about folio-width">
        <div className="folio-section-label"><span aria-hidden="true">01</span><h2>About</h2></div>
        <div className="folio-bio">
          <p className="bio-lead">Bart leads AI for Engineering at Magnite, helping teams put AI to work in the products they build and the way they build them. His work spans AI adoption across engineering, agents in Magnite’s ad tech products, and internal tools that make everyday work easier.</p>
          <p>His career spans digital advertising, software engineering, and business strategy. After beginning in ad tech and transitioning into software development, Bart earned his MBA at NYU and joined EY-Parthenon’s Software Strategy Group, conducting technical due diligence for private equity M&amp;A transactions. He assessed software architectures, engineering teams, and technology risk before joining Magnite as Chief of Staff to the CTO. That role grew into his current leadership of engineering AI initiatives.</p>
          <a className="folio-link" href="https://www.linkedin.com/in/bartconsedine">More on LinkedIn</a>
        </div>
      </section>
      <section id="work" className="folio-work folio-width">
        <div className="folio-section-label"><span aria-hidden="true">02</span><h2>Earlier work</h2></div>
        <WorkGrid/>
      </section>
      <section id="contact" className="folio-contact folio-width">
        <div className="folio-section-label"><span aria-hidden="true">03</span><h2>Contact</h2></div>
        <div className="contact-body"><a className="contact-title" href="mailto:bartconsedine@gmail.com">Let’s talk.</a><div className="contact-methods"><a className="folio-link" href="mailto:bartconsedine@gmail.com">bartconsedine@gmail.com</a><a className="folio-link" href="https://www.linkedin.com/in/bartconsedine">LinkedIn</a></div></div>
      </section>
    </main>
    <footer className="folio-footer folio-width"><span>© {new Date().getFullYear()} Bart Consedine</span><Link href="/login">Private workspace</Link></footer>
  </div>;
}
