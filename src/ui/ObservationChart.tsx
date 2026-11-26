import { evaluateColumnValue, getRowValue } from '../core/physics/report';
import type {
  ChartSpec,
  ColumnDef,
  ObservationRow,
} from '../core/types';
import { useSessionStore } from '../stores/sessionStore';

interface ObservationChartProps {
  spec: ChartSpec;
  columns: ColumnDef[];
  rows: ObservationRow[];
  params: Record<string, number>;
}

const SERIES_PALETTE = [
  'var(--vml-accent)',
  '#f59e0b',
  '#10b981',
  '#ec4899',
];

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

function readNumericCol(
  col: ColumnDef | undefined,
  row: ObservationRow,
  params: Record<string, number>,
): number | null {
  if (!col) {
    const raw = getRowValue(row, '');
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  }
  const val =
    col.source.kind === 'derived'
      ? evaluateColumnValue(col, row.values, params)
      : getRowValue(row, col.id);
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

export function ObservationChart({
  spec,
  columns,
  rows,
  params,
}: ObservationChartProps) {
  const chartInputs = useSessionStore((s) => s.chartInputs);
  const setChartInput = useSessionStore((s) => s.setChartInput);
  const xCol = columns.find((c) => c.id === spec.xColumn);

  const computedSeries = spec.computeSeries
    ? (() => {
        const numericInputs: Record<string, number> = {};
        for (const inp of spec.inputs ?? []) {
          const parsed = Number.parseFloat(chartInputs[inp.id] ?? '');
          if (Number.isFinite(parsed)) numericInputs[inp.id] = parsed;
        }
        return spec.computeSeries(numericInputs, params);
      })()
    : null;

  const seriesData = spec.series.map((s, sIdx) => {
    if (computedSeries) {
      const rawPts = computedSeries[sIdx] ?? [];
      return {
        ...s,
        color: s.color ?? SERIES_PALETTE[sIdx % SERIES_PALETTE.length],
        pts: rawPts.map((p, idx) => ({ sno: idx + 1, x: p.x, y: p.y })),
      };
    }

    const yCol = columns.find((c) => c.id === s.yColumn);
    const pts = rows
      .map((r) => {
        const xVal = xCol
          ? readNumericCol(xCol, r, params)
          : getRowValue(r, spec.xColumn);
        const yVal = yCol
          ? readNumericCol(yCol, r, params)
          : getRowValue(r, s.yColumn);
        if (
          typeof xVal !== 'number' ||
          !Number.isFinite(xVal) ||
          typeof yVal !== 'number' ||
          !Number.isFinite(yVal)
        ) {
          return null;
        }
        return { sno: r.sno, x: xVal, y: yVal };
      })
      .filter((p): p is { sno: number; x: number; y: number } => p !== null)
      .filter((p) => p.x > 0 || spec.xMin === undefined || spec.xMin < 0)
      .sort((a, b) => a.x - b.x);

    return {
      ...s,
      color: s.color ?? SERIES_PALETTE[sIdx % SERIES_PALETTE.length],
      pts,
    };
  });

  const allPts = seriesData.flatMap((s) => s.pts);

  const W = 290;
  const H = 165;
  const padL = 36;
  const padR = 12;
  const padT = 14;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const refXs = (spec.referenceLines ?? [])
    .filter((r) => r.axis === 'x')
    .map((r) => r.value);
  const refYs = (spec.referenceLines ?? [])
    .filter((r) => r.axis === 'y')
    .map((r) => r.value);

  const xMin = spec.xMin ?? (allPts.length ? Math.min(0, ...allPts.map((p) => p.x)) : 0);
  const rawXMax = Math.max(
    spec.xMax ?? 100,
    ...allPts.map((p) => p.x * 1.05),
    ...refXs.map((v) => v * 1.15),
  );
  const xMax = rawXMax > xMin ? rawXMax : xMin + 1;

  const yMin =
    spec.yMin ??
    (allPts.length
      ? Math.max(0, Math.floor(Math.min(...allPts.map((p) => p.y), ...refYs) / 5) * 5)
      : 0);
  const yMax =
    spec.yMax ??
    (allPts.length
      ? Math.ceil(Math.max(...allPts.map((p) => p.y), ...refYs, yMin + 10) / 5) * 5
      : 100);
  const safeYMax = yMax > yMin ? yMax : yMin + 1;

  const xScale = (v: number) =>
    padL + ((Math.min(xMax, Math.max(xMin, v)) - xMin) / (xMax - xMin)) * plotW;
  const yScale = (v: number) =>
    padT +
    plotH -
    ((Math.min(safeYMax, Math.max(yMin, v)) - yMin) / (safeYMax - yMin)) * plotH;

  const yTicks = [yMin, (yMin + safeYMax) / 2, safeYMax];
  const stepX = (xMax - xMin) / 4;
  const xTicks = [xMin, xMin + stepX * 2, xMax];
  const hasRefX = refXs.length > 0 && spec.xMax === 2400;
  const displayXTicks = hasRefX ? [0, 1000, 2000] : xTicks;

  const yUnitSuffix = spec.yLabel.includes('%') ? '%' : '';

  return (
    <div
      className="rounded-xl p-2"
      style={{
        backgroundColor: 'var(--vml-panel-hover)',
        border: '1px solid var(--vml-border)',
      }}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-[11px] font-semibold">
        <span>{spec.title}</span>
        {spec.subtitle && (
          <span style={{ color: 'var(--vml-text-muted)' }}>
            {spec.subtitle}
          </span>
        )}
      </div>

      {spec.inputs && spec.inputs.length > 0 && (
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          {spec.inputs.map((inp) => (
            <div key={inp.id} className="space-y-0.5">
              <label
                htmlFor={`chart-inp-${inp.id}`}
                className="block truncate text-[10px]"
                style={{ color: 'var(--vml-text-muted)' }}
              >
                {inp.label}
                {inp.unit ? ` (${inp.unit})` : ''}
              </label>
              <input
                id={`chart-inp-${inp.id}`}
                type="number"
                step={inp.step ?? '0.1'}
                placeholder={inp.placeholder ?? ''}
                value={chartInputs[inp.id] ?? ''}
                onChange={(e) => setChartInput(inp.id, e.target.value)}
                className="w-full rounded-md px-2 py-1 font-mono text-[11px]"
                style={{
                  backgroundColor: 'var(--vml-panel)',
                  border: '1px solid var(--vml-border)',
                  color: 'var(--vml-text)',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {seriesData.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-2 text-[10px]">
          {seriesData.map((s) => (
            <span
              key={s.yColumn}
              className="inline-flex items-center gap-1"
              style={{ opacity: s.opacity ?? 1 }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: s.dashed ? 'transparent' : s.color,
                  border: s.dashed ? `1.5px dashed ${s.color}` : undefined,
                }}
              />
              <span style={{ color: 'var(--vml-text-muted)' }}>{s.label}</span>
            </span>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${spec.title} chart`}
      >
        {/* Horizontal grid lines */}
        {yTicks.map((val) => {
          const y = yScale(val);
          return (
            <g key={`y_${val}`}>
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
                {Number.isInteger(val) ? val : val.toFixed(1)}
                {yUnitSuffix}
              </text>
            </g>
          );
        })}

        {/* Vertical ticks */}
        {displayXTicks.map((val) => {
          const x = xScale(val);
          return (
            <g key={`x_${val}`}>
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
                {Number.isInteger(val) ? val : val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Reference lines */}
        {(spec.referenceLines ?? []).map((ref, idx) => {
          const color = ref.color ?? '#f59e0b';
          if (ref.axis === 'x') {
            const x = xScale(ref.value);
            return (
              <g key={`ref_${idx}`}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={H - padB}
                  stroke={color}
                  strokeDasharray="4 3"
                  strokeWidth="1.4"
                />
                <text
                  x={x - 3}
                  y={padT + 9}
                  textAnchor="end"
                  fontSize="8"
                  fontWeight="700"
                  fill={color}
                >
                  {ref.label}
                </text>
              </g>
            );
          }
          const y = yScale(ref.value);
          return (
            <g key={`ref_${idx}`}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke={color}
                strokeDasharray="4 3"
                strokeWidth="1.4"
              />
              <text
                x={W - padR - 2}
                y={y - 3}
                textAnchor="end"
                fontSize="8"
                fontWeight="700"
                fill={color}
              >
                {ref.label}
              </text>
            </g>
          );
        })}

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
          {spec.xLabel}
        </text>

        {/* Series curves and points */}
        {seriesData.map((s) => {
          const svgPts = s.pts.map((p) => ({
            x: xScale(p.x),
            y: yScale(p.y),
            rawX: p.x,
            rawY: p.y,
            sno: p.sno,
          }));
          const pathD = buildSmoothPath(svgPts);
          return (
            <g key={s.yColumn}>
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.dashed ? '1.35' : '2'}
                  strokeDasharray={s.dashed ? '4 3' : undefined}
                  strokeOpacity={s.opacity ?? 1}
                  strokeLinecap="round"
                />
              )}
              {s.showPoints !== false &&
                svgPts.map((pt) => (
                  <circle
                    key={`${s.yColumn}_${pt.sno}`}
                    cx={pt.x}
                    cy={pt.y}
                    r="3.2"
                    fill={s.color}
                    stroke="var(--vml-page-bg)"
                    strokeWidth="1.2"
                  >
                    <title>
                      #{pt.sno} {s.label}: {pt.rawX.toFixed(1)}, {pt.rawY.toFixed(1)}
                    </title>
                  </circle>
                ))}
            </g>
          );
        })}

        {allPts.length === 0 && (
          <text
            x={padL + plotW / 2}
            y={padT + plotH / 2}
            textAnchor="middle"
            fontSize="9.5"
            fill="var(--vml-text-muted)"
          >
            {spec.emptyText ?? 'Add observation rows to plot curve'}
          </text>
        )}
      </svg>
    </div>
  );
}
