import logo from '../logo.json';

const COLOURS: Record<string, string> = logo.colours;

/**
 * The Atlas Conquest emblem: two gold swords, crossed, as pixel art. The same drawing is the favicon.
 * The pixels come from src/logo.json, which `npm run logo` draws.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`logo ${className}`}
      viewBox={`0 0 ${logo.size} ${logo.size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Two crossed gold swords"
      data-testid="logo"
    >
      {logo.rows.flatMap((row, y) =>
        [...row].map((cell, x) => (cell === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLOURS[cell]} />)),
      )}
    </svg>
  );
}
