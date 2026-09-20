const slots = [
  ["Player testimonial", "Publication pending verified quotation and permission."],
  ["Coach testimonial", "Publication pending verified quotation and permission."],
  ["Club / distributor testimonial", "Publication pending verified quotation and permission."],
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="sectionPad">
      <div className="shell">
        <p className="eyebrow">Testimonials</p>
        <div className="sectionHeadingGrid"><h2 className="sectionTitle">Real experience only.</h2><p className="sectionLead">No endorsement is published until the quotation and publication permission are confirmed.</p></div>
        <div className="testimonialGrid">{slots.map(([title, text]) => <article key={title} className="testimonialCard"><div className="quoteMark">“</div><h3>{title}</h3><p>{text}</p></article>)}</div>
      </div>
    </section>
  );
}
