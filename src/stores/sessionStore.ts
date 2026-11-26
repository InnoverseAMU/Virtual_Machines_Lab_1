import { create } from 'zustand';
import { validateWiring } from '../core/circuit/validate';
import { getExperiment } from '../core/experiments/registry';
import { extractTransformerParams } from '../core/physics/models/transformerLoad';
import {
  captureObservationRow,
  checkRunAnswers,
  computeRunTruth,
  MAX_OBSERVATION_ROWS,
} from '../core/physics/report';
import type { AssetFile } from '../core/experiments/assets';
import type {
  CameraPreset,
  ObservationRow,
  RunCheckResult,
  RuntimeEvent,
  TransformerLoadControls,
  TransformerLoadOutput,
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

export interface StoredProgress {
  attempts: Record<string, number>;
  completedExperiments: string[];
  usedSolutionByExperiment: Record<string, boolean>;
  learnCompleted: Record<string, boolean>;
  runCompleted: Record<string, boolean>;
  runPractised: Record<string, boolean>;
}

export function parseStoredProgress(raw: string | null): StoredProgress {
  if (!raw) {
    return {
      attempts: {},
      completedExperiments: [],
      usedSolutionByExperiment: {},
      learnCompleted: {},
      runCompleted: {},
      runPractised: {},
    };
  }
  try {
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
      learnCompleted:
        parsed.learnCompleted && typeof parsed.learnCompleted === 'object'
          ? parsed.learnCompleted
          : {},
      runCompleted:
        parsed.runCompleted && typeof parsed.runCompleted === 'object'
          ? parsed.runCompleted
          : {},
      runPractised:
        parsed.runPractised && typeof parsed.runPractised === 'object'
          ? parsed.runPractised
          : {},
    };
  } catch {
    return {
      attempts: {},
      completedExperiments: [],
      usedSolutionByExperiment: {},
      learnCompleted: {},
      runCompleted: {},
      runPractised: {},
    };
  }
}

function loadProgress(): StoredProgress {
  if (typeof window === 'undefined') return parseStoredProgress(null);
  try {
    return parseStoredProgress(window.localStorage.getItem(PROGRESS_STORAGE_KEY));
  } catch {
    return parseStoredProgress(null);
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
export type LabMode = 'self' | 'learn' | 'observe';

let rowCounter = 0;

interface SessionState {
  screen: AppScreen;
  experimentId: string;
  mode: LabMode;
  attempts: Record<string, number>;
  completedExperiments: string[];
  usedSolutionByExperiment: Record<string, boolean>;
  learnCompleted: Record<string, boolean>;
  runCompleted: Record<string, boolean>;
  runPractised: Record<string, boolean>;

  // Self mode per-run state (never persisted)
  hintLevel: number;
  usedSolutionInRun: boolean;
  validationResult: ValidationResult | null;
  resultModalOpen: boolean;
  showingSolution: boolean;

  // Observations & run report state (never persisted)
  observationRows: ObservationRow[];
  runRegulationInput: string;
  runMaxEffLoadInput: string;
  runCheckResult: RunCheckResult | null;

  // Observe mode net highlight (transient, never persisted)
  highlightedNetIndex: number | null;
  highlightedNetPinned: boolean;

  // Learn mode per-run state (never persisted mid-lesson)
  learnStepIndex: number;
  learnNoLoadAck: boolean;
  learnFinished: boolean;

  // View & UI prefs
  cameraPreset: CameraPreset | null;
  showTerminalLabels: boolean;
  sidebarOpen: boolean;
  showNumericReadouts: boolean;
  toasts: RuntimeEvent[];

  // Ephemeral reference viewers (never persisted, never count as hints/attempts)
  diagramPanelOpen: boolean;
  pdfPreviewAsset: AssetFile | null;

  goToScreen: (screen: AppScreen) => void;
  selectExperiment: (id: string) => void;
  setMode: (mode: LabMode) => void;
  setCameraPreset: (preset: CameraPreset | null) => void;
  toggleTerminalLabels: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleNumericReadouts: () => void;
  openDiagramPanel: () => void;
  closeDiagramPanel: () => void;
  toggleDiagramPanel: () => void;
  openPdfPreview: (asset: AssetFile) => void;
  closePdfPreview: () => void;

  submitWiring: (wires: Wire[]) => ValidationResult;
  retry: () => void;
  openLastResult: () => void;
  closeResultModal: () => void;
  nextHint: () => void;
  activateSolutionView: () => void;
  exitSolutionView: () => void;

  addObservationRow: (
    output: TransformerLoadOutput,
    controls: TransformerLoadControls,
    primaryEnergised: boolean,
  ) => void;
  deleteObservationRow: (id: string) => void;
  clearObservationRows: () => void;
  setRunRegulationInput: (val: string) => void;
  setRunMaxEffLoadInput: (val: string) => void;
  submitRunAnswers: () => RunCheckResult;
  clearRunCheckResult: () => void;

  setHighlightedNetIndex: (index: number | null, pinned?: boolean) => void;
  clearHighlightedNet: () => void;

  setLearnStepIndex: (index: number) => void;
  ackLearnReading: () => void;
  resetLearnAck: () => void;
  finishLearn: () => void;
  resetLearnRun: () => void;

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
  learnCompleted: initialProgress.learnCompleted,
  runCompleted: initialProgress.runCompleted,
  runPractised: initialProgress.runPractised,

  hintLevel: 0,
  usedSolutionInRun: false,
  validationResult: null,
  resultModalOpen: false,
  showingSolution: false,

  observationRows: [],
  runRegulationInput: '',
  runMaxEffLoadInput: '',
  runCheckResult: null,

  highlightedNetIndex: null,
  highlightedNetPinned: false,

  learnStepIndex: 0,
  learnNoLoadAck: false,
  learnFinished: false,

  cameraPreset: 'overview',
  showTerminalLabels: false,
  sidebarOpen:
    typeof window !== 'undefined' ? loadBoolPref(SIDEBAR_STORAGE_KEY, true) : true,
  showNumericReadouts:
    typeof window !== 'undefined'
      ? loadBoolPref(NUMERIC_READOUTS_STORAGE_KEY, true)
      : true,
  toasts: [],

  diagramPanelOpen: false,
  pdfPreviewAsset: null,

  goToScreen: (screen) =>
    set({
      screen,
      diagramPanelOpen: false,
      pdfPreviewAsset: null,
    }),

  selectExperiment: (experimentId) =>
    set({
      experimentId,
      hintLevel: 0,
      usedSolutionInRun: false,
      validationResult: null,
      resultModalOpen: false,
      showingSolution: false,
      observationRows: [],
      runRegulationInput: '',
      runMaxEffLoadInput: '',
      runCheckResult: null,
      highlightedNetIndex: null,
      highlightedNetPinned: false,
      learnStepIndex: 0,
      learnNoLoadAck: false,
      learnFinished: false,
      cameraPreset: 'overview',
      toasts: [],
      diagramPanelOpen: false,
      pdfPreviewAsset: null,
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
      learnCompleted,
      runCompleted,
      runPractised,
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
      learnCompleted,
      runCompleted,
      runPractised,
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

  addObservationRow: (output, controls, primaryEnergised) => {
    const { observationRows, pushToast } = get();
    if (!controls.supplyOn || !primaryEnergised) return;
    if (observationRows.length >= MAX_OBSERVATION_ROWS) return;

    rowCounter += 1;
    const row = captureObservationRow(
      output,
      controls,
      observationRows.length + 1,
      `obs_${rowCounter}`,
    );

    if (row.v1OutOfRange) {
      pushToast({
        id: 'obs-v1-range',
        severity: 'warning',
        message: `Row ${row.sno} recorded with V1 = ${row.v1.toFixed(1)} V (outside 230 ± 2 V).`,
      });
    }

    set({
      observationRows: [...observationRows, row],
      runCheckResult: null,
    });
  },

  deleteObservationRow: (id) =>
    set((state) => {
      const next = state.observationRows
        .filter((r) => r.id !== id)
        .map((r, idx) => ({ ...r, sno: idx + 1 }));
      return {
        observationRows: next,
        runCheckResult: null,
      };
    }),

  clearObservationRows: () =>
    set({
      observationRows: [],
      runCheckResult: null,
    }),

  setRunRegulationInput: (runRegulationInput) => set({ runRegulationInput }),

  setRunMaxEffLoadInput: (runMaxEffLoadInput) => set({ runMaxEffLoadInput }),

  submitRunAnswers: () => {
    const {
      experimentId,
      mode,
      observationRows,
      runRegulationInput,
      runMaxEffLoadInput,
      attempts,
      completedExperiments,
      usedSolutionByExperiment,
      learnCompleted,
      runCompleted,
      runPractised,
    } = get();

    const experiment = getExperiment(experimentId);
    const truth = computeRunTruth(
      extractTransformerParams(experiment.physicsParams),
    );
    const regulationPct = Number.parseFloat(runRegulationInput);
    const maxEffLoadPct = Number.parseFloat(runMaxEffLoadInput);

    const result = checkRunAnswers(
      observationRows,
      { regulationPct, maxEffLoadPct },
      truth,
    );

    let nextRunCompleted = runCompleted;
    let nextRunPractised = runPractised;

    if (result.passed) {
      if (mode === 'observe') {
        nextRunPractised = {
          ...runPractised,
          [experimentId]: true,
        };
      } else {
        nextRunCompleted = {
          ...runCompleted,
          [experimentId]: true,
        };
      }
      saveProgress({
        attempts,
        completedExperiments,
        usedSolutionByExperiment,
        learnCompleted,
        runCompleted: nextRunCompleted,
        runPractised: nextRunPractised,
      });
    }

    set({
      runCompleted: nextRunCompleted,
      runPractised: nextRunPractised,
      runCheckResult: result,
    });
    return result;
  },

  clearRunCheckResult: () => set({ runCheckResult: null }),

  setHighlightedNetIndex: (index, pinned = false) =>
    set({
      highlightedNetIndex: index,
      highlightedNetPinned: index !== null && pinned,
    }),

  clearHighlightedNet: () =>
    set({
      highlightedNetIndex: null,
      highlightedNetPinned: false,
    }),

  setLearnStepIndex: (learnStepIndex) => set({ learnStepIndex }),

  ackLearnReading: () => set({ learnNoLoadAck: true }),

  resetLearnAck: () => set({ learnNoLoadAck: false }),

  finishLearn: () => {
    const {
      experimentId,
      attempts,
      completedExperiments,
      usedSolutionByExperiment,
      learnCompleted,
      runCompleted,
      runPractised,
    } = get();
    const nextLearnCompleted = {
      ...learnCompleted,
      [experimentId]: true,
    };
    saveProgress({
      attempts,
      completedExperiments,
      usedSolutionByExperiment,
      learnCompleted: nextLearnCompleted,
      runCompleted,
      runPractised,
    });
    set({
      learnCompleted: nextLearnCompleted,
      learnFinished: true,
    });
  },

  resetLearnRun: () =>
    set({
      learnStepIndex: 0,
      learnNoLoadAck: false,
      learnFinished: false,
      cameraPreset: 'overview',
      toasts: [],
    }),

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
      observationRows: [],
      runRegulationInput: '',
      runMaxEffLoadInput: '',
      runCheckResult: null,
      highlightedNetIndex: null,
      highlightedNetPinned: false,
      learnStepIndex: 0,
      learnNoLoadAck: false,
      learnFinished: false,
      cameraPreset: 'overview',
      toasts: [],
      diagramPanelOpen: false,
      pdfPreviewAsset: null,
    }),

  openDiagramPanel: () => set({ diagramPanelOpen: true }),
  closeDiagramPanel: () => set({ diagramPanelOpen: false }),
  toggleDiagramPanel: () =>
    set((s) => ({ diagramPanelOpen: !s.diagramPanelOpen })),
  openPdfPreview: (asset) => set({ pdfPreviewAsset: asset }),
  closePdfPreview: () => set({ pdfPreviewAsset: null }),
}));
