import React, { useMemo } from 'react';
import type { StockTrendPoint } from '../types/dashboard';

/**
 * StockTrendChart — artifact-style SVG area/line chart.
 * Teal 2.4px line + 8% area fill, dashed grid, mono axis (k-formatted),
 * matching the invenTory Dashboard artifact's "Stock trend" panel.
 */

interface StockTrendChartProps {
  data: StockTrendPoint[];
  height?: number;
  testId?: string;
}

const W = 900;
const H = 210;
const PAD_L = 36;
const PAD_B = 30;
const PAD_T = 14;

function fmtK(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `${v}`;
}

export function StockTrendChart({
  data,
  height = 210,
  testId,
}: StockTrendChartProps): React.ReactElement | null {
  const pts = useMemo(() => {
    if (!data.length) return null;
    const vals = data.map((d) => d.total_stock_units);
    const max = Math.max(...vals, 1);
    const niceMax = Math.ceil(max / 1000) * 1000 || max;
    const n = data.length;
    const x = (i: number): number => (n === 1 ? PAD_L : PAD_L + (i * (W - PAD_L - 20)) / (n - 1));
    const y = (v: number): number => PAD_T + (1 - v / niceMax) * (H - PAD_T - PAD_B);
    const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d.total_stock_units).toFixed(1)}`);
    return { line, niceMax, x, y };
  }, [data]);

  if (!data.length || !pts) {
    return (
      <div
        data-testid={testId}
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--it-text-secondary)',
          backgroundColor: 'var(--it-surface)',
          border: '1px solid var(--it-border)',
          fontSize: 13,
        }}
      >
        No stock trend data available
      </div>
    );
  }

  const { line, niceMax, x, y } = pts;
  const baseY = H - PAD_B;
  const area = `${PAD_L},${baseY} ${line.join(' ')} ${x(data.length - 1).toFixed(1)},${baseY}`;
  const midY = y(niceMax / 2);

  const labelIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  const fmtDay = (iso: string): string => {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso.slice(5);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div data-testid={testId} style={{ height, width: '100%' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Stock trend, ${data.length} points, peak ${fmtK(niceMax)} units`}
      >
        <line
          x1={PAD_L}
          y1={PAD_T}
          x2={PAD_L}
          y2={baseY}
          stroke="var(--it-border)"
          strokeWidth="1"
        />
        <line
          x1={PAD_L}
          y1={baseY}
          x2={W - 20}
          y2={baseY}
          stroke="var(--it-border)"
          strokeWidth="1"
        />
        <line
          x1={PAD_L}
          y1={midY}
          x2={W - 20}
          y2={midY}
          stroke="var(--it-border)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <line
          x1={PAD_L}
          y1={PAD_T}
          x2={W - 20}
          y2={PAD_T}
          stroke="var(--it-border)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <text
          x="4"
          y={baseY + 4}
          fontFamily="var(--it-font-mono)"
          fontSize="11"
          fill="var(--it-text-disabled)"
        >
          0
        </text>
        <text
          x="0"
          y={midY + 4}
          fontFamily="var(--it-font-mono)"
          fontSize="11"
          fill="var(--it-text-disabled"
        >
          {fmtK(niceMax / 2)}
        </text>
        <text
          x="0"
          y={PAD_T + 4}
          fontFamily="var(--it-font-mono)"
          fontSize="11"
          fill="var(--it-text-disabled)"
        >
          {fmtK(niceMax)}
        </text>
        <polygon points={area} fill="var(--teal)" opacity="0.08" />
        <polyline
          points={line.join(' ')}
          fill="none"
          stroke="var(--teal)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {labelIdx.map((i) => (
          <text
            key={data[i].date}
            x={x(i)}
            y={H - 8}
            fontFamily="var(--it-font-mono)"
            fontSize="11"
            fill="var(--it-text-disabled)"
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
          >
            {fmtDay(data[i].date)}
          </text>
        ))}
      </svg>
    </div>
  );
}
