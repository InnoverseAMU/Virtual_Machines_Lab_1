import { memo, useRef, useState } from 'react';
import type { ControlDef, TransformerLoadOutput } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';

type SidebarTab = 'readings' | 'controls';

interface RightSidebarProps {
  controls: ControlDef[];
  output: TransformerLoadOutput;
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

interface ReadingsViewProps {
  vpText: string;
  vpOverrange: boolean;
  vpDamaged: boolean;
  vsText: string;
  vsOverrange: boolean;
  vsDamaged: boolean;
  amText: string;
  amOverrange: boolean;
  amDamaged: boolean;
  wmDialText: string;
  wmMfText: string;
  wmPowerText: string;
  wmOverrange: boolean;
  wmDamaged: boolean;
  wmReversed: boolean;
  wmVRange: number;
  wmIRange: number;
  vpRange: number;
  vsRange: number;
  amRange: number;
  supplyOn: boolean;
  mcbTripped: boolean;
  variacV: number;
  showNumericReadouts: boolean;
  onToggleNumericReadouts: () => void;
}

const ReadingsTab = memo(function ReadingsTab({
  vpText,
  vpOverrange,
  vpDamaged,
  vsText,
  vsOverrange,
  vsDamaged,
  amText,
  amOverrange,
  amDamaged,
  wmDialText,
  wmMfText,
  wmPowerText,
  wmOverrange,
  wmDamaged,
  wmReversed,
  wmVRange,
  wmIRange,
  vpRange,
  vsRange,
  amRange,
  supplyOn,
  mcbTripped,
  variacV,
  showNumericReadouts,
  onToggleNumericReadouts,
}: ReadingsViewProps) {
  return (
    <div className="space-y-3 text-xs">
      {/* Numeric readouts practice switch */}
      <div
        className="flex items-center justify-between rounded-xl px-3 py-2"
        style={{
          backgroundColor: 'var(--vml-panel-hover)',
          border: '1px solid var(--vml-border)',
        }}
      >
        <div>
          <div className="font-semibold">Numeric readouts</div>
          <div
            className="text-[11px]"
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

      {/* Supply & Variac status */}
      <div
        className="space-y-2 rounded-xl p-3"
        style={{ border: '1px solid var(--vml-border)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">230 V AC supply</div>
            <div
              className="text-[10px]"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              sup · MCB
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge tripped={mcbTripped} />
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                supplyOn
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-600 text-slate-100'
              }`}
            >
              {supplyOn ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">Autotransformer</div>
            <div
              className="text-[10px]"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              va · 0–270 V knob
            </div>
          </div>
          <span className="font-mono text-sm font-bold tabular-nums">
            {variacV} V
          </span>
        </div>
      </div>

      {/* Analog Meters */}
      <div
        className="space-y-2.5 rounded-xl p-3"
        style={{ border: '1px solid var(--vml-border)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">V primary</div>
            <div
              className="text-[10px]"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              vp · 0–{vpRange} V
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge damaged={vpDamaged} overrange={vpOverrange} />
            <span className="font-mono text-sm font-bold tabular-nums">
              {showNumericReadouts ? `${vpText} V` : '— V'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">V secondary</div>
            <div
              className="text-[10px]"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              vs · 0–{vsRange} V
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge damaged={vsDamaged} overrange={vsOverrange} />
            <span className="font-mono text-sm font-bold tabular-nums">
              {showNumericReadouts ? `${vsText} V` : '— V'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">A secondary</div>
            <div
              className="text-[10px]"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              am · 0–{amRange} A
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge damaged={amDamaged} overrange={amOverrange} />
            <span className="font-mono text-sm font-bold tabular-nums">
              {showNumericReadouts ? `${amText} A` : '— A'}
            </span>
          </div>
        </div>
      </div>

      {/* Wattmeter */}
      <div
        className="space-y-2 rounded-xl p-3"
        style={{ border: '1px solid var(--vml-border)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">Wattmeter</div>
            <div
              className="text-[10px]"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              wm · {wmVRange} V / {wmIRange} A · 150 div
            </div>
          </div>
          <StatusBadge
            damaged={wmDamaged}
            reversed={wmReversed}
            overrange={wmOverrange}
          />
        </div>

        <div className="flex items-center justify-between">
          <span style={{ color: 'var(--vml-text-muted)' }}>Dial reading</span>
          <span className="font-mono font-bold tabular-nums">
            {showNumericReadouts ? `${wmDialText} div` : '— div'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span style={{ color: 'var(--vml-text-muted)' }}>
            Multiplying factor (MF)
          </span>
          <span className="font-mono font-semibold tabular-nums">
            {wmMfText} W/div
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
            {showNumericReadouts ? `${wmPowerText} W` : '— W'}
          </span>
        </div>
      </div>
    </div>
  );
});

const ControlsTab = memo(function ControlsTab({
  controls,
}: {
  controls: ControlDef[];
}) {
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
    <div className="space-y-4">
      {controls.map((ctrl) => {
        if (ctrl.kind === 'switch') {
          return (
            <div key={ctrl.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{ctrl.label}</span>
                {mcbTripped && <StatusBadge tripped />}
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
                <label htmlFor={`sb-${ctrl.id}`} className="text-xs font-medium">
                  {ctrl.label}
                </label>
                <span
                  className="font-mono text-xs font-bold tabular-nums"
                  style={{ color: 'var(--vml-accent)' }}
                >
                  {variacV} {ctrl.unit}
                </span>
              </div>
              <input
                id={`sb-${ctrl.id}`}
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
                <span className="text-xs font-medium tabular-nums">
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
  );
});

export function RightSidebar({ controls, output }: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('readings');
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const sidebarOpen = useSessionStore((s) => s.sidebarOpen);
  const toggleSidebar = useSessionStore((s) => s.toggleSidebar);
  const showNumericReadouts = useSessionStore((s) => s.showNumericReadouts);
  const toggleNumericReadouts = useSessionStore((s) => s.toggleNumericReadouts);

  const supplyOn = useControlsStore((s) => s.supplyOn);
  const mcbTripped = useControlsStore((s) => s.mcbTripped);
  const variacV = useControlsStore((s) => s.variacV);
  const wmVRange = useControlsStore((s) => s.wmVRange);
  const wmIRange = useControlsStore((s) => s.wmIRange);

  const { vp, vs, am, wm } = output.meters;

  const vpText = vp.damaged ? '0.0' : vp.shownValue.toFixed(1);
  const vsText = vs.damaged ? '0.0' : vs.shownValue.toFixed(1);
  const amText = am.damaged ? '0.00' : am.shownValue.toFixed(2);
  const wmDialText = wm.damaged ? '0.0' : wm.dial.toFixed(1);
  const wmMfText = wm.mf.toFixed(2);
  const wmPowerText = wm.damaged ? '0.0' : (wm.dial * wm.mf).toFixed(1);

  const dragStartY = useRef<number | null>(null);

  const tabBar = (
    <div
      className="grid grid-cols-2 gap-1 p-1.5"
      style={{ borderBottom: '1px solid var(--vml-border)' }}
      role="tablist"
      aria-label="Sidebar sections"
    >
      {(['readings', 'controls'] as const).map((tab) => {
        const active = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setActiveTab(tab)}
            className="rounded-lg py-1.5 text-xs font-semibold capitalize transition"
            style={{
              backgroundColor: active ? 'var(--vml-accent)' : 'transparent',
              color: active ? 'var(--vml-accent-text)' : 'var(--vml-text)',
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );

  const tabContent =
    activeTab === 'readings' ? (
      <ReadingsTab
        vpText={vpText}
        vpOverrange={vp.overrange}
        vpDamaged={vp.damaged}
        vsText={vsText}
        vsOverrange={vs.overrange}
        vsDamaged={vs.damaged}
        amText={amText}
        amOverrange={am.overrange}
        amDamaged={am.damaged}
        wmDialText={wmDialText}
        wmMfText={wmMfText}
        wmPowerText={wmPowerText}
        wmOverrange={wm.overrange}
        wmDamaged={wm.damaged}
        wmReversed={wm.reversed}
        wmVRange={wmVRange}
        wmIRange={wmIRange}
        vpRange={vp.range}
        vsRange={vs.range}
        amRange={am.range}
        supplyOn={supplyOn}
        mcbTripped={mcbTripped}
        variacV={variacV}
        showNumericReadouts={showNumericReadouts}
        onToggleNumericReadouts={toggleNumericReadouts}
      />
    ) : (
      <ControlsTab controls={controls} />
    );

  return (
    <>
      {/* Desktop right sidebar (pushes/resizes canvas without overlay) */}
      <div className="relative hidden h-full shrink-0 md:flex">
        {/* Edge arrow tab */}
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
          aria-label="Readings and bench controls"
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
            <div className="flex-1 overflow-y-auto p-3.5">{tabContent}</div>
          </div>
        </aside>
      </div>

      {/* Phone bottom sheet with drag handle + peek bar */}
      <aside
        aria-label="Readings and bench controls"
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl shadow-2xl backdrop-blur transition-transform duration-200 ease-out md:hidden"
        style={{
          backgroundColor: 'var(--vml-panel)',
          borderTop: '1px solid var(--vml-border)',
          color: 'var(--vml-text)',
          transform: sidebarOpen ? 'translateY(0)' : 'translateY(100%)',
        }}
      >
        {/* Drag handle & peek bar */}
        <div
          className="cursor-grab px-3.5 pt-2 pb-2.5 active:cursor-grabbing"
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
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-400/60" />
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
            <span>
              V1:{' '}
              <strong>
                {showNumericReadouts ? `${vpText}V` : '—'}
              </strong>
            </span>
            <span>
              V2:{' '}
              <strong>
                {showNumericReadouts ? `${vsText}V` : '—'}
              </strong>
            </span>
            <span>
              WM:{' '}
              <strong style={{ color: 'var(--vml-accent)' }}>
                {showNumericReadouts ? `${wmPowerText}W` : '—'}
              </strong>
            </span>
            <button
              type="button"
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

        <div
          className="overflow-hidden transition-[max-height] duration-200 ease-out"
          style={{ maxHeight: mobileExpanded ? '58vh' : '0px' }}
        >
          {tabBar}
          <div className="max-h-[48vh] overflow-y-auto p-3.5">
            {tabContent}
          </div>
        </div>
      </aside>
    </>
  );
}
