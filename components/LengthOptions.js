/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { standardLengths, catalogueCounts, trainerWeights, isTrainer } from "../data/products";
export default function LengthOptions({ dict, productId }) {
  const C = dict.catalogue, L = dict.common.labels;
  const trainer = isTrainer(productId);
  const weights = trainer ? trainerWeights.length : catalogueCounts.baseModels;
  const variants = weights * standardLengths.length;
  return <div className="stack" data-standard-lengths={standardLengths.length} data-product={productId || "playing"}>
    <h3 className="h-3">{C.standard}</h3>
    <div className="badges">{standardLengths.map((x) => <span className="status" key={x.inches}><bdi>{x.inches} {L.inches}</bdi>{x.category === "standard" ? "" : ` · ${C[x.category]}`}</span>)}</div>
    <p className="mono" data-request-variants={variants}>{L.weight} × {C.length}: {weights} × {standardLengths.length} = {variants}{!trainer && ` (+${catalogueCounts.addedPlayingVariants})`}</p>
    <p>{C.note}</p><p className="muted small">{C.balanceNote}</p>
  </div>;
}
