import { create } from 'zustand';
import type { ResolvedTheme, ThemeMode } from '../theme/tokens';

export const THEME_STORAGE_KEY = 'vml-theme';

function isValidThemeMode(val: string | null): val is ThemeMode {
  return val === 'system' || val === 'light' || val === 'dark';
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function resolveMode(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

function readStoredMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isValidThemeMode(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

function applyDataTheme(resolved: ResolvedTheme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
  }
}

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
}

const initialMode = typeof window !== 'undefined' ? readStoredMode() : 'system';
const initialResolved = resolveMode(initialMode);
applyDataTheme(initialResolved);

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode,
  resolved: initialResolved,

  setMode: (mode) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
    const resolved = resolveMode(mode);
    applyDataTheme(resolved);
    set({ mode, resolved });
  },

  cycleMode: () => {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const current = get().mode;
    const next = order[(order.indexOf(current) + 1) % order.length];
    get().setMode(next);
  },
}));

if (typeof window !== 'undefined' && window.matchMedia) {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', () => {
    const state = useThemeStore.getState();
    if (state.mode === 'system') {
      const resolved = getSystemTheme();
      applyDataTheme(resolved);
      useThemeStore.setState({ resolved });
    }
  });
}
