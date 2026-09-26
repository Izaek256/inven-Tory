import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  count?: number;
}

export function Skeleton({
  width = '100%',
  height = '16px',
  borderRadius = '4px',
  count = 1,
}: SkeletonProps): React.ReactElement {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="it-skeleton"
          style={{
            width: typeof width === 'number' ? `${width}px` : width,
            height: typeof height === 'number' ? `${height}px` : height,
            borderRadius: borderRadius ?? undefined,
            animationDelay: count > 1 ? `${i * 0.1}s` : undefined,
          }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

export function SkeletonCard(): React.ReactElement {
  return (
    <div className="it-skeleton-card" aria-hidden="true">
      <Skeleton height={120} borderRadius="var(--it-r-md)" />
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton height={18} width="60%" />
        <Skeleton height={14} width="80%" />
        <Skeleton height={14} width="40%" />
      </div>
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}): React.ReactElement {
  return (
    <div className="it-skeleton-table" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="it-skeleton-row"
          style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}
        >
          {Array.from({ length: columns }, (_, j) => (
            <Skeleton
              key={j}
              height={16}
              width={j === 0 ? '30%' : `${100 / (columns - 1)}%`}
              borderRadius="4px"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonSearch(): React.ReactElement {
  return (
    <div className="it-skeleton-search" aria-hidden="true">
      <Skeleton height={40} width="100%" borderRadius="var(--it-r-sm)" />
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Skeleton height={16} width={i === 0 ? '40%' : '25%'} borderRadius="4px" />
            <Skeleton height={16} width={i === 0 ? '20%' : '15%'} borderRadius="4px" />
          </div>
        ))}
      </div>
    </div>
  );
}
