/**
 * Sparkline — tiny inline trend line for KPI tile footers (Task C/E).
 *
 * Dependency-free SVG (recharts is deliberately not used here — a tile-sized
 * sparkline needs no axes, tooltip, or ResponsiveContainer). Drawn with a
 * single normalized path; the stroke is drawn in via a stroke-dashoffset
 * transition and the area fill fades in after (pure CSS, reduced-motion safe
 * via the global token override).
 */
import React from 'react';

interface SparklineProps {
  /** Series of values, oldest → newest. Needs at least 2 points. */
  data: number[];
  /** CSS height of the svg element. */
  height?: number;
  /** Stroke color (any CSS color; defaults to the brand green). */
  stroke?: string;
  /** Optional accent surface for the area fill under the line. */
  fill?: string;
  testId?: string;
}

export function Sparkline({
  data,
  height = 36,
  stroke = 'var(--it-green)',
  fill,
  testId,
}: SparklineProps): React.ReactElement | null {
  if (data.length < 2) return null;

  const W = 100;
  const H = 100;
  const PAD = 8;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W;
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const linePath = `M${points.join(' L')}`;
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;

  return (
    <svg
      className="web-sparkline"
      style={{ height }}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      data-testid={testId}
      aria-hidden="true"
      focusable="false"
    >
      <path className="web-sparkline__area" d={areaPath} fill={fill ?? stroke} />
      <path
        className="web-sparkline__line"
        d={linePath}
        stroke={stroke}
        pathLength={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
