import { create } from 'zustand';
import {
  collectInternalLinks,
  wiresFromNetlist,
} from '../core/circuit/nets';
import {
  applyStageCarryOver,
  getAllLearnSteps,
  getStage,
  getStageComponents,
} from '../core/circuit/stages';
import { validateWiring } from '../core/circuit/validate';
import type { AssetFile } from '../core/experiments/assets';
import { EXPERIMENTS, getExperiment } from '../core/experiments/registry';
import {
  canonicalPairKey,
  getScrambledTerminalMap,
} from '../core/phasor/ex3_5Scramble';
import { isSupplySwitchOn, toControlValues } from '../core/physics/evaluate';
import {
  captureObservationRow,
  checkRunAnswers,
  evaluateRowRules,
  MAX_OBSERVATION_ROWS,
} from '../core/physics/report';
import type {
  CameraPreset,
  ControlValues,
  ObservationRow,
  PhysicsSolveOutput,
  RunCheckResult,
  RuntimeEvent,
  TerminalId,
  TransformerLoadControls,
  TransformerLoadOutput,
  ValidationResult,
  Wire,
  WireEndpointPair,
} from '../core/types';
import { useControlsStore } from './controlsStore';
import { useWiringStore } from './wiringStore';

const PROGRESS_STORAGE_KEY = 'vml_progress_v1';
const SIDEBAR_STORAGE_KEY = 'vml-sidebar';
const NUMERIC_READOUTS_STORAGE_KEY = 'vml-numeric-readouts';

export const OBSERVE_FIXED_SEED = 202601;

export function createSessionSeed(): number {
  return Math.floor(Date.now() % 2147483647) || 1337;
}

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
  version?: number;
  attempts: Record<string, number>;
  completedExperiments: string[];
  completedStages: Record<string, string[]>;
  usedSolutionByExperiment: Record<string, boolean>;
  learnCompleted: Record<string, boolean>;
  runCompleted: Record<string, boolean>;
  runPractised: Record<string, boolean>;
}

/**
 * Parses and migrates persisted progress (including legacy v1 data without completedStages).
 */
export function parseStoredProgress(raw: string | null): StoredProgress {
  const empty: StoredProgress = {
    version: 2,
    attempts: {},
    completedExperiments: [],
    completedStages: {},
    usedSolutionByExperiment: {},
    learnCompleted: {},
    runCompleted: {},
    runPractised: {},
  };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    const completedExperiments = Array.isArray(parsed.completedExperiments)
      ? parsed.completedExperiments
      : [];
    const rawCompletedStages =
      parsed.completedStages && typeof parsed.completedStages === 'object'
        ? parsed.completedStages
        : {};

    const migratedStages: Record<string, string[]> = { ...rawCompletedStages };
    for (const expId of completedExperiments) {
      if (!migratedStages[expId]) {
        const exp = EXPERIMENTS[expId];
        if (exp) {
          migratedStages[expId] = exp.stages.map((s) => s.id);
        }
      }
    }

    return {
      version: 2,
      attempts:
        parsed.attempts && typeof parsed.attempts === 'object'
          ? parsed.attempts
          : {},
      completedExperiments,
      completedStages: migratedStages,
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
    return empty;
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
  sessionSeed: number;
  currentStageIndex: number;

  attempts: Record<string, number>;
  completedExperiments: string[];
  completedStages: Record<string, string[]>;
  usedSolutionByExperiment: Record<string, boolean>;
  learnCompleted: Record<string, boolean>;
  runCompleted: Record<string, boolean>;
  runPractised: Record<string, boolean>;

  // Self mode per-run state (never persisted)
  wiresByStage: Record<string, WireEndpointPair[]>;
  hintLevel: number;
  usedSolutionInRun: boolean;
  validationResult: ValidationResult | null;
  resultModalOpen: boolean;
  showingSolution: boolean;

  // Observations & run report state (per-stage tables, never persisted)
  observationRowsByStage: Record<string, ObservationRow[]>;
  observationRows: ObservationRow[];
  runAnswerInputs: Record<string, string>;
  chartInputs: Record<string, string>;
  runRegulationInput: string;
  runMaxEffLoadInput: string;
  runCheckResult: RunCheckResult | null;

  // Observe mode net highlight (transient, never persisted)
  highlightedNetIndex: number | null;
  highlightedNetPinned: boolean;

  // Probe voltmeter & terminal identification state
  activeProbeLead: 'a' | 'b' | null;
  identifiedPairs: [TerminalId, TerminalId][];
  identifiedPhases: string[][];

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

  // Ephemeral reference viewers
  diagramPanelOpen: boolean;
  pdfPreviewAsset: AssetFile | null;

  goToScreen: (screen: AppScreen) => void;
  selectExperiment: (id: string) => void;
  setMode: (mode: LabMode) => void;
  setSessionSeed: (seed: number) => void;
  setCurrentStageIndex: (index: number) => void;
  switchObserveStage: (index: number) => void;
  switchSelfStage: (index: number) => void;
  switchLearnStage: (index: number) => void;
  continueToNextStage: () => void;
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
    output: PhysicsSolveOutput | TransformerLoadOutput,
    controls: ControlValues | TransformerLoadControls,
    energised: boolean,
  ) => void;
  deleteObservationRow: (id: string) => void;
  clearObservationRows: () => void;
  setRunAnswerInput: (answerId: string, val: string) => void;
  setChartInput: (inputId: string, val: string) => void;
  setRunRegulationInput: (val: string) => void;
  setRunMaxEffLoadInput: (val: string) => void;
  submitRunAnswers: () => RunCheckResult;
  clearRunCheckResult: () => void;

  setHighlightedNetIndex: (index: number | null, pinned?: boolean) => void;
  clearHighlightedNet: () => void;

  setActiveProbeLead: (lead: 'a' | 'b' | null) => void;
  placeProbeLead: (lead: 'a' | 'b', terminalId: TerminalId) => void;
  clearProbeLeads: () => void;
  addIdentifiedPair: (a: TerminalId, b: TerminalId) => void;
  removeIdentifiedPair: (index: number) => void;
  setIdentifiedPairs: (pairs: [TerminalId, TerminalId][]) => void;
  setIdentifiedPhases: (groups: string[][]) => void;

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

function getStageMeterIds(experimentId: string, stageIndex: number): string[] {
  try {
    const exp = getExperiment(experimentId);
    const stage = getStage(exp, stageIndex);
    const comps = getStageComponents(exp, stage);
    return comps
      .filter(
        (c) =>
          c.type === 'voltmeter' ||
          c.type === 'probeVoltmeter' ||
          c.type === 'ammeter' ||
          c.type === 'wattmeter',
      )
      .map((c) => c.id);
  } catch {
    return ['vp', 'vs', 'am', 'wm'];
  }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  screen: 'picker',
  experimentId: 'ex3.1',
  mode: 'self',
  sessionSeed: createSessionSeed(),
  currentStageIndex: 0,
  wiresByStage: {},

  attempts: initialProgress.attempts,
  completedExperiments: initialProgress.completedExperiments,
  completedStages: initialProgress.completedStages,
  usedSolutionByExperiment: initialProgress.usedSolutionByExperiment,
  learnCompleted: initialProgress.learnCompleted,
  runCompleted: initialProgress.runCompleted,
  runPractised: initialProgress.runPractised,

  hintLevel: 0,
  usedSolutionInRun: false,
  validationResult: null,
  resultModalOpen: false,
  showingSolution: false,

  observationRowsByStage: {},
  observationRows: [],
  runAnswerInputs: {},
  chartInputs: {},
  runRegulationInput: '',
  runMaxEffLoadInput: '',
  runCheckResult: null,

  highlightedNetIndex: null,
  highlightedNetPinned: false,

  activeProbeLead: null,
  identifiedPairs: [],
  identifiedPhases: [],

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
      currentStageIndex: 0,
  wiresByStage: {},
      hintLevel: 0,
      usedSolutionInRun: false,
      validationResult: null,
      resultModalOpen: false,
      showingSolution: false,
      observationRowsByStage: {},
      observationRows: [],
      runAnswerInputs: {},
      chartInputs: {},
      runRegulationInput: '',
      runMaxEffLoadInput: '',
      runCheckResult: null,
      highlightedNetIndex: null,
      highlightedNetPinned: false,
      activeProbeLead: null,
      identifiedPairs: [],
      identifiedPhases: [],
      learnStepIndex: 0,
      learnNoLoadAck: false,
      learnFinished: false,
      cameraPreset: 'overview',
      toasts: [],
      diagramPanelOpen: false,
      pdfPreviewAsset: null,
    }),

  setMode: (mode) => set({ mode }),

  setSessionSeed: (sessionSeed) => set({ sessionSeed }),

  setCurrentStageIndex: (index) => {
    const { experimentId, observationRowsByStage } = get();
    const exp = getExperiment(experimentId);
    const clamped = Math.max(0, Math.min(exp.stages.length - 1, index));
    const stage = getStage(exp, clamped);
    set({
      currentStageIndex: clamped,
      observationRows: observationRowsByStage[stage.id] ?? [],
      highlightedNetIndex: null,
      highlightedNetPinned: false,
      cameraPreset: 'overview',
    });
  },

  switchObserveStage: (index) => {
    const { experimentId, observationRowsByStage, sessionSeed } = get();
    const exp = getExperiment(experimentId);
    const clamped = Math.max(0, Math.min(exp.stages.length - 1, index));
    const stage = getStage(exp, clamped);
    const stageComps = getStageComponents(exp, stage);
    const controlsStore = useControlsStore.getState();
    controlsStore.initFromControls(
      stage.controls,
      sessionSeed,
      getStageMeterIds(experimentId, clamped),
    );
    const pairs = wiresFromNetlist(
      stage.acceptedNetlists[0],
      collectInternalLinks(stageComps, useControlsStore.getState().values),
      stageComps,
    );
    useWiringStore.getState().setObserveWires(pairs);

    let nextIdentifiedPairs = get().identifiedPairs;
    let nextIdentifiedPhases = get().identifiedPhases;
    if (stage.physicsModel === 'phasor-connections') {
      const map = getScrambledTerminalMap(OBSERVE_FIXED_SEED);
      nextIdentifiedPairs = map.halfWindings.map(
        (hw) => [hw.posTerminal, hw.negTerminal] as [TerminalId, TerminalId],
      );
      nextIdentifiedPhases =
        clamped >= 1
          ? (['a', 'b', 'c'] as const).map((ph) =>
              map.halfWindings
                .filter((hw) => hw.phase === ph)
                .map((hw) => canonicalPairKey(hw.posTerminal, hw.negTerminal)),
            )
          : [];
    }

    set({
      currentStageIndex: clamped,
      observationRows: observationRowsByStage[stage.id] ?? [],
      highlightedNetIndex: null,
      highlightedNetPinned: false,
      activeProbeLead: null,
      identifiedPairs: nextIdentifiedPairs,
      identifiedPhases: nextIdentifiedPhases,
      cameraPreset: 'overview',
      toasts: [],
    });
  },

  switchSelfStage: (index) => {
    const {
      experimentId,
      currentStageIndex,
      observationRowsByStage,
      wiresByStage,
      sessionSeed,
    } = get();
    const exp = getExperiment(experimentId);
    const clamped = Math.max(0, Math.min(exp.stages.length - 1, index));
    if (clamped === currentStageIndex) return;

    const currentStage = getStage(exp, currentStageIndex);
    const targetStage = getStage(exp, clamped);
    const targetComps = getStageComponents(exp, targetStage);

    const currentWires = useWiringStore.getState().wires;
    const nextWiresByStage: Record<string, WireEndpointPair[]> = {
      ...wiresByStage,
      [currentStage.id]: currentWires.map((w) => [w.a, w.b] as WireEndpointPair),
    };

    useControlsStore
      .getState()
      .initFromControls(
        targetStage.controls,
        sessionSeed,
        getStageMeterIds(experimentId, clamped),
      );
    const nextControlValues = useControlsStore.getState().values;

    const savedTargetWires = nextWiresByStage[targetStage.id];
    if (savedTargetWires) {
      useWiringStore.getState().setSolutionWires(savedTargetWires);
    } else {
      const carried = applyStageCarryOver(
        currentWires,
        targetStage,
        targetComps,
        nextControlValues,
      );
      useWiringStore
        .getState()
        .setSolutionWires(carried.map((w) => [w.a, w.b]));
    }

    set({
      currentStageIndex: clamped,
      wiresByStage: nextWiresByStage,
      observationRows: observationRowsByStage[targetStage.id] ?? [],
      hintLevel: 0,
      validationResult: null,
      resultModalOpen: false,
      showingSolution: false,
      cameraPreset: 'overview',
      toasts: [],
    });
  },

  switchLearnStage: (index) => {
    const { experimentId, observationRowsByStage, sessionSeed } = get();
    const exp = getExperiment(experimentId);
    const clamped = Math.max(0, Math.min(exp.stages.length - 1, index));
    const targetStage = getStage(exp, clamped);
    const allSteps = getAllLearnSteps(exp);
    const firstStepIdx = allSteps.findIndex((s) => s.stageId === targetStage.id);

    useControlsStore
      .getState()
      .initFromControls(
        targetStage.controls,
        sessionSeed,
        getStageMeterIds(experimentId, clamped),
      );
    useWiringStore.getState().clearAllWiresScripted();

    set({
      currentStageIndex: clamped,
      learnStepIndex: firstStepIdx >= 0 ? firstStepIdx : 0,
      learnNoLoadAck: false,
      learnFinished: false,
      observationRows: observationRowsByStage[targetStage.id] ?? [],
      highlightedNetIndex: null,
      highlightedNetPinned: false,
      cameraPreset: 'overview',
      toasts: [],
    });
  },

  continueToNextStage: () => {
    const { currentStageIndex } = get();
    get().switchSelfStage(currentStageIndex + 1);
  },

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
      currentStageIndex,
      sessionSeed,
      identifiedPairs,
      identifiedPhases,
      attempts,
      completedExperiments,
      completedStages,
      usedSolutionByExperiment,
      usedSolutionInRun,
      learnCompleted,
      runCompleted,
      runPractised,
    } = get();
    const experiment = getExperiment(experimentId);
    const stage = getStage(experiment, currentStageIndex);
    const controlValues = useControlsStore.getState().values;
    const result = validateWiring(
      experiment,
      wires,
      currentStageIndex,
      controlValues,
      {
        seed: sessionSeed,
        identification: {
          pairs: identifiedPairs,
          phaseGroups: identifiedPhases,
        },
      },
    );

    const nextAttempts = {
      ...attempts,
      [experimentId]: (attempts[experimentId] ?? 0) + 1,
    };

    const existingStages = completedStages[experimentId] ?? [];
    const nextExpStages =
      result.correct && !existingStages.includes(stage.id)
        ? [...existingStages, stage.id]
        : existingStages;
    const nextCompletedStages = {
      ...completedStages,
      [experimentId]: nextExpStages,
    };

    const allStagesWired = experiment.stages.every((s) =>
      nextExpStages.includes(s.id),
    );
    const nextCompleted =
      allStagesWired && !completedExperiments.includes(experimentId)
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
      version: 2,
      attempts: nextAttempts,
      completedExperiments: nextCompleted,
      completedStages: nextCompletedStages,
      usedSolutionByExperiment: nextUsedSolution,
      learnCompleted,
      runCompleted,
      runPractised,
    });

    set({
      attempts: nextAttempts,
      completedExperiments: nextCompleted,
      completedStages: nextCompletedStages,
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
      const stage = getStage(exp, state.currentStageIndex);
      const hints = stage.hints && stage.hints.length > 0 ? stage.hints : exp.hints;
      const maxLevel = hints.length;
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

  addObservationRow: (output, controls, energised) => {
    const {
      experimentId,
      currentStageIndex,
      observationRowsByStage,
      pushToast,
    } = get();
    const controlValues = toControlValues(controls);
    const supplyOn = isSupplySwitchOn(controlValues);
    if (!supplyOn || !energised) return;

    const experiment = getExperiment(experimentId);
    const stage = getStage(experiment, currentStageIndex);
    const stageRows = observationRowsByStage[stage.id] ?? [];
    if (stageRows.length >= MAX_OBSERVATION_ROWS) return;

    rowCounter += 1;
    const row = captureObservationRow(
      stage,
      output,
      controlValues,
      stageRows.length + 1,
      `obs_${rowCounter}`,
    );

    const violations = evaluateRowRules(stage, row);
    for (const v of violations) {
      if (v.amber) {
        pushToast({
          id: `obs-rule-${v.ruleId}`,
          severity: 'warning',
          message: v.message,
        });
      }
    }

    const nextStageRows = [...stageRows, row];
    set({
      observationRowsByStage: {
        ...observationRowsByStage,
        [stage.id]: nextStageRows,
      },
      observationRows: nextStageRows,
      runCheckResult: null,
    });
  },

  deleteObservationRow: (id) =>
    set((state) => {
      const exp = getExperiment(state.experimentId);
      const stage = getStage(exp, state.currentStageIndex);
      const stageRows = state.observationRowsByStage[stage.id] ?? [];
      const next = stageRows
        .filter((r) => r.id !== id)
        .map((r, idx) => ({ ...r, sno: idx + 1, values: { ...r.values, sno: idx + 1 } }));
      return {
        observationRowsByStage: {
          ...state.observationRowsByStage,
          [stage.id]: next,
        },
        observationRows: next,
        runCheckResult: null,
      };
    }),

  clearObservationRows: () =>
    set((state) => {
      const exp = getExperiment(state.experimentId);
      const stage = getStage(exp, state.currentStageIndex);
      return {
        observationRowsByStage: {
          ...state.observationRowsByStage,
          [stage.id]: [],
        },
        observationRows: [],
        runCheckResult: null,
      };
    }),

  setRunAnswerInput: (answerId, val) =>
    set((state) => ({
      runAnswerInputs: { ...state.runAnswerInputs, [answerId]: val },
      ...(answerId === 'regulationPct' ? { runRegulationInput: val } : {}),
      ...(answerId === 'maxEffLoadPct' ? { runMaxEffLoadInput: val } : {}),
    })),

  setChartInput: (inputId, val) =>
    set((state) => ({
      chartInputs: { ...state.chartInputs, [inputId]: val },
    })),

  setRunRegulationInput: (runRegulationInput) =>
    set((state) => ({
      runRegulationInput,
      runAnswerInputs: {
        ...state.runAnswerInputs,
        regulationPct: runRegulationInput,
      },
    })),

  setRunMaxEffLoadInput: (runMaxEffLoadInput) =>
    set((state) => ({
      runMaxEffLoadInput,
      runAnswerInputs: {
        ...state.runAnswerInputs,
        maxEffLoadPct: runMaxEffLoadInput,
      },
    })),

  submitRunAnswers: () => {
    const {
      experimentId,
      mode,
      observationRowsByStage,
      observationRows,
      runAnswerInputs,
      runRegulationInput,
      runMaxEffLoadInput,
      attempts,
      completedExperiments,
      completedStages,
      usedSolutionByExperiment,
      learnCompleted,
      runCompleted,
      runPractised,
    } = get();

    const experiment = getExperiment(experimentId);
    const primaryStage = getStage(experiment, 0);
    const rowsByStage =
      Object.keys(observationRowsByStage).length > 0
        ? observationRowsByStage
        : { [primaryStage.id]: observationRows };

    const mergedAnswers: Record<string, string> = {
      ...runAnswerInputs,
      ...(runRegulationInput !== ''
        ? { regulationPct: runRegulationInput }
        : {}),
      ...(runMaxEffLoadInput !== ''
        ? { maxEffLoadPct: runMaxEffLoadInput }
        : {}),
    };

    const result = checkRunAnswers(experiment, rowsByStage, mergedAnswers);

    let nextRunCompleted = runCompleted;
    let nextRunPractised = runPractised;

    if (result.passed) {
      if (mode === 'observe') {
        nextRunPractised = {
          ...runPractised,
          [experimentId]: true,
        };
      } else if (mode === 'self') {
        nextRunCompleted = {
          ...runCompleted,
          [experimentId]: true,
        };
      }
      if (mode === 'observe' || mode === 'self') {
        saveProgress({
          version: 2,
          attempts,
          completedExperiments,
          completedStages,
          usedSolutionByExperiment,
          learnCompleted,
          runCompleted: nextRunCompleted,
          runPractised: nextRunPractised,
        });
      }
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

  setActiveProbeLead: (activeProbeLead) => set({ activeProbeLead }),

  placeProbeLead: (lead, terminalId) => {
    const key = lead === 'a' ? 'probe.a' : 'probe.b';
    const otherKey = lead === 'a' ? 'probe.b' : 'probe.a';
    const ctrlStore = useControlsStore.getState();
    ctrlStore.setControlValue(key, terminalId);
    const otherVal = String(ctrlStore.values[otherKey] ?? '');
    if (lead === 'a' && !otherVal) {
      set({ activeProbeLead: 'b' });
    }
  },

  clearProbeLeads: () => {
    const ctrlStore = useControlsStore.getState();
    ctrlStore.setControlValue('probe.a', '');
    ctrlStore.setControlValue('probe.b', '');
    set({ activeProbeLead: null });
  },

  addIdentifiedPair: (a, b) =>
    set((state) => {
      if (a === b) return state;
      const key = canonicalPairKey(a, b);
      const exists = state.identifiedPairs.some(
        (p) => canonicalPairKey(p[0], p[1]) === key,
      );
      if (exists || state.identifiedPairs.length >= 6) return state;
      const used = new Set(state.identifiedPairs.flat());
      if (used.has(a) || used.has(b)) return state;
      return {
        identifiedPairs: [...state.identifiedPairs, [a, b]],
      };
    }),

  removeIdentifiedPair: (index) =>
    set((state) => ({
      identifiedPairs: state.identifiedPairs.filter((_, i) => i !== index),
      identifiedPhases: [],
    })),

  setIdentifiedPairs: (identifiedPairs) => set({ identifiedPairs }),

  setIdentifiedPhases: (identifiedPhases) => set({ identifiedPhases }),

  setLearnStepIndex: (learnStepIndex) => set({ learnStepIndex }),

  ackLearnReading: () => set({ learnNoLoadAck: true }),

  resetLearnAck: () => set({ learnNoLoadAck: false }),

  finishLearn: () => {
    const {
      experimentId,
      attempts,
      completedExperiments,
      completedStages,
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
      version: 2,
      attempts,
      completedExperiments,
      completedStages,
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
      currentStageIndex: 0,
      wiresByStage: {},
      activeProbeLead: null,
      identifiedPairs: [],
      identifiedPhases: [],
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
      currentStageIndex: 0,
  wiresByStage: {},
      hintLevel: 0,
      usedSolutionInRun: false,
      validationResult: null,
      resultModalOpen: false,
      showingSolution: false,
      observationRowsByStage: {},
      observationRows: [],
      runAnswerInputs: {},
      chartInputs: {},
      runRegulationInput: '',
      runMaxEffLoadInput: '',
      runCheckResult: null,
      highlightedNetIndex: null,
      highlightedNetPinned: false,
      activeProbeLead: null,
      identifiedPairs: [],
      identifiedPhases: [],
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
