import Link from "next/link";
import { seriesList } from "../data/products";
import { href } from "../lib/paths";

/** Expressive index of the three performance series: name — head size — declared direction. */
export default function SeriesIndex({ locale, dict }) {
  const R = dict.racquets, L = dict.common.labels;
  return (
    <ul className="index" aria-label={dict.home.index.title}>
      {seriesList.map((s) => (
        <li key={s.id}>
          <Link href={href(locale, s.id)}>
            <span className="index-name">{s.short}</span>
            <span className="index-head">{s.headSizeSqIn} {L.sqin}</span>
            <span className="index-dir">{R.direction[s.direction]}</span>
            <span className="go" aria-hidden="true">{R.ctaSeries} →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
