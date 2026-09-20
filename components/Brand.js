export default function Brand({ inverse = false }) {
  return (
    <div className={`brand ${inverse ? "brandInverse" : ""}`}>
      <span className="lionMark" aria-hidden="true">M</span>
      <span className="brandText">
        <strong>MAXIMUS</strong><span className="gpsBadge">GPS</span>
        <small>YOUR NAVIGATION IN THE WORLD OF TENNIS</small>
      </span>
    </div>
  );
}
