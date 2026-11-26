import { create } from 'zustand';
import { validateWiring } from '../core/circuit/validate';
import { getExperiment } from '../core/experiments/registry';
import type {
  CameraPreset,
  RuntimeEvent,
  ValidationResult,
  Wire,
} from '../core/types';

const PROGRESS_STORAGE_KEY = 'vml_progress_v1';
const SIDEBAR_STORAGE_KEY = 'vml-sidebar';
const NUMERIC_READOUTS_STORAGE_KEY = 'vml-numeric-readouts';

function loadBoolPref(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === 'true' || raw === 'open') return true;
    if (raw === 'false' || raw === 'closed') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

interface StoredProgress {
  attempts: Record<string, number>;
  completedExperiments: string[];
  usedSolutionByExperiment: Record<string, boolean>;
}

function loadProgress(): StoredProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) {
      return {
        attempts: {},
        completedExperiments: [],
        usedSolutionByExperiment: {},
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    return {
      attempts:
        parsed.attempts && typeof parsed.attempts === 'object'
          ? parsed.attempts
          : {},
      completedExperiments: Array.isArray(parsed.completedExperiments)
        ? parsed.completedExperiments
        : [],
      usedSolutionByExperiment:
        parsed.usedSolutionByExperiment &&
        typeof parsed.usedSolutionByExperiment === 'object'
          ? parsed.usedSolutionByExperiment
          : {},
    };
  } catch {
    return {
      attempts: {},
      completedExperiments: [],
      usedSolutionByExperiment: {},
    };
  }
}

function saveProgress(progress: StoredProgress): void {
  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export type AppScreen = 'picker' | 'mode' | 'lab';
export type LabMode = 'self';

interface SessionState {
  screen: AppScreen;
  experimentId: string;
  mode: LabMode;
  attempts: Record<string, number>;
  completedExperiments: string[];
  usedSolutionByExperiment: Record<string, boolean>;
  hintLevel: number;
  usedSolutionInRun: boolean;
  validationResult: ValidationResult | null;
  resultModalOpen: boolean;
  showingSolution: boolean;
  cameraPreset: CameraPreset | null;
  showTerminalLabels: boolean;
  sidebarOpen: boolean;
  showNumericReadouts: boolean;
  toasts: RuntimeEvent[];

  goToScreen: (screen: AppScreen) => void;
  selectExperiment: (id: string) => void;
  setMode: (mode: LabMode) => void;
  setCameraPreset: (preset: CameraPreset | null) => void;
  toggleTerminalLabels: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleNumericReadouts: () => void;
  submitWiring: (wires: Wire[]) => ValidationResult;
  retry: () => void;
  openLastResult: () => void;
  closeResultModal: () => void;
  nextHint: () => void;
  activateSolutionView: () => void;
  exitSolutionView: () => void;
  pushToast: (event: RuntimeEvent) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  resetLabSession: () => void;
}

const initialProgress = loadProgress();

export const useSessionStore = create<SessionState>((set, get) => ({
  screen: 'picker',
  experimentId: 'ex3.1',
  mode: 'self',
  attempts: initialProgress.attempts,
  completedExperiments: initialProgress.completedExperiments,
  usedSolutionByExperiment: initialProgress.usedSolutionByExperiment,
  hintLevel: 0,
  usedSolutionInRun: false,
  validationResult: null,
  resultModalOpen: false,
  showingSolution: false,
  cameraPreset: 'overview',
  showTerminalLabels: false,
  sidebarOpen:
    typeof window !== 'undefined' ? loadBoolPref(SIDEBAR_STORAGE_KEY, true) : true,
  showNumericReadouts:
    typeof window !== 'undefined'
      ? loadBoolPref(NUMERIC_READOUTS_STORAGE_KEY, true)
      : true,
  toasts: [],

  goToScreen: (screen) => set({ screen }),

  selectExperiment: (experimentId) =>
    set({
      experimentId,
      hintLevel: 0,
      usedSolutionInRun: false,
      validationResult: null,
      resultModalOpen: false,
      showingSolution: false,
      cameraPreset: 'overview',
      toasts: [],
    }),

  setMode: (mode) => set({ mode }),

  setCameraPreset: (cameraPreset) => set({ cameraPreset }),

  toggleTerminalLabels: () =>
    set((state) => ({ showTerminalLabels: !state.showTerminalLabels })),

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarOpen;
      savePref(SIDEBAR_STORAGE_KEY, next ? 'open' : 'closed');
      return { sidebarOpen: next };
    }),

  setSidebarOpen: (open) => {
    savePref(SIDEBAR_STORAGE_KEY, open ? 'open' : 'closed');
    set({ sidebarOpen: open });
  },

  toggleNumericReadouts: () =>
    set((state) => {
      const next = !state.showNumericReadouts;
      savePref(NUMERIC_READOUTS_STORAGE_KEY, String(next));
      return { showNumericReadouts: next };
    }),

  submitWiring: (wires) => {
    const {
      experimentId,
      attempts,
      completedExperiments,
      usedSolutionByExperiment,
      usedSolutionInRun,
    } = get();
    const experiment = getExperiment(experimentId);
    const result = validateWiring(experiment, wires);

    const nextAttempts = {
      ...attempts,
      [experimentId]: (attempts[experimentId] ?? 0) + 1,
    };
    const nextCompleted =
      result.correct && !completedExperiments.includes(experimentId)
        ? [...completedExperiments, experimentId]
        : completedExperiments;
    const nextUsedSolution = {
      ...usedSolutionByExperiment,
      ...(result.correct
        ? {
            [experimentId]:
              Boolean(usedSolutionByExperiment[experimentId]) || usedSolutionInRun,
          }
        : {}),
    };

    saveProgress({
      attempts: nextAttempts,
      completedExperiments: nextCompleted,
      usedSolutionByExperiment: nextUsedSolution,
    });

    set({
      attempts: nextAttempts,
      completedExperiments: nextCompleted,
      usedSolutionByExperiment: nextUsedSolution,
      validationResult: result,
      resultModalOpen: true,
      showingSolution: false,
    });
    return result;
  },

  retry: () =>
    set({
      resultModalOpen: false,
      showingSolution: false,
    }),

  openLastResult: () =>
    set((state) =>
      state.validationResult ? { resultModalOpen: true } : state,
    ),

  closeResultModal: () => set({ resultModalOpen: false }),

  nextHint: () =>
    set((state) => {
      const exp = getExperiment(state.experimentId);
      const maxLevel = exp.hints.length;
      return {
        hintLevel: Math.min(maxLevel, state.hintLevel + 1),
      };
    }),

  activateSolutionView: () =>
    set({
      showingSolution: true,
      usedSolutionInRun: true,
      resultModalOpen: false,
    }),

  exitSolutionView: () => set({ showingSolution: false }),

  pushToast: (event) =>
    set((state) => {
      const filtered = state.toasts.filter((t) => t.id !== event.id);
      return { toasts: [...filtered, event].slice(-4) };
    }),

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearToasts: () => set({ toasts: [] }),

  resetLabSession: () =>
    set({
      hintLevel: 0,
      usedSolutionInRun: false,
      validationResult: null,
      resultModalOpen: false,
      showingSolution: false,
      cameraPreset: 'overview',
      toasts: [],
    }),
}));
