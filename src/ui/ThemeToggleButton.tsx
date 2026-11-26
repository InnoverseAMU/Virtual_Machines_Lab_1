import { useThemeStore } from '../stores/themeStore';
import type { ThemeMode } from '../theme/tokens';

const MODE_LABELS: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

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

export function ThemeToggleButton() {
  const mode = useThemeStore((s) => s.mode);
  const resolved = useThemeStore((s) => s.resolved);
  const cycleMode = useThemeStore((s) => s.cycleMode);

  return (
    <button
      type="button"
      onClick={cycleMode}
      aria-label={`Color theme: ${MODE_LABELS[mode]} (${resolved}). Click to cycle system, light, dark.`}
      className="pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition"
      style={{
        backgroundColor: 'var(--vml-panel)',
        border: '1px solid var(--vml-border)',
        color: 'var(--vml-text)',
      }}
    >
      <ThemeIcon mode={mode} resolved={resolved} />
      <span>{MODE_LABELS[mode]}</span>
    </button>
  );
}
