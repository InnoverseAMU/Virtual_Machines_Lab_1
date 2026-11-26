import { memo, useRef, useState } from 'react';
import { getStage } from '../core/circuit/stages';
import {
  canonicalPairKey,
  resolveScrambledTerminalLabels,
} from '../core/phasor/ex3_5Scramble';
import { isSupplySwitchOn } from '../core/physics/evaluate';
import { describeWattmeterCcLinkMode } from '../core/physics/meters';
import { MAX_OBSERVATION_ROWS } from '../core/physics/report';
import type {
  ControlDef,
  ExperimentDef,
  MeterReading,
  PhysicsSolveOutput,
} from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { ObservationsPanel } from './ObservationsPanel';

type SidebarTab = 'bench' | 'observations';

interface RightSidebarProps {
  experiment: ExperimentDef;
  controls: ControlDef[];
  output: PhysicsSolveOutput;
  energised: boolean;
  controlsLocked?: boolean;
  unlockHint?: string;
}

function StatusBadge({
  tripped,
  damaged,
  reversed,
  overrange,
}: {
  tripped?: boolean;
  damaged?: boolean;
  reversed?: boolean;
  overrange?: boolean;
}) {
  if (tripped) {
    return (
      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
        TRIPPED
      </span>
    );
  }
  if (damaged) {
    return (
      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
        DAMAGED
      </span>
    );
  }
  if (reversed) {
    return (
      <span className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
        REVERSED
      </span>
    );
  }
  if (overrange) {
    return (
      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
        OVERRANGE
      </span>
    );
  }
  return null;
}

const ControlsSection = memo(function ControlsSection({
  controls,
  controlsLocked = false,
  unlockHint,
}: {
  controls: ControlDef[];
  controlsLocked?: boolean;
  unlockHint?: string;
}) {
  const values = useControlsStore((s) => s.values);
  const mcbTripped = useControlsStore((s) => s.mcbTripped);
  const lampStates = useControlsStore((s) => s.lampStates);

  const setControlValue = useControlsStore((s) => s.setControlValue);
  const stepControlValue = useControlsStore((s) => s.stepControlValue);
  const toggleLampIndex = useControlsStore((s) => s.toggleLampIndex);
  const setLamps = useControlsStore((s) => s.setLamps);

  return (
    <section aria-label="Bench controls" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2
          className="font-space text-[11px] font-bold tracking-wider uppercase"
          style={{ color: 'var(--vml-text-muted)' }}
        >
          Controls
        </h2>
        {controlsLocked && (
          <span
            className="text-[10px] font-medium"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            {unlockHint ?? 'Locked for wiring step'}
          </span>
        )}
      </div>

      <fieldset
        disabled={controlsLocked}
        className={`space-y-3 ${controlsLocked ? 'opacity-60' : ''}`}
      >
        {controls.map((ctrl) => {
          if (ctrl.kind === 'switch') {
            const isOn = Boolean(values[ctrl.id]);
            const isSupply = ctrl.id === 'sup.switch' || ctrl.id === 'sup3.switch';
            return (
              <div key={ctrl.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{ctrl.label}</span>
                  {isSupply && mcbTripped && <StatusBadge tripped />}
                </div>
                <button
                  type="button"
                  onClick={() => setControlValue(ctrl.id, !isOn)}
                  aria-pressed={isOn}
                  className={`w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isOn
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : isSupply && mcbTripped
                        ? 'bg-red-700 text-white hover:bg-red-600'
                        : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
                  }`}
                >
                  {isSupply
                    ? isOn
                      ? 'Supply: ON (Click to Shut Off)'
                      : mcbTripped
                        ? 'MCB Tripped — Click to Reset & Energise'
                        : 'Supply: OFF (Click to Energise)'
                    : isOn
                      ? `${ctrl.label}: ON`
                      : `${ctrl.label}: OFF`}
                </button>
              </div>
            );
          }

          if (ctrl.kind === 'knob') {
            const val = Number(values[ctrl.id] ?? ctrl.defaultValue);
            const fine = ctrl.fineStep ?? 0.1;
            const formatted =
              ctrl.step < 1 || !Number.isInteger(val)
                ? val.toFixed(1)
                : String(val);

            return (
              <div key={ctrl.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`sb-${ctrl.id}`} className="text-xs font-medium">
                    {ctrl.label}
                  </label>
                  <span
                    className="font-mono text-xs font-bold tabular-nums"
                    style={{ color: 'var(--vml-accent)' }}
                  >
                    {formatted} {ctrl.unit}
                  </span>
                </div>
                <input
                  id={`sb-${ctrl.id}`}
                  type="range"
                  min={ctrl.min}
                  max={ctrl.max}
                  step={ctrl.step}
                  value={val}
                  onChange={(e) =>
                    setControlValue(ctrl.id, Number(e.target.value))
                  }
                  className="w-full accent-sky-500 dark:accent-cyan-400"
                />
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      stepControlValue(ctrl.id, -ctrl.step, ctrl.min, ctrl.max, ctrl.step)
                    }
                    className="flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: 'var(--vml-panel-hover)',
                      border: '1px solid var(--vml-border)',
                    }}
                  >
                    -{ctrl.step}
                  </button>
                  {fine < ctrl.step && (
                    <button
                      type="button"
                      onClick={() =>
                        stepControlValue(ctrl.id, -fine, ctrl.min, ctrl.max, fine)
                      }
                      className="rounded-md px-1.5 py-1 text-[11px] font-medium"
                      style={{
                        backgroundColor: 'var(--vml-panel-hover)',
                        border: '1px solid var(--vml-border)',
                      }}
                    >
                      -{fine}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setControlValue(ctrl.id, 0)}
                    className="rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: 'var(--vml-panel-hover)',
                      border: '1px solid var(--vml-border)',
                    }}
                  >
                    Zero
                  </button>
                  {fine < ctrl.step && (
                    <button
                      type="button"
                      onClick={() =>
                        stepControlValue(ctrl.id, fine, ctrl.min, ctrl.max, fine)
                      }
                      className="rounded-md px-1.5 py-1 text-[11px] font-medium"
                      style={{
                        backgroundColor: 'var(--vml-panel-hover)',
                        border: '1px solid var(--vml-border)',
                      }}
                    >
                      +{fine}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      stepControlValue(ctrl.id, ctrl.step, ctrl.min, ctrl.max, ctrl.step)
                    }
                    className="flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: 'var(--vml-panel-hover)',
                      border: '1px solid var(--vml-border)',
                    }}
                  >
                    +{ctrl.step}
                  </button>
                </div>
              </div>
            );
          }

          if (ctrl.kind === 'selector') {
            const activeVal = values[ctrl.id] ?? ctrl.defaultValue;
            const isCcRange = ctrl.id.endsWith('.iRange');
            const isPcRange = ctrl.id.endsWith('.vRange');
            const numericOpts = ctrl.options.filter(
              (o): o is number => typeof o === 'number',
            );
            return (
              <div key={ctrl.id} className="space-y-1">
                <span className="block text-xs font-medium">{ctrl.label}</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {ctrl.options.map((opt) => {
                    const active = activeVal === opt;
                    const ccMode =
                      isCcRange && typeof opt === 'number'
                        ? describeWattmeterCcLinkMode(opt, numericOpts)
                        : null;
                    return (
                      <button
                        key={String(opt)}
                        type="button"
                        onClick={() => setControlValue(ctrl.id, opt)}
                        className="rounded-md px-2 py-1 text-xs font-semibold transition"
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
                        <span>
                          {opt}
                          {ctrl.unit ? ` ${ctrl.unit}` : ''}
                        </span>
                        {ccMode && (
                          <span className="block text-[9px] font-medium opacity-80">
                            {ccMode.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {isCcRange && (
                  <p
                    className="text-[10px] leading-snug"
                    style={{ color: 'var(--vml-text-muted)' }}
                  >
                    CC link: Series = low I rating · Parallel = double (high) I
                    rating. Click I plate on 3D wattmeter or here.
                  </p>
                )}
                {isPcRange && (
                  <p
                    className="text-[10px] leading-snug"
                    style={{ color: 'var(--vml-text-muted)' }}
                  >
                    PC tap: adds internal series multiplier resistor for higher
                    voltage rating.
                  </p>
                )}
              </div>
            );
          }

          if (ctrl.kind === 'steps') {
            const countVal = Number(values[ctrl.id] ?? ctrl.defaultValue);
            const activeLampSlice = lampStates.slice(0, ctrl.max);
            return (
              <div key={ctrl.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium tabular-nums">
                    {ctrl.label} ({countVal}/{ctrl.max})
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
                <div className="grid grid-cols-6 gap-1">
                  {activeLampSlice.map((isOn, idx) => (
                    <button
                      key={idx}
                      type="button"
                      aria-pressed={isOn}
                      onClick={() => toggleLampIndex(idx, ctrl.id)}
                      className="rounded-md py-1 text-[11px] font-semibold transition"
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
      </fieldset>
    </section>
  );
});

const ReadingsSection = memo(function ReadingsSection({
  meters,
  supplyOn,
  mcbTripped,
  variacV,
  hasVariac,
  showNumericReadouts,
  onToggleNumericReadouts,
}: {
  meters: MeterReading[];
  supplyOn: boolean;
  mcbTripped: boolean;
  variacV: number;
  hasVariac: boolean;
  showNumericReadouts: boolean;
  onToggleNumericReadouts: () => void;
}) {
  const analogMeters = meters.filter((m) => m.kind !== 'wattmeter');
  const wattmeters = meters.filter((m) => m.kind === 'wattmeter');

  return (
    <section aria-label="Meter readings" className="space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h2
          className="font-space text-[11px] font-bold tracking-wider uppercase"
          style={{ color: 'var(--vml-text-muted)' }}
        >
          Readings
        </h2>
        <div className="flex items-center gap-1.5">
          <StatusBadge tripped={mcbTripped} />
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              supplyOn
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-600 text-slate-100'
            }`}
          >
            {supplyOn ? 'ON' : 'OFF'}
          </span>
          {hasVariac && (
            <span className="font-mono text-[11px] font-semibold tabular-nums">
              {Number.isInteger(variacV) ? variacV : variacV.toFixed(1)} V
            </span>
          )}
        </div>
      </div>

      {/* Numeric readouts practice switch */}
      <div
        className="flex items-center justify-between rounded-xl px-2.5 py-1.5"
        style={{
          backgroundColor: 'var(--vml-panel-hover)',
          border: '1px solid var(--vml-border)',
        }}
      >
        <div>
          <div className="font-semibold">Numeric readouts</div>
          <div
            className="text-[10px]"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            Hide to practise reading pointers
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showNumericReadouts}
          onClick={onToggleNumericReadouts}
          className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
          style={{
            backgroundColor: showNumericReadouts
              ? 'var(--vml-accent)'
              : '#64748b',
          }}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              showNumericReadouts ? 'translate-x-4.5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Generic Analog Meters */}
      {analogMeters.length > 0 && (
        <div
          className="space-y-2 rounded-xl p-2.5"
          style={{ border: '1px solid var(--vml-border)' }}
        >
          {analogMeters.map((m) => {
            const dec = m.decimals ?? (m.kind === 'ammeter' ? 2 : 1);
            const valText = m.damaged ? '0.0' : m.shownValue.toFixed(dec);
            return (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{m.label}</div>
                  <div
                    className="text-[10px]"
                    style={{ color: 'var(--vml-text-muted)' }}
                  >
                    {m.id} · 0–{m.range} {m.unit}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge
                    damaged={m.damaged}
                    reversed={m.reversed}
                    overrange={m.overrange}
                  />
                  <span className="font-mono text-sm font-bold tabular-nums">
                    {showNumericReadouts ? `${valText} ${m.unit}` : `— ${m.unit}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generic Wattmeters */}
      {wattmeters.map((wm) => {
        const dialText = wm.damaged ? '0.0' : (wm.dial ?? 0).toFixed(1);
        const mfText = (wm.mf ?? 1).toFixed(2);
        const powerText = wm.damaged
          ? '0.0'
          : ((wm.dial ?? 0) * (wm.mf ?? 1)).toFixed(1);
        const pfTag = wm.pf !== undefined && wm.pf < 0.99 ? ` · PF ${wm.pf}` : '';
        return (
          <div
            key={wm.id}
            className="space-y-1.5 rounded-xl p-2.5"
            style={{ border: '1px solid var(--vml-border)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{wm.label}</div>
                <div
                  className="text-[10px]"
                  style={{ color: 'var(--vml-text-muted)' }}
                >
                  {wm.id} · {wm.vRange ?? 300} V / {wm.iRange ?? 10} A ·{' '}
                  {wm.divisions ?? 150} div{pfTag}
                </div>
              </div>
              <StatusBadge
                damaged={wm.damaged}
                reversed={wm.reversed}
                overrange={wm.overrange}
              />
            </div>

            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--vml-text-muted)' }}>Dial reading</span>
              <span className="font-mono font-bold tabular-nums">
                {showNumericReadouts ? `${dialText} div` : '— div'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--vml-text-muted)' }}>
                Multiplying factor (MF)
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {mfText} W/div
              </span>
            </div>

            <div
              className="flex items-center justify-between pt-1.5"
              style={{ borderTop: '1px solid var(--vml-border)' }}
            >
              <span style={{ color: 'var(--vml-text-muted)' }}>
                Power (dial × MF)
              </span>
              <span
                className="font-mono text-sm font-bold tabular-nums"
                style={{ color: 'var(--vml-accent)' }}
              >
                {showNumericReadouts ? `${powerText} W` : '— W'}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
});

export function RightSidebar({
  experiment,
  controls,
  output,
  energised,
  controlsLocked = false,
  unlockHint,
}: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('bench');
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const netTapPointerTypeRef = useRef<string>('mouse');

  const mode = useSessionStore((s) => s.mode);
  const currentStageIndex = useSessionStore((s) => s.currentStageIndex);
  const sidebarOpen = useSessionStore((s) => s.sidebarOpen);
  const toggleSidebar = useSessionStore((s) => s.toggleSidebar);
  const showNumericReadouts = useSessionStore((s) => s.showNumericReadouts);
  const toggleNumericReadouts = useSessionStore((s) => s.toggleNumericReadouts);
  const observationRows = useSessionStore((s) => s.observationRows);
  const addObservationRow = useSessionStore((s) => s.addObservationRow);
  const highlightedNetIndex = useSessionStore((s) => s.highlightedNetIndex);
  const highlightedNetPinned = useSessionStore((s) => s.highlightedNetPinned);
  const setHighlightedNetIndex = useSessionStore((s) => s.setHighlightedNetIndex);
  const clearHighlightedNet = useSessionStore((s) => s.clearHighlightedNet);

  const values = useControlsStore((s) => s.values);
  const mcbTripped = useControlsStore((s) => s.mcbTripped);
  const supplyOn = isSupplySwitchOn(values);
  const sessionSeed = useSessionStore((s) => s.sessionSeed);
  const activeProbeLead = useSessionStore((s) => s.activeProbeLead);
  const setActiveProbeLead = useSessionStore((s) => s.setActiveProbeLead);
  const clearProbeLeads = useSessionStore((s) => s.clearProbeLeads);
  const identifiedPairs = useSessionStore((s) => s.identifiedPairs);
  const addIdentifiedPair = useSessionStore((s) => s.addIdentifiedPair);
  const removeIdentifiedPair = useSessionStore((s) => s.removeIdentifiedPair);
  const identifiedPhases = useSessionStore((s) => s.identifiedPhases);
  const setIdentifiedPhases = useSessionStore((s) => s.setIdentifiedPhases);
  const [phaseAssign, setPhaseAssign] = useState<Record<string, 'a' | 'b' | 'c'>>({});
  const variacCtrl = controls.find((c) => c.kind === 'knob');
  const variacV = variacCtrl ? Number(values[variacCtrl.id] ?? 0) : 0;

  const stage = getStage(experiment, currentStageIndex);
  const isObserveMode = mode === 'observe';
  const hasObservations = mode === 'self' || isObserveMode || mode === 'learn';
  const currentTab: SidebarTab = hasObservations ? activeTab : 'bench';
  const canAddRow =
    hasObservations &&
    supplyOn &&
    energised &&
    observationRows.length < MAX_OBSERVATION_ROWS;

  const dragStartY = useRef<number | null>(null);

  const handleAddRow = () => {
    addObservationRow(output, values, energised);
  };

  const tabBar = hasObservations ? (
    <div
      className="grid grid-cols-2 gap-1 p-1.5"
      style={{ borderBottom: '1px solid var(--vml-border)' }}
      role="tablist"
      aria-label="Sidebar sections"
    >
      <button
        type="button"
        role="tab"
        aria-selected={currentTab === 'bench'}
        onClick={() => setActiveTab('bench')}
        className="rounded-lg py-1.5 text-xs font-semibold transition"
        style={{
          backgroundColor:
            currentTab === 'bench' ? 'var(--vml-accent)' : 'transparent',
          color:
            currentTab === 'bench'
              ? 'var(--vml-accent-text)'
              : 'var(--vml-text)',
        }}
      >
        Bench
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={currentTab === 'observations'}
        onClick={() => setActiveTab('observations')}
        className="rounded-lg py-1.5 text-xs font-semibold transition"
        style={{
          backgroundColor:
            currentTab === 'observations' ? 'var(--vml-accent)' : 'transparent',
          color:
            currentTab === 'observations'
              ? 'var(--vml-accent-text)'
              : 'var(--vml-text)',
        }}
      >
        Observations ({observationRows.length})
      </button>
    </div>
  ) : null;

  const connectionsSection = isObserveMode ? (
    <section
      style={{ borderTop: '1px solid var(--vml-border)' }}
      className="pt-3.5"
    >
      <button
        type="button"
        aria-expanded={connectionsOpen}
        onClick={() => {
          setConnectionsOpen((open) => {
            if (open) clearHighlightedNet();
            return !open;
          });
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-bold"
        style={{
          backgroundColor: 'var(--vml-panel-hover)',
          border: '1px solid var(--vml-border)',
          color: 'var(--vml-text)',
        }}
      >
        <span>Connections ({stage.acceptedNetlists[0]?.length ?? 0} nets)</span>
        <span className="font-mono text-[11px]">
          {connectionsOpen ? '▾' : '▸'}
        </span>
      </button>

      {connectionsOpen && (
        <div className="mt-2.5 space-y-2.5 text-xs">
          <p className="text-[11px]" style={{ color: 'var(--vml-text-muted)' }}>
            Hover on desktop or tap on touch to highlight a net on the bench.
          </p>
          {(() => {
            const netlist = stage.acceptedNetlists[0] ?? [];
            const keys = stage.netCategoryKeys ?? [];
            const labels = stage.netLabels ?? [];
            const purposes = stage.netPurposes ?? {};
            const orderedGroups: string[] = [];
            for (const k of keys) {
              if (!orderedGroups.includes(k)) orderedGroups.push(k);
            }
            if (orderedGroups.length === 0) orderedGroups.push('all');

            return orderedGroups.map((catKey) => {
              const indices = netlist
                .map((_, idx) => idx)
                .filter((idx) => (keys[idx] ?? 'all') === catKey);
              if (indices.length === 0) return null;
              const purposeText =
                catKey !== 'all'
                  ? purposes[catKey as keyof typeof purposes]
                  : undefined;

              return (
                <div
                  key={catKey}
                  className="space-y-1.5 rounded-xl p-2"
                  style={{ border: '1px solid var(--vml-border)' }}
                >
                  <div className="font-semibold capitalize">{catKey}</div>
                  {purposeText && (
                    <p
                      className="text-[11px] leading-snug"
                      style={{ color: 'var(--vml-text-muted)' }}
                    >
                      {purposeText}
                    </p>
                  )}
                  <div className="space-y-1">
                    {indices.map((netIdx) => {
                      const net = netlist[netIdx];
                      const active = highlightedNetIndex === netIdx;
                      return (
                        <button
                          key={netIdx}
                          type="button"
                          onPointerDown={(e) => {
                            netTapPointerTypeRef.current = e.pointerType;
                          }}
                          onMouseEnter={() => {
                            if (!highlightedNetPinned) {
                              setHighlightedNetIndex(netIdx, false);
                            }
                          }}
                          onMouseLeave={() => {
                            if (!highlightedNetPinned) {
                              clearHighlightedNet();
                            }
                          }}
                          onClick={() => {
                            if (netTapPointerTypeRef.current !== 'mouse') {
                              if (highlightedNetIndex === netIdx) {
                                clearHighlightedNet();
                              } else {
                                setHighlightedNetIndex(netIdx, true);
                              }
                            } else if (
                              highlightedNetPinned &&
                              highlightedNetIndex === netIdx
                            ) {
                              clearHighlightedNet();
                            } else {
                              setHighlightedNetIndex(netIdx, true);
                            }
                          }}
                          aria-pressed={active}
                          className="w-full rounded-lg px-2 py-1.5 text-left transition"
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
                          <div className="text-[11px] font-semibold">
                            {labels[netIdx] ?? `Net ${netIdx + 1}`}
                          </div>
                          <div className="font-mono text-[10px] opacity-85">
                            {net.join(' · ')}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </section>
  ) : null;

  const probeA = String(values['probe.a'] ?? '');
  const probeB = String(values['probe.b'] ?? '');
  const probeReading = output.meters.find((m) => m.id === 'probe');
  const resolvedLabels = resolveScrambledTerminalLabels(
    sessionSeed,
    identifiedPairs,
    identifiedPhases.length === 3,
  );
  const shortTerm = (id: string) =>
    id ? (resolvedLabels[id] ?? id.replace(/^tx\./, '')) : '--';

  const probeSection = stage.probeEnabled ? (
    <section
      className="space-y-2 rounded-xl p-2.5"
      style={{
        backgroundColor: 'var(--vml-panel-hover)',
        border: '1px solid var(--vml-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">Probe Voltmeter Leads</span>
        <span
          className="font-mono text-xs font-bold"
          style={{ color: 'var(--vml-accent)' }}
        >
          {(probeReading?.shownValue ?? 0).toFixed(1)} V
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => setActiveProbeLead(null)}
          className="rounded-md px-1.5 py-1 text-[11px] font-semibold transition"
          style={{
            backgroundColor:
              activeProbeLead === null ? 'var(--vml-accent)' : 'var(--vml-panel)',
            color:
              activeProbeLead === null
                ? 'var(--vml-accent-text)'
                : 'var(--vml-text)',
            border: '1px solid var(--vml-border)',
          }}
        >
          Wire Mode
        </button>
        <button
          type="button"
          onClick={() => setActiveProbeLead(activeProbeLead === 'a' ? null : 'a')}
          className="rounded-md px-1.5 py-1 text-[11px] font-semibold transition"
          style={{
            backgroundColor:
              activeProbeLead === 'a' ? '#ef4444' : 'var(--vml-panel)',
            color: activeProbeLead === 'a' ? '#ffffff' : '#fca5a5',
            border: '1px solid var(--vml-border)',
          }}
        >
          + {shortTerm(probeA)}
        </button>
        <button
          type="button"
          onClick={() => setActiveProbeLead(activeProbeLead === 'b' ? null : 'b')}
          className="rounded-md px-1.5 py-1 text-[11px] font-semibold transition"
          style={{
            backgroundColor:
              activeProbeLead === 'b' ? '#0284c7' : 'var(--vml-panel)',
            color: activeProbeLead === 'b' ? '#ffffff' : '#7dd3fc',
            border: '1px solid var(--vml-border)',
          }}
        >
          - {shortTerm(probeB)}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px]" style={{ color: 'var(--vml-text-muted)' }}>
          {activeProbeLead
            ? `Click any secondary terminal in 3D to clip ${activeProbeLead === 'a' ? 'Red (+)' : 'Black (-)'} lead.`
            : 'Select + or - lead to probe terminals without disconnecting wires.'}
        </p>
        {(probeA || probeB) && (
          <button
            type="button"
            onClick={clearProbeLeads}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-border)',
            }}
          >
            Clear
          </button>
        )}
      </div>
    </section>
  ) : null;

  const assignPairPhase = (pairKey: string, phase: 'a' | 'b' | 'c') => {
    const next = { ...phaseAssign, [pairKey]: phase };
    setPhaseAssign(next);
    const groups: string[][] = (['a', 'b', 'c'] as const).map((ph) =>
      identifiedPairs
        .map((p) => canonicalPairKey(p[0], p[1]))
        .filter((k) => next[k] === ph),
    );
    setIdentifiedPhases(groups);
  };

  const identificationSection = stage.identificationMode ? (
    <section
      className="space-y-2 rounded-xl p-2.5"
      style={{
        backgroundColor: 'var(--vml-panel-hover)',
        border: '1px solid var(--vml-border)',
      }}
    >
      {stage.identificationMode === 'winding-pairs' && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Winding Pairs (W1–W6)</span>
            <span className="text-[11px] font-semibold text-emerald-400">
              {identifiedPairs.length} / 6
            </span>
          </div>
          <button
            type="button"
            disabled={!probeA || !probeB || probeA === probeB || identifiedPairs.length >= 6}
            onClick={() => addIdentifiedPair(probeA, probeB)}
            className="w-full rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              backgroundColor: 'var(--vml-accent)',
              color: 'var(--vml-accent-text)',
            }}
          >
            Pair probed terminals ({shortTerm(probeA)} · {shortTerm(probeB)})
          </button>
          {identifiedPairs.length > 0 && (
            <div className="space-y-1">
              {identifiedPairs.map(([a, b], idx) => (
                <div
                  key={canonicalPairKey(a, b)}
                  className="flex items-center justify-between rounded-md px-2 py-1 text-[11px]"
                  style={{
                    backgroundColor: 'var(--vml-panel)',
                    border: '1px solid var(--vml-border)',
                  }}
                >
                  <span className="font-mono font-semibold">
                    W{idx + 1}: {a.replace(/^tx\./, '')} ↔ {b.replace(/^tx\./, '')}
                  </span>
                  {!isObserveMode && (
                    <button
                      type="button"
                      onClick={() => removeIdentifiedPair(idx)}
                      className="text-[11px] font-bold text-rose-400 hover:text-rose-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {stage.identificationMode === 'phase-groups' && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Group Phases (a, b, c)</span>
            <span className="text-[10px]" style={{ color: 'var(--vml-text-muted)' }}>
              2 pairs per phase
            </span>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--vml-text-muted)' }}>
            Connect winding pairs in series on the bench: same-phase halves give 0 V (opposing) or ~115 V (aiding); different phases give ~57.5 V or ~99.6 V.
          </p>
          <div className="space-y-1">
            {identifiedPairs.map(([a, b], idx) => {
              const key = canonicalPairKey(a, b);
              const assigned =
                phaseAssign[key] ??
                (identifiedPhases[0]?.includes(key)
                  ? 'a'
                  : identifiedPhases[1]?.includes(key)
                    ? 'b'
                    : identifiedPhases[2]?.includes(key)
                      ? 'c'
                      : undefined);
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px]"
                  style={{
                    backgroundColor: 'var(--vml-panel)',
                    border: '1px solid var(--vml-border)',
                  }}
                >
                  <span className="font-mono">
                    W{idx + 1} ({a.replace(/^tx\./, '')}–{b.replace(/^tx\./, '')})
                  </span>
                  <div className="flex gap-1">
                    {(['a', 'b', 'c'] as const).map((ph) => (
                      <button
                        key={ph}
                        type="button"
                        disabled={isObserveMode}
                        onClick={() => assignPairPhase(key, ph)}
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                        style={{
                          backgroundColor:
                            assigned === ph ? 'var(--vml-accent)' : 'transparent',
                          color:
                            assigned === ph
                              ? 'var(--vml-accent-text)'
                              : 'var(--vml-text-muted)',
                          border: '1px solid var(--vml-border)',
                        }}
                      >
                        {ph}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  ) : null;

  const benchTabBody = (
    <div className="space-y-4">
      <ControlsSection
        controls={controls}
        controlsLocked={controlsLocked}
        unlockHint={unlockHint}
      />
      {probeSection}
      {identificationSection}
      <div style={{ borderTop: '1px solid var(--vml-border)' }} className="pt-3.5">
        <ReadingsSection
          meters={output.meters}
          supplyOn={supplyOn}
          mcbTripped={mcbTripped}
          variacV={variacV}
          hasVariac={Boolean(variacCtrl)}
          showNumericReadouts={showNumericReadouts}
          onToggleNumericReadouts={toggleNumericReadouts}
        />
      </div>
      {connectionsSection}
    </div>
  );

  const observationsTabBody = (
    <ObservationsPanel
      experiment={experiment}
      output={output}
      controls={values}
      energised={energised}
    />
  );

  const stickyAddRowBar =
    hasObservations && currentTab === 'bench' ? (
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-3.5 py-2.5"
        style={{
          borderTop: '1px solid var(--vml-border)',
          backgroundColor: 'var(--vml-panel)',
        }}
      >
        <button
          type="button"
          disabled={!canAddRow}
          onClick={handleAddRow}
          className="flex-1 rounded-lg px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            backgroundColor: 'var(--vml-accent)',
            color: 'var(--vml-accent-text)',
          }}
        >
          + Add row
        </button>
        <span
          className="font-mono text-xs font-semibold tabular-nums"
          style={{ color: 'var(--vml-text-muted)' }}
        >
          {observationRows.length}/{MAX_OBSERVATION_ROWS}
        </span>
      </div>
    ) : null;

  const peekMeters = output.meters.slice(0, 3);

  return (
    <>
      {/* Desktop right sidebar */}
      <div className="relative hidden h-full shrink-0 md:flex">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Hide sidebar (S)' : 'Show sidebar (S)'}
          aria-expanded={sidebarOpen}
          className="absolute top-1/2 -left-6 z-20 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg text-xs font-bold shadow-md transition"
          style={{
            backgroundColor: 'var(--vml-panel)',
            border: '1px solid var(--vml-border)',
            borderRight: 'none',
            color: 'var(--vml-text)',
          }}
        >
          {sidebarOpen ? '›' : '‹'}
        </button>

        <aside
          aria-label="Bench controls, readings, and observations"
          className="h-full overflow-hidden transition-[width] duration-200 ease-out"
          style={{
            width: sidebarOpen ? 320 : 0,
            backgroundColor: 'var(--vml-panel)',
            borderLeft: sidebarOpen ? '1px solid var(--vml-border)' : 'none',
            color: 'var(--vml-text)',
          }}
        >
          <div className="flex h-full w-[320px] flex-col">
            {tabBar}
            <div className="flex-1 overflow-y-auto p-3.5">
              {currentTab === 'bench' ? benchTabBody : observationsTabBody}
            </div>
            {stickyAddRowBar}
          </div>
        </aside>
      </div>

      {/* Phone bottom sheet with drag handle + peek bar */}
      <aside
        aria-label="Bench controls, readings, and observations"
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl shadow-2xl backdrop-blur transition-transform duration-200 ease-out md:hidden"
        style={{
          backgroundColor: 'var(--vml-panel)',
          borderTop: '1px solid var(--vml-border)',
          color: 'var(--vml-text)',
          transform: sidebarOpen ? 'translateY(0)' : 'translateY(100%)',
        }}
      >
        <div
          className="cursor-grab px-3 pt-2 pb-2 active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            dragStartY.current = e.clientY;
          }}
          onPointerUp={(e) => {
            if (dragStartY.current === null) return;
            const dy = dragStartY.current - e.clientY;
            dragStartY.current = null;
            if (Math.abs(dy) < 8) {
              setMobileExpanded((prev) => !prev);
            } else if (dy > 20) {
              setMobileExpanded(true);
            } else if (dy < -20) {
              setMobileExpanded(false);
            }
          }}
        >
          <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-slate-400/60" />
          <div className="flex items-center justify-between gap-1.5 font-mono text-[11px] tabular-nums">
            {peekMeters.map((m) => {
              const dec = m.decimals ?? (m.kind === 'ammeter' ? 2 : 1);
              const valStr = m.damaged ? 'DMG' : `${m.shownValue.toFixed(dec)}${m.unit}`;
              return (
                <span key={m.id}>
                  {m.id.toUpperCase()}:
                  <strong
                    style={
                      m.kind === 'wattmeter'
                        ? { color: 'var(--vml-accent)' }
                        : undefined
                    }
                  >
                    {showNumericReadouts ? valStr : '—'}
                  </strong>
                </span>
              );
            })}
            <div className="flex items-center gap-1">
              {hasObservations && (
                <button
                  type="button"
                  disabled={!canAddRow}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddRow();
                  }}
                  className="rounded px-2 py-0.5 font-sans text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
                  style={{
                    backgroundColor: 'var(--vml-accent)',
                    color: 'var(--vml-accent-text)',
                  }}
                >
                  + Row
                </button>
              )}
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileExpanded((prev) => !prev);
                }}
                aria-expanded={mobileExpanded}
                className="rounded px-2 py-0.5 font-sans text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--vml-panel-hover)',
                  border: '1px solid var(--vml-border)',
                }}
              >
                {mobileExpanded ? 'Collapse' : 'Open'}
              </button>
            </div>
          </div>
        </div>

        <div
          className="flex flex-col overflow-hidden transition-[max-height] duration-200 ease-out"
          style={{ maxHeight: mobileExpanded ? '62vh' : '0px' }}
        >
          {tabBar}
          <div className="max-h-[48vh] overflow-y-auto p-3.5">
            {currentTab === 'bench' ? benchTabBody : observationsTabBody}
          </div>
          {stickyAddRowBar}
        </div>
      </aside>
    </>
  );
}
