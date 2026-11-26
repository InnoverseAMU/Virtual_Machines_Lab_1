import { create } from 'zustand';
import { getExperiment } from '../core/experiments/registry';
import { validateWiring } from '../core/circuit/validate';
import type {
  CameraPreset,
  RuntimeEvent,
  ValidationResult,
  Wire,
} from '../core/types';

const PROGRESS_STORAGE_KEY = 'vml_progress_v1';

interface StoredProgress {
  attempts: Record<string, number>;
  completedExperiments: string[];
}

function loadProgress(): StoredProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return { attempts: {}, completedExperiments: [] };
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    return {
      attempts:
        parsed.attempts && typeof parsed.attempts === 'object'
          ? parsed.attempts
          : {},
      completedExperiments: Array.isArray(parsed.completedExperiments)
        ? parsed.completedExperiments
        : [],
    };
  } catch {
    return { attempts: {}, completedExperiments: [] };
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
  hintLevel: number;
  validationResult: ValidationResult | null;
  showingSolution: boolean;
  cameraPreset: CameraPreset;
  toasts: RuntimeEvent[];

  goToScreen: (screen: AppScreen) => void;
  selectExperiment: (id: string) => void;
  setMode: (mode: LabMode) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  submitWiring: (wires: Wire[]) => ValidationResult;
  retry: () => void;
  nextHint: () => void;
  setShowingSolution: (showing: boolean) => void;
  pushToast: (event: RuntimeEvent) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  resetLabSession: () => void;
}

const initialProgress = loadProgress();

export const useSessionStore = create<SessionState>((set, get) => ({
  // Start directly on the lab bench during 2a; 2c starts at 'picker'
  screen: 'lab',
  experimentId: 'ex3.1',
  mode: 'self',
  attempts: initialProgress.attempts,
  completedExperiments: initialProgress.completedExperiments,
  hintLevel: 0,
  validationResult: null,
  showingSolution: false,
  cameraPreset: 'overview',
  toasts: [],

  goToScreen: (screen) => set({ screen }),

  selectExperiment: (experimentId) =>
    set({
      experimentId,
      hintLevel: 0,
      validationResult: null,
      showingSolution: false,
      cameraPreset: 'overview',
    }),

  setMode: (mode) => set({ mode }),

  setCameraPreset: (cameraPreset) => set({ cameraPreset }),

  submitWiring: (wires) => {
    const { experimentId, attempts, completedExperiments } = get();
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

    saveProgress({
      attempts: nextAttempts,
      completedExperiments: nextCompleted,
    });

    set({
      attempts: nextAttempts,
      completedExperiments: nextCompleted,
      validationResult: result,
      showingSolution: false,
    });
    return result;
  },

  retry: () =>
    set({
      validationResult: null,
      showingSolution: false,
    }),

  nextHint: () =>
    set((state) => {
      const exp = getExperiment(state.experimentId);
      const maxLevel = exp.hints.length;
      return {
        hintLevel: Math.min(maxLevel, state.hintLevel + 1),
      };
    }),

  setShowingSolution: (showingSolution) => set({ showingSolution }),

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
      validationResult: null,
      showingSolution: false,
      cameraPreset: 'overview',
      toasts: [],
    }),
}));
