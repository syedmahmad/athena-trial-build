/**
 * Wireframe basketball glyph: outer circle + two elliptical seams.
 *
 * Lifted from the pattern proven inside BasketballBounce / BasketballShot /
 * BasketballTrajectory (all three render the ball with this exact shape and
 * have passed the visual critic). Extracted here so new primitives can reuse
 * a known-good basketball without going through the AI author loop's risk
 * of generating a glyph the critic reads as a crosshair / target / fragments.
 *
 * The three existing primitives still have their own inline copies — leave
 * them alone. This helper is for NEW primitives.
 */
export function Basketball({
  cx,
  cy,
  r,
  rotationDeg = 0,
  sc = 1,
  shimmer = 1,
  glowFilterId,
  outerOpacity = 0.9,
  seamOpacity = 0.5,
}: {
  cx: number;
  cy: number;
  r: number;
  rotationDeg?: number;
  sc?: number;
  shimmer?: number;
  glowFilterId?: string;
  outerOpacity?: number;
  seamOpacity?: number;
}) {
  return (
    <g
      filter={glowFilterId ? `url(#${glowFilterId})` : undefined}
      transform={`translate(${cx}, ${cy}) rotate(${rotationDeg})`}
    >
      <circle
        cx={0}
        cy={0}
        r={r}
        fill="none"
        stroke="white"
        strokeWidth={2.5 * sc}
        opacity={outerOpacity * shimmer}
      />
      <ellipse
        cx={0}
        cy={0}
        rx={r * 0.42}
        ry={r}
        fill="none"
        stroke="white"
        strokeWidth={1 * sc}
        opacity={seamOpacity * shimmer}
      />
      <ellipse
        cx={0}
        cy={0}
        rx={r}
        ry={r * 0.42}
        fill="none"
        stroke="white"
        strokeWidth={1 * sc}
        opacity={seamOpacity * shimmer}
      />
    </g>
  );
}
