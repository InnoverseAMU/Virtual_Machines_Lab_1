import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getExperiment } from './core/experiments/registry';
import { evaluateExperimentPhysics } from './core/physics/evaluate';
import type { CameraPreset } from './core/types';
import { BenchScene } from './scenes/BenchScene';
import { useControlsStore } from './stores/controlsStore';
import { useSessionStore } from './stores/sessionStore';
import { useWiringStore } from './stores/wiringStore';
import { ExperimentPicker } from './ui/ExperimentPicker';
import { Modal } from './ui/Modal';
import { ModeSelect } from './ui/ModeSelect';
import { ResultModal } from './ui/ResultModal';
import { RightSidebar } from './ui/RightSidebar';
import { SolutionBanner } from './ui/SolutionBanner';
import { ThemeToggleButton } from './ui/ThemeToggleButton';
import { ToastBanner } from './ui/ToastBanner';

const PRESET_BUTTONS: { id: CameraPreset; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'supply', label: 'Supply' },
  { id: 'meters', label: 'Meters' },
  { id: 'transformer', label: 'Transformer' },
  { id: 'load', label: 'Load' },
];

const STICKY_EVENT_IDS = new Set([
  'mcb-trip',
  'power-on-non-zero',
  'wiring-blocked',
]);

export function App() {
  const [confirmAction, setConfirmAction] = useState<'back' | 'reset' | null>(
    null,
  );
  const [moreOpen, setMoreOpen] = useState(false);

  const screen = useSessionStore((s) => s.screen);
  const experimentId = useSessionStore((s) => s.experimentId);
  const cameraPreset = useSessionStore((s) => s.cameraPreset);
  const showTerminalLabels = useSessionStore((s) => s.showTerminalLabels);
  const sidebarOpen = useSessionStore((s) => s.sidebarOpen);
  const validationResult = useSessionStore((s) => s.validationResult);

  const goToScreen = useSessionStore((s) => s.goToScreen);
  const setCameraPreset = useSessionStore((s) => s.setCameraPreset);
  const toggleTerminalLabels = useSessionStore((s) => s.toggleTerminalLabels);
  const toggleSidebar = useSessionStore((s) => s.toggleSidebar);
  const submitWiring = useSessionStore((s) => s.submitWiring);
  const openLastResult = useSessionStore((s) => s.openLastResult);
  const pushToast = useSessionStore((s) => s.pushToast);
  const dismissToast = useSessionStore((s) => s.dismissToast);
  const resetLabSession = useSessionStore((s) => s.resetLabSession);

  const wires = useWiringStore((s) => s.wires);
  const selectedTerminal = useWiringStore((s) => s.selectedTerminal);
  const clearSelectedTerminal = useWiringStore((s) => s.clearSelectedTerminal);
  const clearAllWires = useWiringStore((s) => s.clearAllWires);

  const supplyOn = useControlsStore((s) => s.supplyOn);
  const variacV = useControlsStore((s) => s.variacV);
  const wmVRange = useControlsStore((s) => s.wmVRange);
  const wmIRange = useControlsStore((s) => s.wmIRange);
  const lamps = useControlsStore((s) => s.lamps);
  const gains = useControlsStore((s) => s.gains);
  const tripMcb = useControlsStore((s) => s.tripMcb);
  const setFocusedControl = useControlsStore((s) => s.setFocusedControl);
  const initFromControls = useControlsStore((s) => s.initFromControls);

  const experiment = useMemo(() => getExperiment(experimentId), [experimentId]);

  useEffect(() => {
    initFromControls(experiment.controls);
  }, [experiment, initFromControls]);

  const evaluation = useMemo(
    () =>
      evaluateExperimentPhysics(
        experiment,
        wires,
        { supplyOn, variacV, wmVRange, wmIRange, lamps },
        gains,
      ),
    [experiment, wires, supplyOn, variacV, wmVRange, wmIRange, lamps, gains],
  );

  const prevEventIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (screen !== 'lab') return;
    const { mcbTripped, events } = evaluation.output;
    if (mcbTripped) {
      tripMcb();
    }

    const currentIds = new Set(events.map((e) => e.id));

    for (const ev of events) {
      if (!prevEventIdsRef.current.has(ev.id)) {
        pushToast(ev);
      }
    }

    for (const oldId of prevEventIdsRef.current) {
      if (!currentIds.has(oldId) && !STICKY_EVENT_IDS.has(oldId)) {
        dismissToast(oldId);
      }
    }

    prevEventIdsRef.current = currentIds;
  }, [screen, evaluation.output, tripMcb, pushToast, dismissToast]);

  useEffect(() => {
    if (supplyOn && !evaluation.output.mcbTripped) {
      dismissToast('mcb-trip');
    }
  }, [supplyOn, evaluation.output.mcbTripped, dismissToast]);

  useEffect(() => {
    if (screen !== 'lab') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'Escape') {
        clearSelectedTerminal();
        setFocusedControl(null);
      } else if (
        (e.key === 'l' || e.key === 'L') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        toggleTerminalLabels();
      } else if (
        (e.key === 's' || e.key === 'S') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    screen,
    clearSelectedTerminal,
    setFocusedControl,
    toggleTerminalLabels,
    toggleSidebar,
  ]);

  const performResetBench = useCallback(() => {
    initFromControls(experiment.controls);
    clearAllWires(false);
    resetLabSession();
    prevEventIdsRef.current.clear();
  }, [initFromControls, experiment.controls, clearAllWires, resetLabSession]);

  const handleBackClick = () => {
    if (wires.length > 0) {
      setConfirmAction('back');
      return;
    }
    performResetBench();
    goToScreen('picker');
  };

  if (screen === 'picker') {
    return <ExperimentPicker />;
  }

  if (screen === 'mode') {
    return <ModeSelect />;
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden select-none">
      {/* Main 3D canvas area resizes smoothly when sidebar opens/closes */}
      <div className="relative h-full min-w-0 flex-1 overflow-hidden">
        <BenchScene
          labOutput={evaluation.output}
          connectionState={evaluation.connectionState}
        />

        {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-2.5 z-20 flex flex-wrap items-center justify-between gap-1.5 px-2.5 md:px-3">
          {/* Left group: Back + self-mode actions */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleBackClick}
              className="h-8 rounded-full px-2.5 text-xs font-semibold shadow-lg backdrop-blur transition"
              style={{
                backgroundColor: 'var(--vml-panel)',
                border: '1px solid var(--vml-border)',
                color: 'var(--vml-text)',
              }}
            >
              ← Back
            </button>

            <button
              type="button"
              onClick={() => submitWiring(wires)}
              className="h-8 rounded-full px-3 text-xs font-bold shadow-lg transition"
              style={{
                backgroundColor: 'var(--vml-accent)',
                color: 'var(--vml-accent-text)',
              }}
            >
              Submit
            </button>

            {validationResult && (
              <button
                type="button"
                onClick={openLastResult}
                className="hidden h-8 rounded-full px-2.5 text-xs font-semibold shadow-lg backdrop-blur transition sm:inline-flex sm:items-center"
                style={{
                  backgroundColor: 'var(--vml-panel)',
                  border: '1px solid var(--vml-border)',
                  color: 'var(--vml-text)',
                }}
              >
                Last result
              </button>
            )}

            <button
              type="button"
              onClick={() => setConfirmAction('reset')}
              className="hidden h-8 rounded-full px-2.5 text-xs font-semibold shadow-lg backdrop-blur transition sm:inline-flex sm:items-center"
              style={{
                backgroundColor: 'var(--vml-panel)',
                border: '1px solid var(--vml-border)',
                color: 'var(--vml-text)',
              }}
            >
              Reset
            </button>
          </div>

          {/* Center group: camera presets */}
          <div
            className="pointer-events-auto order-3 flex w-full items-center justify-center gap-0.5 rounded-full p-1 shadow-lg backdrop-blur sm:order-none sm:w-auto"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-border)',
              color: 'var(--vml-text)',
            }}
          >
            {PRESET_BUTTONS.map((p) => {
              const active = cameraPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCameraPreset(p.id)}
                  className="h-6 rounded-full px-2 text-xs font-medium transition md:px-2.5"
                  style={{
                    backgroundColor: active
                      ? 'var(--vml-accent)'
                      : 'transparent',
                    color: active
                      ? 'var(--vml-accent-text)'
                      : 'var(--vml-text)',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Right group: theme, labels, panel toggle, and phone More menu */}
          <div className="pointer-events-auto relative flex items-center gap-1.5">
            <ThemeToggleButton />

            <button
              type="button"
              onClick={toggleTerminalLabels}
              aria-pressed={showTerminalLabels}
              className="hidden h-8 rounded-full px-2.5 text-xs font-medium shadow-lg backdrop-blur transition sm:inline-flex sm:items-center"
              style={{
                backgroundColor: showTerminalLabels
                  ? 'var(--vml-accent)'
                  : 'var(--vml-panel)',
                border: '1px solid var(--vml-border)',
                color: showTerminalLabels
                  ? 'var(--vml-accent-text)'
                  : 'var(--vml-text)',
              }}
            >
              Labels (L)
            </button>

            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? 'Hide sidebar (S)' : 'Show sidebar (S)'}
              aria-expanded={sidebarOpen}
              className="h-8 rounded-full px-2.5 text-xs font-medium shadow-lg backdrop-blur transition"
              style={{
                backgroundColor: sidebarOpen
                  ? 'var(--vml-accent)'
                  : 'var(--vml-panel)',
                border: '1px solid var(--vml-border)',
                color: sidebarOpen
                  ? 'var(--vml-accent-text)'
                  : 'var(--vml-text)',
              }}
            >
              Panel (S)
            </button>

            {/* Compact More menu on narrow screens (< 640px) */}
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              aria-label="More bench actions"
              className="inline-flex h-8 items-center rounded-full px-2.5 text-xs font-semibold shadow-lg backdrop-blur sm:hidden"
              style={{
                backgroundColor: 'var(--vml-panel)',
                border: '1px solid var(--vml-border)',
                color: 'var(--vml-text)',
              }}
            >
              More
            </button>

            {moreOpen && (
              <div
                className="absolute top-9 right-0 z-30 flex w-40 flex-col gap-1 rounded-xl p-1.5 shadow-xl sm:hidden"
                style={{
                  backgroundColor: 'var(--vml-tooltip-bg)',
                  border: '1px solid var(--vml-tooltip-border)',
                  color: 'var(--vml-tooltip-text)',
                }}
              >
                {validationResult && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      openLastResult();
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium hover:opacity-80"
                  >
                    Last result
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    toggleTerminalLabels();
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium hover:opacity-80"
                >
                  Labels (L): {showTerminalLabels ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setConfirmAction('reset');
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-red-400 hover:opacity-80"
                >
                  Reset bench
                </button>
              </div>
            )}

            <div
              className="hidden h-8 items-center rounded-full px-2.5 text-xs shadow-lg backdrop-blur 2xl:inline-flex"
              style={{
                backgroundColor: 'var(--vml-panel)',
                border: '1px solid var(--vml-border)',
                color: 'var(--vml-text-muted)',
              }}
            >
              {selectedTerminal ? (
                <span>
                  Selected:{' '}
                  <strong style={{ color: 'var(--vml-accent)' }}>
                    {selectedTerminal}
                  </strong>
                </span>
              ) : (
                <span>Wires: {wires.length}</span>
              )}
            </div>
          </div>
        </div>

        <ToastBanner />
        <SolutionBanner experiment={experiment} />
      </div>

      <RightSidebar controls={experiment.controls} output={evaluation.output} />

      <ResultModal
        experiment={experiment}
        onRequestReset={() => setConfirmAction('reset')}
      />

      <Modal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        titleId="confirm-action-title"
        maxWidthClass="max-w-sm"
      >
        <div className="space-y-4">
          <h2 id="confirm-action-title" className="text-base font-bold">
            {confirmAction === 'back'
              ? 'Leave bench and discard wiring?'
              : 'Reset the bench?'}
          </h2>
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            {confirmAction === 'back'
              ? 'You have wires placed on the bench. Returning to the experiment picker will clear your current wiring and controls.'
              : 'This clears all wires, selected terminals, supply switch, variac knob, wattmeter ranges, lamp switches, MCB trip, meter damage, and notifications.'}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="rounded-lg px-3.5 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                border: '1px solid var(--vml-border)',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                performResetBench();
                if (action === 'back') {
                  goToScreen('picker');
                }
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500"
            >
              {confirmAction === 'back' ? 'Leave bench' : 'Reset bench'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default App;
