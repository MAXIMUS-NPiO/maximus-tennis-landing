/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { standardLengths, catalogueCounts } from "../data/products";
export default function LengthOptions({ dict }) {
  const C = dict.catalogue, L = dict.common.labels;
  return <div className="stack" data-standard-lengths="7">
    <h3 className="h-3">{C.standard}</h3>
    <div className="badges">{standardLengths.map((x) => <span className="status" key={x.inches}><bdi>{x.inches} {L.inches}</bdi>{x.category === "standard" ? "" : ` · ${C[x.category]}`}</span>)}</div>
    <p className="mono" data-playing-variants={catalogueCounts.playingVariants}>{L.weight} × {C.length}: {catalogueCounts.baseModels} × {catalogueCounts.lengthsPerModel} = {catalogueCounts.playingVariants} (+{catalogueCounts.addedPlayingVariants})</p>
    <p>{C.note}</p><p className="muted small">{C.balanceNote}</p>
  </div>;
}
