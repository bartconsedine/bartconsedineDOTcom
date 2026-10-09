import { work } from '@/lib/content';

export default function WorkGrid() {
  return <div className="experience-list">{work.map(item => <article className="experience" key={item.id} aria-label={`${item.company}: ${item.role}`}>
    <div className="experience-identity"><h3>{item.company}</h3><p>{item.role}</p></div>
    <div className="experience-description"><p>{item.description}</p><details><summary>Read more <span aria-hidden="true">+</span></summary><div className="experience-detail"><p>{item.detail}</p><p className="experience-tools">{item.tags.join(' / ')}</p></div></details></div>
  </article>)}</div>;
}
