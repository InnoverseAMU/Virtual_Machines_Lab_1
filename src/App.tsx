import { useEffect } from 'react';
import type { CameraPreset } from './core/types';
import { BenchScene } from './scenes/BenchScene';
import { useSessionStore } from './stores/sessionStore';
import { useThemeStore } from './stores/themeStore';
import { useWiringStore } from './stores/wiringStore';
import type { ThemeMode } from './theme/tokens';

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

function ThemeIcon({ mode, resolved }: { mode: ThemeMode; resolved: 'light' | 'dark' }) {
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
  const cameraPreset = useSessionStore((s) => s.cameraPreset);
  const setCameraPreset = useSessionStore((s) => s.setCameraPreset);
  const showTerminalLabels = useSessionStore((s) => s.showTerminalLabels);
  const toggleTerminalLabels = useSessionStore((s) => s.toggleTerminalLabels);

  const selectedTerminal = useWiringStore((s) => s.selectedTerminal);
  const clearSelectedTerminal = useWiringStore((s) => s.clearSelectedTerminal);
  const wireCount = useWiringStore((s) => s.wires.length);

  const themeMode = useThemeStore((s) => s.mode);
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const cycleThemeMode = useThemeStore((s) => s.cycleMode);

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
      } else if (
        (e.key === 'l' || e.key === 'L') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        toggleTerminalLabels();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelectedTerminal, toggleTerminalLabels]);

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none">
      <BenchScene />

      {/* Top bar: camera presets, theme toggle, terminal labels toggle, status */}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-wrap items-center justify-center gap-2 px-3">
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
                  backgroundColor: active ? 'var(--vml-accent)' : 'transparent',
                  color: active ? 'var(--vml-accent-text)' : 'var(--vml-text)',
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

        <div
          className="rounded-full px-3 py-1.5 text-xs shadow-lg backdrop-blur"
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
            <span>
              Wires: {wireCount} · Click terminals to wire, click wire to delete
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
