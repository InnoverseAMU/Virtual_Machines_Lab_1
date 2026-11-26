import { useEffect, useMemo, useRef } from 'react';
import { getExperiment } from './core/experiments/registry';
import { evaluateExperimentPhysics } from './core/physics/evaluate';
import type { CameraPreset } from './core/types';
import { BenchScene } from './scenes/BenchScene';
import { useControlsStore } from './stores/controlsStore';
import { useSessionStore } from './stores/sessionStore';
import { useThemeStore } from './stores/themeStore';
import { useWiringStore } from './stores/wiringStore';
import type { ThemeMode } from './theme/tokens';
import { RightSidebar } from './ui/RightSidebar';
import { ToastBanner } from './ui/ToastBanner';

const PRESET_BUTTONS: { id: CameraPreset; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'supply', label: 'Supply' },
  { id: 'meters', label: 'Meters' },
  { id: 'transformer', label: 'Transformer' },
  { id: 'load', label: 'Load' },
];

const MODE_LABELS: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const STICKY_EVENT_IDS = new Set([
  'mcb-trip',
  'power-on-non-zero',
  'wiring-blocked',
]);

function ThemeIcon({
  mode,
  resolved,
}: {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
}) {
  if (mode === 'light' || (mode === 'system' && resolved === 'light')) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-3.5 w-3.5"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-3.5 w-3.5"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  );
}

export function App() {
  const experimentId = useSessionStore((s) => s.experimentId);
  const cameraPreset = useSessionStore((s) => s.cameraPreset);
  const setCameraPreset = useSessionStore((s) => s.setCameraPreset);
  const showTerminalLabels = useSessionStore((s) => s.showTerminalLabels);
  const toggleTerminalLabels = useSessionStore((s) => s.toggleTerminalLabels);
  const sidebarOpen = useSessionStore((s) => s.sidebarOpen);
  const toggleSidebar = useSessionStore((s) => s.toggleSidebar);
  const pushToast = useSessionStore((s) => s.pushToast);
  const dismissToast = useSessionStore((s) => s.dismissToast);

  const wires = useWiringStore((s) => s.wires);
  const selectedTerminal = useWiringStore((s) => s.selectedTerminal);
  const clearSelectedTerminal = useWiringStore((s) => s.clearSelectedTerminal);

  const supplyOn = useControlsStore((s) => s.supplyOn);
  const variacV = useControlsStore((s) => s.variacV);
  const wmVRange = useControlsStore((s) => s.wmVRange);
  const wmIRange = useControlsStore((s) => s.wmIRange);
  const lamps = useControlsStore((s) => s.lamps);
  const gains = useControlsStore((s) => s.gains);
  const tripMcb = useControlsStore((s) => s.tripMcb);
  const setFocusedControl = useControlsStore((s) => s.setFocusedControl);
  const initFromControls = useControlsStore((s) => s.initFromControls);

  const themeMode = useThemeStore((s) => s.mode);
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const cycleThemeMode = useThemeStore((s) => s.cycleMode);

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
  }, [evaluation.output, tripMcb, pushToast, dismissToast]);

  useEffect(() => {
    if (supplyOn && !evaluation.output.mcbTripped) {
      dismissToast('mcb-trip');
    }
  }, [supplyOn, evaluation.output.mcbTripped, dismissToast]);

  useEffect(() => {
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
    clearSelectedTerminal,
    setFocusedControl,
    toggleTerminalLabels,
    toggleSidebar,
  ]);

  return (
    <div className="fixed inset-0 flex overflow-hidden select-none">
      {/* Main 3D canvas area resizes smoothly when sidebar opens/closes */}
      <div className="relative h-full min-w-0 flex-1 overflow-hidden">
        <BenchScene
          labOutput={evaluation.output}
          connectionState={evaluation.connectionState}
        />

        {/* Top bar: camera presets, theme toggle, terminal labels, sidebar toggle */}
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-wrap items-center justify-center gap-2 px-3">
          <div
            className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full p-1 shadow-lg backdrop-blur"
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
                  className="rounded-full px-3 py-1 text-xs font-medium transition"
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

          <button
            type="button"
            onClick={cycleThemeMode}
            aria-label={`Color theme: ${MODE_LABELS[themeMode]} (${resolvedTheme}). Click to cycle system, light, dark.`}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-border)',
              color: 'var(--vml-text)',
            }}
          >
            <ThemeIcon mode={themeMode} resolved={resolvedTheme} />
            <span>{MODE_LABELS[themeMode]}</span>
          </button>

          <button
            type="button"
            onClick={toggleTerminalLabels}
            aria-pressed={showTerminalLabels}
            className="pointer-events-auto rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition"
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
            Labels (L): {showTerminalLabels ? 'On' : 'Off'}
          </button>

          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Hide sidebar (S)' : 'Show sidebar (S)'}
            aria-expanded={sidebarOpen}
            className="pointer-events-auto rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition"
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

          <div
            className="hidden rounded-full px-3 py-1.5 text-xs shadow-lg backdrop-blur lg:block"
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
                </strong>{' '}
                (click target terminal or Esc)
              </span>
            ) : (
              <span>Wires: {wires.length}</span>
            )}
          </div>
        </div>

        <ToastBanner />
      </div>

      <RightSidebar controls={experiment.controls} output={evaluation.output} />
    </div>
  );
}

export default App;
