import { useState } from 'react';
import type { ControlDef } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';

interface ControlPanelProps {
  controls: ControlDef[];
}

export function ControlPanel({ controls }: ControlPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const supplyOn = useControlsStore((s) => s.supplyOn);
  const mcbTripped = useControlsStore((s) => s.mcbTripped);
  const variacV = useControlsStore((s) => s.variacV);
  const wmVRange = useControlsStore((s) => s.wmVRange);
  const wmIRange = useControlsStore((s) => s.wmIRange);
  const lampStates = useControlsStore((s) => s.lampStates);
  const lamps = useControlsStore((s) => s.lamps);

  const toggleSupply = useControlsStore((s) => s.toggleSupply);
  const setVariacV = useControlsStore((s) => s.setVariacV);
  const stepVariacV = useControlsStore((s) => s.stepVariacV);
  const setWmVRange = useControlsStore((s) => s.setWmVRange);
  const setWmIRange = useControlsStore((s) => s.setWmIRange);
  const toggleLampIndex = useControlsStore((s) => s.toggleLampIndex);
  const setLamps = useControlsStore((s) => s.setLamps);

  return (
    <aside
      aria-label="Bench controls"
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl shadow-xl backdrop-blur md:inset-x-auto md:top-16 md:right-3 md:bottom-auto md:max-h-[calc(100vh-5rem)] md:w-76 md:rounded-2xl"
      style={{
        backgroundColor: 'var(--vml-panel)',
        border: '1px solid var(--vml-border)',
        color: 'var(--vml-text)',
      }}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--vml-border)' }}
      >
        <span className="text-xs font-semibold tracking-wide uppercase">
          Bench Controls
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="rounded-md px-2 py-0.5 text-xs font-medium transition hover:opacity-80"
          style={{
            backgroundColor: 'var(--vml-panel-hover)',
            color: 'var(--vml-text)',
          }}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-[50vh] space-y-3.5 overflow-y-auto p-3.5 md:max-h-none">
          {controls.map((ctrl) => {
            if (ctrl.kind === 'switch') {
              return (
                <div key={ctrl.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{ctrl.label}</span>
                    {mcbTripped && (
                      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        MCB TRIPPED
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={toggleSupply}
                    aria-pressed={supplyOn}
                    className={`w-full rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      supplyOn
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : mcbTripped
                          ? 'bg-red-700 text-white hover:bg-red-600'
                          : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
                    }`}
                  >
                    {supplyOn
                      ? 'Supply: ON (Click to Shut Off)'
                      : mcbTripped
                        ? 'MCB Tripped — Click to Reset & Energise'
                        : 'Supply: OFF (Click to Energise)'}
                  </button>
                </div>
              );
            }

            if (ctrl.kind === 'knob') {
              return (
                <div key={ctrl.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor={`ctrl-${ctrl.id}`} className="text-xs font-medium">
                      {ctrl.label}
                    </label>
                    <span
                      className="font-mono text-xs font-bold"
                      style={{ color: 'var(--vml-accent)' }}
                    >
                      {variacV} {ctrl.unit}
                    </span>
                  </div>
                  <input
                    id={`ctrl-${ctrl.id}`}
                    type="range"
                    min={ctrl.min}
                    max={ctrl.max}
                    step={ctrl.step}
                    value={variacV}
                    onChange={(e) =>
                      setVariacV(Number(e.target.value), ctrl.min, ctrl.max)
                    }
                    className="w-full accent-sky-500"
                  />
                  <div className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => stepVariacV(-ctrl.step, ctrl.min, ctrl.max)}
                      className="flex-1 rounded-md px-2 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--vml-panel-hover)',
                        border: '1px solid var(--vml-border)',
                      }}
                    >
                      -{ctrl.step} {ctrl.unit}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVariacV(0, ctrl.min, ctrl.max)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--vml-panel-hover)',
                        border: '1px solid var(--vml-border)',
                      }}
                    >
                      Zero
                    </button>
                    <button
                      type="button"
                      onClick={() => stepVariacV(ctrl.step, ctrl.min, ctrl.max)}
                      className="flex-1 rounded-md px-2 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--vml-panel-hover)',
                        border: '1px solid var(--vml-border)',
                      }}
                    >
                      +{ctrl.step} {ctrl.unit}
                    </button>
                  </div>
                </div>
              );
            }

            if (ctrl.kind === 'selector') {
              const isV = ctrl.id === 'wm.vRange';
              const activeVal = isV ? wmVRange : wmIRange;
              return (
                <div key={ctrl.id} className="space-y-1">
                  <span className="block text-xs font-medium">{ctrl.label}</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {ctrl.options.map((opt) => {
                      const active = activeVal === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            if (isV && (opt === 150 || opt === 300)) {
                              setWmVRange(opt);
                            } else if (
                              !isV &&
                              (opt === 2.5 || opt === 5 || opt === 10)
                            ) {
                              setWmIRange(opt);
                            }
                          }}
                          className="rounded-md px-2 py-1.5 text-xs font-semibold transition"
                          style={{
                            backgroundColor: active
                              ? 'var(--vml-accent)'
                              : 'var(--vml-panel-hover)',
                            color: active
                              ? 'var(--vml-accent-text)'
                              : 'var(--vml-text)',
                            border: '1px solid var(--vml-border)',
                          }}
                        >
                          {opt} {ctrl.unit}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (ctrl.kind === 'steps') {
              const activeLampSlice = lampStates.slice(0, ctrl.max);
              return (
                <div key={ctrl.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {ctrl.label} ({lamps}/{ctrl.max})
                    </span>
                    <button
                      type="button"
                      onClick={() => setLamps(0, ctrl.max)}
                      className="rounded px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: 'var(--vml-panel-hover)',
                        border: '1px solid var(--vml-border)',
                      }}
                    >
                      All Off
                    </button>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {activeLampSlice.map((isOn, idx) => (
                      <button
                        key={idx}
                        type="button"
                        aria-pressed={isOn}
                        onClick={() => toggleLampIndex(idx)}
                        className="rounded-md py-1.5 text-xs font-semibold transition"
                        style={{
                          backgroundColor: isOn
                            ? '#f59e0b'
                            : 'var(--vml-panel-hover)',
                          color: isOn ? '#020617' : 'var(--vml-text)',
                          border: '1px solid var(--vml-border)',
                        }}
                      >
                        L{idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            return null;
          })}
        </div>
      )}
    </aside>
  );
}
