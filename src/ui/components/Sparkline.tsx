// src/ui/components/Sparkline.tsx
// Extracted verbatim from Dashboard.tsx so other pages can reuse it.

import React from 'react';

/** SVG sparkline for trend visualization. */
export function Sparkline({ data, height = 36, color = '#0891b2' }: { data: (number | null)[]; height?: number; color?: string }) {
  const valid = data.filter((v): v is number => v != null);
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const w = 200;
  const pad = 2;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = v != null
      ? height - pad - ((v - min) / range) * (height - pad * 2)
      : null;
    return { x, y };
  }).filter((p): p is { x: number; y: number } => p.y != null);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const lastPoint = points[points.length - 1];
  const lastValue = valid[valid.length - 1];

  return (
    <div className="flex items-center gap-2">
      <svg viewBox={`0 0 ${w} ${height}`} className="flex-1" style={{ height }} preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r="2.5" fill={color} />}
      </svg>
      <span className="text-xs font-semibold text-slate-900">{lastValue.toFixed(1)}</span>
    </div>
  );
}
