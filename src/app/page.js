import Link from 'next/link';
import WorkGrid from '@/components/work-grid';

export default function Home() {
  return <>
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="Bart Consedine home">BC<span> / </span></Link>
      <nav aria-label="Main navigation"><a href="#about">About</a><a href="#work">Work</a><a href="#contact">Contact <span aria-hidden="true">↗</span></a></nav>
    </header>
    <main id="main">
      <section className="hero wrap" aria-labelledby="intro-title">
        <div className="hero-copy"><p className="eyebrow">AI / ENGINEERING / STRATEGY</p><h1 id="intro-title">Bart<br/>Consedine<span className="name-period">.</span></h1><p className="hero-intro">Leading AI Engineering at Magnite</p><div className="hero-links"><a className="button" href="#about">About me <span aria-hidden="true">↓</span></a><a className="hero-text-link" href="#work">Selected work <span aria-hidden="true">↗</span></a></div></div>
        <figure className="portrait-wrap"><img src="/images/headshot.jpeg" alt="Bart Consedine" width="700" height="700" fetchPriority="high"/><figcaption>BART CONSEDINE</figcaption></figure>
      </section>
      <section id="about" className="about wrap">
        <div className="section-label"><p className="eyebrow">01 / ABOUT</p><h2>Technology.<br/>With purpose.</h2></div>
        <div className="about-story">
          <p className="lead">Bart leads AI for Engineering at Magnite, shaping how the company builds with and applies AI. He drives AI adoption across engineering, embeds intelligent agents into Magnite’s ad tech products, and develops internal tools that improve how people and teams work.</p>
          <p>His career spans digital advertising, software engineering, and business strategy. After beginning in ad tech and transitioning into software development, Bart earned his MBA at NYU and joined EY-Parthenon’s Software Strategy Group, conducting technical due diligence for private equity M&amp;A transactions. He assessed software architectures, engineering teams, and technology risk before joining Magnite as Chief of Staff to the CTO. That role grew into his current leadership of engineering AI initiatives.</p>
          <p>Bart brings an engineer’s understanding of how technology works and a strategist’s perspective on where it creates value. His focus is making AI useful in practice, building better products, strengthening engineering capabilities, and helping teams work more effectively.</p>
          <a className="inline-link" href="https://www.linkedin.com/in/bartconsedine">LinkedIn <span aria-hidden="true">↗</span></a>
        </div>
      </section>
      <section id="work" className="work-section wrap"><div className="section-heading"><div><p className="eyebrow">02 / SELECTED WORK</p><h2>Earlier work.</h2></div><p>Products, platforms, and growth.<br/>A selection from across my career.</p></div><WorkGrid/></section>
      <section id="contact" className="contact wrap"><div><p className="eyebrow">03 / CONTACT</p><h2>Let’s connect.</h2></div><div className="contact-links"><a href="mailto:bartconsedine@gmail.com">Email <span aria-hidden="true">↗</span></a><a href="https://www.linkedin.com/in/bartconsedine">LinkedIn <span aria-hidden="true">↗</span></a></div></section>
    </main>
    <footer className="site-footer wrap"><span>© {new Date().getFullYear()} Bart Consedine</span><Link href="/login">Private workspace <span aria-hidden="true">↗</span></Link></footer>
  </>;
}
