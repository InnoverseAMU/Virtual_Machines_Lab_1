import { computeRowEfficiency, computeRowLoadVA } from '../core/physics/report';
import type { ObservationRow } from '../core/types';

interface EfficiencyChartProps {
  rows: ObservationRow[];
}

interface ChartPoint {
  va: number;
  eff: number;
  sno: number;
}

function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function EfficiencyChart({ rows }: EfficiencyChartProps) {
  const points: ChartPoint[] = rows
    .map((r) => ({
      sno: r.sno,
      va: computeRowLoadVA(r),
      eff: computeRowEfficiency(r),
    }))
    .filter((p) => p.va > 0 && p.eff > 0)
    .sort((a, b) => a.va - b.va);

  const W = 290;
  const H = 165;
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxVA = Math.max(2400, ...points.map((p) => p.va * 1.05));
  const minEff = points.length
    ? Math.max(0, Math.floor(Math.min(...points.map((p) => p.eff), 85) / 5) * 5)
    : 80;
  const maxEff = 100;

  const xScale = (va: number) => padL + (va / maxVA) * plotW;
  const yScale = (eff: number) =>
    padT + plotH - ((Math.min(maxEff, Math.max(minEff, eff)) - minEff) / (maxEff - minEff)) * plotH;

  const svgPts = points.map((p) => ({
    x: xScale(p.va),
    y: yScale(p.eff),
    ...p,
  }));

  const pathD = buildSmoothPath(svgPts);
  const ratedX = xScale(2000);
  const yTicks = [minEff, (minEff + maxEff) / 2, maxEff];
  const xTicks = [0, 1000, 2000];

  return (
    <div
      className="rounded-xl p-2"
      style={{
        backgroundColor: 'var(--vml-panel-hover)',
        border: '1px solid var(--vml-border)',
      }}
    >
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
        <span>Efficiency vs Load VA</span>
        <span style={{ color: 'var(--vml-text-muted)' }}>
          Rated: 2000 VA
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Efficiency versus load VA chart"
      >
        {/* Horizontal grid lines */}
        {yTicks.map((val) => {
          const y = yScale(val);
          return (
            <g key={val}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="var(--vml-border)"
                strokeDasharray="2 3"
                strokeWidth="1"
              />
              <text
                x={padL - 4}
                y={y + 3}
                textAnchor="end"
                fontSize="8.5"
                fill="var(--vml-text-muted)"
              >
                {val.toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* Vertical ticks */}
        {xTicks.map((va) => {
          const x = xScale(va);
          return (
            <g key={va}>
              <line
                x1={x}
                y1={padT}
                x2={x}
                y2={H - padB}
                stroke="var(--vml-border)"
                strokeDasharray="2 3"
                strokeWidth="1"
              />
              <text
                x={x}
                y={H - padB + 11}
                textAnchor="middle"
                fontSize="8.5"
                fill="var(--vml-text-muted)"
              >
                {va}
              </text>
            </g>
          );
        })}

        {/* 2000 VA reference line */}
        <line
          x1={ratedX}
          y1={padT}
          x2={ratedX}
          y2={H - padB}
          stroke="#f59e0b"
          strokeDasharray="4 3"
          strokeWidth="1.4"
        />
        <text
          x={ratedX - 3}
          y={padT + 9}
          textAnchor="end"
          fontSize="8"
          fontWeight="700"
          fill="#f59e0b"
        >
          2000 VA
        </text>

        {/* Axes */}
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={H - padB}
          stroke="var(--vml-text-muted)"
          strokeWidth="1.2"
        />
        <line
          x1={padL}
          y1={H - padB}
          x2={W - padR}
          y2={H - padB}
          stroke="var(--vml-text-muted)"
          strokeWidth="1.2"
        />

        <text
          x={padL + plotW / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize="8.5"
          fill="var(--vml-text-muted)"
        >
          Load (VA)
        </text>

        {/* Smooth efficiency curve */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="var(--vml-accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}

        {/* Data points */}
        {svgPts.map((pt) => (
          <circle
            key={pt.sno}
            cx={pt.x}
            cy={pt.y}
            r="3.2"
            fill="var(--vml-accent)"
            stroke="var(--vml-page-bg)"
            strokeWidth="1.2"
          >
            <title>
              #{pt.sno}: {pt.va.toFixed(0)} VA, {pt.eff.toFixed(1)}%
            </title>
          </circle>
        ))}

        {points.length === 0 && (
          <text
            x={padL + plotW / 2}
            y={padT + plotH / 2}
            textAnchor="middle"
            fontSize="9.5"
            fill="var(--vml-text-muted)"
          >
            Record loaded rows to plot curve
          </text>
        )}
      </svg>
    </div>
  );
}
