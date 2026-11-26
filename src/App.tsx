import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  evaluateLearnStepCondition,
  findVariacForTargetV1,
} from './core/circuit/learn';
import {
  getAllLearnSteps,
  getStage,
  getStageCameraPresets,
  getStageIndexById,
} from './core/circuit/stages';
import {
  ASSET_MANIFEST,
  getExperimentAssets,
} from './core/experiments/assets';
import { getExperiment } from './core/experiments/registry';
import { evaluateExperimentPhysics } from './core/physics/evaluate';
import { BenchScene } from './scenes/BenchScene';
import { useControlsStore } from './stores/controlsStore';
import { enterLabMode } from './stores/modeActions';
import { useSessionStore } from './stores/sessionStore';
import { useWiringStore } from './stores/wiringStore';
import { DiagramPanel } from './ui/DiagramPanel';
import { ExperimentPicker } from './ui/ExperimentPicker';
import { LearnPlayer } from './ui/LearnPlayer';
import { Modal } from './ui/Modal';
import { ModeSelect } from './ui/ModeSelect';
import { ExperimentPdfActions } from './ui/PdfActions';
import { PdfPanel } from './ui/PdfPanel';
import { ResultModal } from './ui/ResultModal';
import { RightSidebar } from './ui/RightSidebar';
import { SolutionBanner } from './ui/SolutionBanner';
import { ThemeToggleButton } from './ui/ThemeToggleButton';
import { ToastBanner } from './ui/ToastBanner';

const STICKY_EVENT_IDS = new Set([
  'mcb-trip',
  'power-on-non-zero',
  'wiring-blocked',
]);

export function App() {
  const [confirmAction, setConfirmAction] = useState<
    'back' | 'reset' | 'exit-learn' | 'exit-observe' | null
  >(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const screen = useSessionStore((s) => s.screen);
  const experimentId = useSessionStore((s) => s.experimentId);
  const mode = useSessionStore((s) => s.mode);
  const sessionSeed = useSessionStore((s) => s.sessionSeed);
  const currentStageIndex = useSessionStore((s) => s.currentStageIndex);
  const completedStages = useSessionStore((s) => s.completedStages);
  const observationRows = useSessionStore((s) => s.observationRows);
  const cameraPreset = useSessionStore((s) => s.cameraPreset);
  const showTerminalLabels = useSessionStore((s) => s.showTerminalLabels);
  const sidebarOpen = useSessionStore((s) => s.sidebarOpen);
  const showNumericReadouts = useSessionStore((s) => s.showNumericReadouts);
  const diagramPanelOpen = useSessionStore((s) => s.diagramPanelOpen);
  const pdfPreviewAsset = useSessionStore((s) => s.pdfPreviewAsset);
  const validationResult = useSessionStore((s) => s.validationResult);

  const learnStepIndex = useSessionStore((s) => s.learnStepIndex);
  const learnNoLoadAck = useSessionStore((s) => s.learnNoLoadAck);
  const learnFinished = useSessionStore((s) => s.learnFinished);

  const goToScreen = useSessionStore((s) => s.goToScreen);
  const setCurrentStageIndex = useSessionStore((s) => s.setCurrentStageIndex);
  const switchObserveStage = useSessionStore((s) => s.switchObserveStage);
  const setCameraPreset = useSessionStore((s) => s.setCameraPreset);
  const toggleTerminalLabels = useSessionStore((s) => s.toggleTerminalLabels);
  const toggleSidebar = useSessionStore((s) => s.toggleSidebar);
  const toggleNumericReadouts = useSessionStore((s) => s.toggleNumericReadouts);
  const toggleDiagramPanel = useSessionStore((s) => s.toggleDiagramPanel);
  const closeDiagramPanel = useSessionStore((s) => s.closeDiagramPanel);
  const closePdfPreview = useSessionStore((s) => s.closePdfPreview);
  const submitWiring = useSessionStore((s) => s.submitWiring);
  const openLastResult = useSessionStore((s) => s.openLastResult);
  const setLearnStepIndex = useSessionStore((s) => s.setLearnStepIndex);
  const ackLearnReading = useSessionStore((s) => s.ackLearnReading);
  const resetLearnAck = useSessionStore((s) => s.resetLearnAck);
  const finishLearn = useSessionStore((s) => s.finishLearn);
  const resetLearnRun = useSessionStore((s) => s.resetLearnRun);
  const pushToast = useSessionStore((s) => s.pushToast);
  const dismissToast = useSessionStore((s) => s.dismissToast);
  const resetLabSession = useSessionStore((s) => s.resetLabSession);

  const wires = useWiringStore((s) => s.wires);
  const selectedTerminal = useWiringStore((s) => s.selectedTerminal);
  const clearSelectedTerminal = useWiringStore((s) => s.clearSelectedTerminal);
  const clearAllWires = useWiringStore((s) => s.clearAllWires);
  const addTutorialWire = useWiringStore((s) => s.addTutorialWire);
  const removeTutorialWiresFromStep = useWiringStore(
    (s) => s.removeTutorialWiresFromStep,
  );
  const clearAllWiresScripted = useWiringStore((s) => s.clearAllWiresScripted);

  const controlValues = useControlsStore((s) => s.values);
  const gains = useControlsStore((s) => s.gains);
  const focusedControl = useControlsStore((s) => s.focusedControl);
  const setControlValue = useControlsStore((s) => s.setControlValue);
  const clearMcbTrip = useControlsStore((s) => s.clearMcbTrip);
  const tripMcb = useControlsStore((s) => s.tripMcb);
  const setFocusedControl = useControlsStore((s) => s.setFocusedControl);
  const initFromControls = useControlsStore((s) => s.initFromControls);

  const experiment = useMemo(() => getExperiment(experimentId), [experimentId]);
  const currentStage = useMemo(
    () => getStage(experiment, currentStageIndex),
    [experiment, currentStageIndex],
  );
  const stageCameraPresets = useMemo(
    () => getStageCameraPresets(currentStage),
    [currentStage],
  );
  const experimentAssets = useMemo(
    () => getExperimentAssets(ASSET_MANIFEST, experimentId),
    [experimentId],
  );

  const isLearn = mode === 'learn';
  const isObserve = mode === 'observe';
  const isSelf = mode === 'self';
  const learnSteps = useMemo(() => getAllLearnSteps(experiment), [experiment]);
  const currentLearnStep = learnSteps[learnStepIndex] ?? learnSteps[0];

  useEffect(() => {
    initFromControls(currentStage.controls, sessionSeed);
  }, [currentStage, sessionSeed, initFromControls]);

  const evaluation = useMemo(
    () =>
      evaluateExperimentPhysics(experiment, wires, controlValues, gains, {
        stageIndex: currentStageIndex,
        seed: sessionSeed,
      }),
    [experiment, wires, controlValues, gains, currentStageIndex, sessionSeed],
  );

  const learnConditionStatus = useMemo(() => {
    if (!isLearn || !currentLearnStep) {
      return { hasCondition: false, met: true, canAcknowledge: false, hint: '' };
    }
    return evaluateLearnStepCondition(
      currentLearnStep,
      controlValues,
      evaluation.output,
      learnNoLoadAck,
    );
  }, [isLearn, currentLearnStep, controlValues, evaluation.output, learnNoLoadAck]);

  // Scripted Learn-mode step controller: automatic stage switch + camera preset + staggered wire animation
  const wireTimersRef = useRef<number[]>([]);
  const clearWireTimers = useCallback(() => {
    for (const t of wireTimersRef.current) {
      window.clearTimeout(t);
    }
    wireTimersRef.current = [];
  }, []);

  useEffect(() => {
    if (screen !== 'lab' || !isLearn || !currentLearnStep) return;

    const targetStageIdx = getStageIndexById(experiment, currentLearnStep.stageId);
    if (targetStageIdx !== currentStageIndex) {
      if (useControlsStore.getState().supplyOn) {
        setControlValue('sup.switch', false);
      }
      clearAllWiresScripted();
      setCurrentStageIndex(targetStageIdx);
    }

    setCameraPreset(currentLearnStep.camera);

    clearWireTimers();
    const pairs = currentLearnStep.connectTerminals ?? [];
    if (pairs.length > 0) {
      if (useControlsStore.getState().supplyOn) {
        setControlValue('sup.switch', false);
      }
      pairs.forEach(([a, b], idx) => {
        const timer = window.setTimeout(() => {
          addTutorialWire(a, b, learnStepIndex);
        }, idx * 240);
        wireTimersRef.current.push(timer);
      });
    }

    return () => {
      clearWireTimers();
    };
  }, [
    screen,
    isLearn,
    learnStepIndex,
    currentLearnStep,
    experiment,
    currentStageIndex,
    setCurrentStageIndex,
    setCameraPreset,
    setControlValue,
    addTutorialWire,
    clearAllWiresScripted,
    clearWireTimers,
  ]);

  const firstConditionIdx = useMemo(() => {
    const idx = learnSteps.findIndex((s) => Boolean(s.completionCondition));
    return idx >= 0 ? idx : learnSteps.length;
  }, [learnSteps]);

  const handleLearnBack = useCallback(() => {
    if (learnStepIndex <= 0) return;
    clearWireTimers();
    const prevIdx = learnStepIndex - 1;
    const prevStep = learnSteps[prevIdx];
    const leavingWireStep = Boolean(currentLearnStep?.connectTerminals?.length);
    const crossingPastCondition =
      learnStepIndex >= firstConditionIdx && prevIdx < firstConditionIdx;
    const crossingStage =
      prevStep?.stageId && currentLearnStep?.stageId && prevStep.stageId !== currentLearnStep.stageId;

    if (leavingWireStep || crossingPastCondition || crossingStage) {
      setControlValue('sup.switch', false);
      setControlValue('va.knob', 0);
      setControlValue('ld.lamps', 0);
      clearMcbTrip();
      resetLearnAck();
      removeTutorialWiresFromStep(prevIdx + 1);
      if (crossingStage) {
        const prevStageIdx = getStageIndexById(experiment, prevStep.stageId);
        setCurrentStageIndex(prevStageIdx);
        for (let i = 0; i <= prevIdx; i++) {
          const st = learnSteps[i];
          if (st.stageId === prevStep.stageId) {
            for (const [a, b] of st.connectTerminals ?? []) {
              addTutorialWire(a, b, i);
            }
          }
        }
      }
    } else if (currentLearnStep?.completionCondition?.kind === 'no-load-ack') {
      resetLearnAck();
    }

    setLearnStepIndex(prevIdx);
  }, [
    learnStepIndex,
    learnSteps,
    currentLearnStep,
    firstConditionIdx,
    experiment,
    clearWireTimers,
    setControlValue,
    clearMcbTrip,
    resetLearnAck,
    removeTutorialWiresFromStep,
    setCurrentStageIndex,
    addTutorialWire,
    setLearnStepIndex,
  ]);

  const applyLearnStepControls = useCallback(() => {
    const cond = currentLearnStep?.completionCondition;
    if (!cond) return;

    const currentWires = useWiringStore.getState().wires;
    const loadId = 'loadControlId' in cond ? (cond.loadControlId ?? 'ld.lamps') : 'ld.lamps';
    const meterId = cond.meterId ?? 'vp';
    const controlId = 'controlId' in cond ? (cond.controlId ?? 'va.knob') : 'va.knob';
    const targetLamps =
      cond.kind === 'loaded-v1-target'
        ? Math.max(Number(useControlsStore.getState().values[loadId] ?? 0), cond.minLamps)
        : 0;
    const targetKnob = findVariacForTargetV1(
      experiment,
      currentWires,
      cond.targetV,
      targetLamps,
      gains,
      {
        stageIndex: currentStageIndex,
        seed: sessionSeed,
        knobControlId: controlId,
        loadControlId: loadId,
        meterId,
        baseControls: useControlsStore.getState().values,
      },
    );

    setControlValue(loadId, targetLamps);
    setControlValue(controlId, targetKnob);
    setControlValue('sup.switch', true);
    if (cond.kind === 'no-load-ack') {
      ackLearnReading();
    }
  }, [
    currentLearnStep,
    experiment,
    currentStageIndex,
    sessionSeed,
    gains,
    setControlValue,
    ackLearnReading,
  ]);

  const handleLearnNext = useCallback(() => {
    if (learnStepIndex >= learnSteps.length - 1) return;
    if (learnConditionStatus.hasCondition && !learnConditionStatus.met) return;
    setLearnStepIndex(learnStepIndex + 1);
  }, [
    learnStepIndex,
    learnSteps.length,
    learnConditionStatus,
    setLearnStepIndex,
  ]);

  const handleLearnSkip = useCallback(() => {
    if (learnStepIndex >= learnSteps.length - 1) return;
    clearWireTimers();

    const pairs = currentLearnStep?.connectTerminals ?? [];
    if (pairs.length > 0) {
      setControlValue('sup.switch', false);
      for (const [a, b] of pairs) {
        addTutorialWire(a, b, learnStepIndex);
      }
    }

    if (currentLearnStep?.completionCondition) {
      applyLearnStepControls();
    }

    setLearnStepIndex(learnStepIndex + 1);
  }, [
    learnStepIndex,
    learnSteps.length,
    currentLearnStep,
    clearWireTimers,
    setControlValue,
    addTutorialWire,
    applyLearnStepControls,
    setLearnStepIndex,
  ]);

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

  const supplyOn = Boolean(controlValues['sup.switch']);
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
        if (confirmAction !== null) return;
        if (pdfPreviewAsset !== null) {
          closePdfPreview();
          return;
        }
        if (diagramPanelOpen) {
          closeDiagramPanel();
          return;
        }
        if (isLearn) {
          setConfirmAction('exit-learn');
        } else {
          clearSelectedTerminal();
          setFocusedControl(null);
        }
      } else if (
        (e.key === 'd' || e.key === 'D') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        confirmAction === null &&
        (isSelf || isObserve) &&
        experimentAssets.diagrams.length > 0
      ) {
        toggleDiagramPanel();
      } else if (
        isLearn &&
        !learnFinished &&
        focusedControl !== 'va.knob' &&
        confirmAction === null &&
        e.key === 'ArrowRight'
      ) {
        e.preventDefault();
        handleLearnNext();
      } else if (
        isLearn &&
        !learnFinished &&
        focusedControl !== 'va.knob' &&
        confirmAction === null &&
        e.key === 'ArrowLeft'
      ) {
        e.preventDefault();
        handleLearnBack();
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
    isLearn,
    isSelf,
    isObserve,
    learnFinished,
    focusedControl,
    confirmAction,
    diagramPanelOpen,
    pdfPreviewAsset,
    experimentAssets.diagrams.length,
    handleLearnNext,
    handleLearnBack,
    clearSelectedTerminal,
    setFocusedControl,
    toggleTerminalLabels,
    toggleSidebar,
    toggleDiagramPanel,
    closeDiagramPanel,
    closePdfPreview,
  ]);

  const performResetBench = useCallback(() => {
    clearWireTimers();
    const stage0 = getStage(experiment, 0);
    initFromControls(stage0.controls, sessionSeed);
    if (isLearn) {
      clearAllWiresScripted();
    } else if (isSelf) {
      clearAllWires(false);
    }
    resetLabSession();
    prevEventIdsRef.current.clear();
  }, [
    clearWireTimers,
    initFromControls,
    experiment,
    sessionSeed,
    isLearn,
    isSelf,
    clearAllWiresScripted,
    clearAllWires,
    resetLabSession,
  ]);

  const handleReplayLearn = useCallback(() => {
    clearWireTimers();
    clearAllWiresScripted();
    const stage0 = getStage(experiment, 0);
    initFromControls(stage0.controls, sessionSeed);
    resetLearnRun();
    prevEventIdsRef.current.clear();
  }, [
    clearWireTimers,
    clearAllWiresScripted,
    initFromControls,
    experiment,
    sessionSeed,
    resetLearnRun,
  ]);

  const handleTryYourself = useCallback(() => {
    clearWireTimers();
    enterLabMode(experimentId, 'self');
    prevEventIdsRef.current.clear();
  }, [clearWireTimers, experimentId]);

  const handleBackClick = () => {
    if (isLearn) {
      setConfirmAction('exit-learn');
      return;
    }
    if (isObserve) {
      if (observationRows.length > 0) {
        setConfirmAction('exit-observe');
        return;
      }
      performResetBench();
      clearAllWiresScripted();
      goToScreen('picker');
      return;
    }
    if (wires.length > 0) {
      setConfirmAction('back');
      return;
    }
    performResetBench();
    goToScreen('picker');
  };

  if (screen === 'picker') {
    return (
      <>
        <ExperimentPicker />
        <PdfPanel />
      </>
    );
  }

  if (screen === 'mode') {
    return (
      <>
        <ModeSelect />
        <PdfPanel />
      </>
    );
  }

  const learnControlsLocked = isLearn && learnStepIndex < firstConditionIdx;
  const hasMultipleStages = experiment.stages.length > 1;
  const wiredStageIds = new Set(completedStages[experiment.id] ?? []);

  return (
    <div className="fixed inset-0 flex overflow-x-clip overflow-y-hidden select-none">
      <div className="relative h-full min-w-0 flex-1 overflow-x-clip overflow-y-hidden">
        <BenchScene
          labOutput={evaluation.output}
          connectionState={evaluation.connectionState}
          focusIds={isLearn ? currentLearnStep.focus : []}
          controlsLocked={learnControlsLocked}
        />

        {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-2.5 z-20 flex flex-wrap items-center justify-between gap-1.5 px-2.5 md:px-3">
          {/* Left group: Back + mode actions */}
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

            {!isLearn && (
              <>
                {isSelf && (
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
                )}

                {isSelf && validationResult && (
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
              </>
            )}
          </div>

          {/* Stage stepper / tabs when experiment has multiple stages */}
          {hasMultipleStages && (
            <div
              role={isObserve ? 'tablist' : undefined}
              aria-label="Experiment stages"
              className="pointer-events-auto flex items-center gap-0.5 rounded-full p-1 shadow-lg backdrop-blur"
              style={{
                backgroundColor: 'var(--vml-panel)',
                border: '1px solid var(--vml-border)',
                color: 'var(--vml-text)',
              }}
            >
              {experiment.stages.map((st, idx) => {
                const active = idx === currentStageIndex;
                const wired = wiredStageIds.has(st.id);
                if (isObserve) {
                  return (
                    <button
                      key={st.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => switchObserveStage(idx)}
                      className="h-6 rounded-full px-2.5 text-xs font-semibold transition"
                      style={{
                        backgroundColor: active
                          ? 'var(--vml-accent)'
                          : 'transparent',
                        color: active
                          ? 'var(--vml-accent-text)'
                          : 'var(--vml-text)',
                      }}
                    >
                      {idx + 1}. {st.title}
                    </button>
                  );
                }
                return (
                  <span
                    key={st.id}
                    className="inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
                    style={{
                      backgroundColor: active
                        ? 'var(--vml-accent)'
                        : 'transparent',
                      color: active
                        ? 'var(--vml-accent-text)'
                        : 'var(--vml-text-muted)',
                    }}
                  >
                    {wired && !active ? '✓ ' : ''}
                    {idx + 1}. {st.title}
                  </span>
                );
              })}
            </div>
          )}

          {/* Center group: per-stage camera presets */}
          <div
            className="pointer-events-auto order-3 flex w-full items-center justify-center gap-0.5 rounded-full p-1 shadow-lg backdrop-blur sm:order-none sm:w-auto"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-border)',
              color: 'var(--vml-text)',
            }}
          >
            {stageCameraPresets.map((p) => {
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

          {/* Reference assets (Self & Observe modes only) */}
          {(isSelf || isObserve) && (
            <div className="pointer-events-auto order-4 flex w-full flex-wrap items-center justify-center gap-1.5 sm:order-none sm:w-auto sm:justify-start">
              <button
                type="button"
                disabled={experimentAssets.diagrams.length === 0}
                onClick={toggleDiagramPanel}
                aria-pressed={diagramPanelOpen}
                aria-label={
                  experimentAssets.diagrams.length === 0
                    ? 'Diagram not added yet'
                    : 'View circuit diagram (D)'
                }
                title={
                  experimentAssets.diagrams.length === 0
                    ? 'Diagram not added yet'
                    : 'View circuit diagram (D)'
                }
                className="inline-flex h-8 shrink-0 items-center rounded-full px-2.5 text-xs font-medium shadow-lg backdrop-blur transition disabled:cursor-not-allowed disabled:opacity-55"
                style={{
                  backgroundColor: diagramPanelOpen
                    ? 'var(--vml-accent)'
                    : 'var(--vml-panel)',
                  border: '1px solid var(--vml-border)',
                  color: diagramPanelOpen
                    ? 'var(--vml-accent-text)'
                    : 'var(--vml-text)',
                }}
              >
                {experimentAssets.diagrams.length === 0
                  ? 'Diagram not added yet'
                  : 'View circuit diagram (D)'}
              </button>

              <ExperimentPdfActions pdf={experimentAssets.pdf} variant="topbar" />
            </div>
          )}

          {/* Right group: theme, labels, panel toggle, and phone More menu */}
          <div className="pointer-events-auto order-2 relative flex items-center gap-1.5 sm:order-none">
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
                {isSelf && validationResult && (
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
                {!isLearn && (
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
                )}
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
              {isSelf && selectedTerminal ? (
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

        {isLearn ? (
          <LearnPlayer
            experimentTitle={experiment.title}
            stageTitle={hasMultipleStages ? currentStage.title : undefined}
            step={currentLearnStep}
            stepIndex={learnStepIndex}
            totalSteps={learnSteps.length}
            conditionStatus={learnConditionStatus}
            showNumericReadouts={showNumericReadouts}
            onToggleNumericReadouts={toggleNumericReadouts}
            learnFinished={learnFinished}
            onNext={handleLearnNext}
            onBack={handleLearnBack}
            onSkip={handleLearnSkip}
            onGotIt={ackLearnReading}
            onDoItForMe={applyLearnStepControls}
            onFinish={finishLearn}
            onReplay={handleReplayLearn}
            onTryYourself={handleTryYourself}
            onExit={() => setConfirmAction('exit-learn')}
          />
        ) : isSelf ? (
          <SolutionBanner experiment={experiment} />
        ) : null}

        {(isSelf || isObserve) && (
          <DiagramPanel
            open={diagramPanelOpen}
            experimentId={experiment.id}
            experimentTitle={experiment.title}
            diagrams={experimentAssets.diagrams}
            onClose={closeDiagramPanel}
          />
        )}
      </div>

      <PdfPanel />

      <RightSidebar
        experiment={experiment}
        controls={currentStage.controls}
        output={evaluation.output}
        energised={evaluation.connectionState.energised}
        controlsLocked={learnControlsLocked}
        unlockHint={
          firstConditionIdx < learnSteps.length
            ? `Unlocks at step ${firstConditionIdx + 1}`
            : undefined
        }
      />

      {isSelf && (
        <ResultModal
          experiment={experiment}
          onRequestReset={() => setConfirmAction('reset')}
        />
      )}

      <Modal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        titleId="confirm-action-title"
        maxWidthClass="max-w-sm"
      >
        <div className="space-y-4">
          <h2 id="confirm-action-title" className="text-base font-bold">
            {confirmAction === 'exit-learn'
              ? 'Exit guided walkthrough?'
              : confirmAction === 'exit-observe'
                ? 'Leave pre-wired bench?'
                : confirmAction === 'back'
                  ? 'Leave bench and discard wiring?'
                  : 'Reset the bench?'}
          </h2>
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            {confirmAction === 'exit-learn'
              ? 'Exiting returns you to mode selection and resets the walkthrough progress.'
              : confirmAction === 'exit-observe'
                ? 'Returning to the experiment picker clears your current observation rows and resets the controls.'
                : confirmAction === 'back'
                  ? 'You have wires placed on the bench. Returning to the experiment picker will clear your current wiring and controls.'
                  : isObserve
                    ? 'This clears observation rows, supply switch, variac knob, meter ranges, load switches, MCB trip, meter damage, and notifications. Pre-wired connections remain unchanged.'
                    : 'This clears all wires, selected terminals, supply switch, variac knob, meter ranges, load switches, MCB trip, meter damage, and notifications.'}
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
                if (action === 'exit-observe') {
                  clearAllWiresScripted();
                  goToScreen('picker');
                } else if (action === 'exit-learn') {
                  goToScreen('mode');
                } else if (action === 'back') {
                  goToScreen('picker');
                }
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500"
            >
              {confirmAction === 'exit-learn'
                ? 'Exit walkthrough'
                : confirmAction === 'back' || confirmAction === 'exit-observe'
                  ? 'Leave bench'
                  : 'Reset bench'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default App;
