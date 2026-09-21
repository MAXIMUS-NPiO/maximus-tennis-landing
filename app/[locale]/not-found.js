import Link from "next/link";
import { getDict } from "../../lib/i18n";

export default function NotFound() {
  const dict = getDict("en");
  return (
    <section className="section first"><div className="shell narrow">
      <h1 className="h-1">{dict.notFound.title}</h1>
      <p className="lead">{dict.notFound.p}</p>
      <p><Link className="btn" href="/en">{dict.notFound.cta}</Link></p>
    </div></section>
  );
}
