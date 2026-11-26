import { useState } from 'react';
import type { TransformerLoadOutput } from '../core/types';

interface MeterReadoutsProps {
  output: TransformerLoadOutput;
}

function MeterStatusBadge({
  damaged,
  reversed,
  overrange,
}: {
  damaged: boolean;
  reversed: boolean;
  overrange: boolean;
}) {
  if (damaged) {
    return (
      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
        DAMAGED
      </span>
    );
  }
  if (reversed) {
    return (
      <span className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
        REVERSED
      </span>
    );
  }
  if (overrange) {
    return (
      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
        OVERRANGE
      </span>
    );
  }
  return null;
}

export function MeterReadouts({ output }: MeterReadoutsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { vp, vs, am, wm } = output.meters;

  return (
    <section
      aria-label="Live meter readouts"
      className="pointer-events-auto fixed top-24 left-2.5 z-10 w-60 rounded-2xl shadow-xl backdrop-blur md:top-16 md:left-3 md:w-72"
      style={{
        backgroundColor: 'var(--vml-panel)',
        border: '1px solid var(--vml-border)',
        color: 'var(--vml-text)',
      }}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2"
        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--vml-border)' }}
      >
        <span className="text-xs font-semibold tracking-wide uppercase">
          Meter Readouts
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="rounded-md px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: 'var(--vml-panel-hover)',
            color: 'var(--vml-text)',
          }}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-2 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: 'var(--vml-text-muted)' }}>V Primary (V1)</span>
            <div className="flex items-center gap-1.5">
              <MeterStatusBadge
                damaged={vp.damaged}
                reversed={vp.reversed}
                overrange={vp.overrange}
              />
              <span className="font-mono font-bold">
                {vp.damaged ? '0.0' : vp.shownValue.toFixed(1)} V
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span style={{ color: 'var(--vml-text-muted)' }}>V Secondary (V2)</span>
            <div className="flex items-center gap-1.5">
              <MeterStatusBadge
                damaged={vs.damaged}
                reversed={vs.reversed}
                overrange={vs.overrange}
              />
              <span className="font-mono font-bold">
                {vs.damaged ? '0.0' : vs.shownValue.toFixed(1)} V
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span style={{ color: 'var(--vml-text-muted)' }}>A Secondary (I2)</span>
            <div className="flex items-center gap-1.5">
              <MeterStatusBadge
                damaged={am.damaged}
                reversed={am.reversed}
                overrange={am.overrange}
              />
              <span className="font-mono font-bold">
                {am.damaged ? '0.00' : am.shownValue.toFixed(2)} A
              </span>
            </div>
          </div>

          <div
            className="space-y-1 pt-2"
            style={{ borderTop: '1px solid var(--vml-border)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Wattmeter</span>
              <MeterStatusBadge
                damaged={wm.damaged}
                reversed={wm.reversed}
                overrange={wm.overrange}
              />
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--vml-text-muted)' }}>Dial Reading</span>
              <span className="font-mono font-bold">
                {wm.damaged ? '0.0' : wm.dial.toFixed(1)} div
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--vml-text-muted)' }}>
                Multiplying Factor (MF)
              </span>
              <span className="font-mono font-semibold">
                {wm.mf.toFixed(2)} W/div
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--vml-text-muted)' }}>
                Power (Dial × MF)
              </span>
              <span
                className="font-mono font-bold"
                style={{ color: 'var(--vml-accent)' }}
              >
                {wm.damaged ? '0.0' : (wm.dial * wm.mf).toFixed(1)} W
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
