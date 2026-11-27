import { beforeEach, describe, expect, it } from 'vitest';
import { findVariacForTargetV1 } from '../core/circuit/learn';
import { getObserveSteps } from '../core/circuit/observe';
import { collectInternalLinks, wiresFromNetlist } from '../core/circuit/nets';
import { findStageTerminalNetInfo, getStage } from '../core/circuit/stages';
import { validateWiring } from '../core/circuit/validate';
import { ex3_1, NET_A, NET_B } from '../core/experiments/ex3_1';
import { EXPERIMENTS } from '../core/experiments/registry';
import { evaluateExperimentPhysics } from '../core/physics/evaluate';
import { extractTransformerParams } from '../core/physics/models/transformerLoad';
import { computeRunTruth } from '../core/physics/report';
import type { MeterGains } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { enterLabMode } from '../stores/modeActions';
import {
  OBSERVE_FIXED_SEED,
  parseStoredProgress,
  useSessionStore,
} from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';

const ZERO_GAINS: MeterGains = { vp: 0, vs: 0, am: 0, wm: 0 };

describe('Observe mode (pre-wired bench)', () => {
  beforeEach(() => {
    useWiringStore.getState().clearAllWiresScripted();
    useSessionStore.setState({
      screen: 'mode',
      experimentId: 'ex3.1',
      mode: 'self',
      completedExperiments: [],
      completedStages: {},
      runCompleted: {},
      runPractised: {},
    });
    useSessionStore.getState().resetLabSession();
  });

  it('wiresFromNetlist produces 14 valid wires for NET_A and NET_B', () => {
    const internalLinks = collectInternalLinks(ex3_1.components);

    const wiresA = wiresFromNetlist(NET_A, internalLinks, ex3_1.components);
    expect(wiresA).toHaveLength(14);
    const resA = validateWiring(ex3_1, wiresA);
    expect(resA.correct).toBe(true);
    expect(resA.openNets).toHaveLength(0);
    expect(resA.shorts).toHaveLength(0);
    expect(resA.extras).toHaveLength(0);
    expect(resA.faults).toHaveLength(0);

    const wiresB = wiresFromNetlist(NET_B, internalLinks, ex3_1.components);
    expect(wiresB).toHaveLength(14);
    const resB = validateWiring(ex3_1, wiresB);
    expect(resB.correct).toBe(true);
    expect(resB.openNets).toHaveLength(0);
    expect(resB.shorts).toHaveLength(0);
    expect(resB.extras).toHaveLength(0);
    expect(resB.faults).toHaveLength(0);
  });

  it('provides a netPurposes entry for every category used in netCategoryKeys', () => {
    const stage = getStage(ex3_1, 0);
    expect(stage.netPurposes).toBeDefined();
    const keys = stage.netCategoryKeys ?? [];
    expect(keys.length).toBe(stage.acceptedNetlists[0].length);
    for (const key of keys) {
      const text = stage.netPurposes?.[key];
      expect(typeof text).toBe('string');
      expect((text ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('defaults runPractised to {} and migrates completedStages when missing in legacy stored progress', () => {
    const legacy = JSON.stringify({
      attempts: { 'ex3.1': 2 },
      completedExperiments: ['ex3.1'],
      usedSolutionByExperiment: { 'ex3.1': false },
      learnCompleted: { 'ex3.1': true },
      runCompleted: { 'ex3.1': false },
    });
    const parsed = parseStoredProgress(legacy);
    expect(parsed.runPractised).toEqual({});
    expect(parsed.attempts['ex3.1']).toBe(2);
    expect(parsed.completedExperiments).toEqual(['ex3.1']);
    expect(parsed.completedStages['ex3.1']).toEqual(['load-test']);

    const withPractised = parseStoredProgress(
      JSON.stringify({ runPractised: { 'ex3.1': true } }),
    );
    expect(withPractised.runPractised).toEqual({ 'ex3.1': true });
  });

  it('loads 14 locked wires in Observe mode with fixed seed and clears them when entering Self or Learn mode', () => {
    enterLabMode('ex3.1', 'observe');

    expect(useSessionStore.getState().mode).toBe('observe');
    expect(useSessionStore.getState().screen).toBe('lab');
    expect(useSessionStore.getState().sessionSeed).toBe(OBSERVE_FIXED_SEED);
    const observeWires = useWiringStore.getState().wires;
    expect(observeWires).toHaveLength(14);
    expect(validateWiring(ex3_1, observeWires).correct).toBe(true);

    useWiringStore.getState().clickTerminal('sup.P', false);
    expect(useWiringStore.getState().selectedTerminal).toBeNull();
    expect(useWiringStore.getState().wires).toHaveLength(14);
    expect(useSessionStore.getState().toasts.at(-1)?.message).toBe(
      'Wires are locked in Observe mode.',
    );

    const firstWireId = observeWires[0].id;
    useWiringStore.getState().removeWire(firstWireId, false);
    expect(useWiringStore.getState().wires).toHaveLength(14);

    enterLabMode('ex3.1', 'self');
    expect(useSessionStore.getState().mode).toBe('self');
    expect(useWiringStore.getState().wires).toHaveLength(0);

    enterLabMode('ex3.1', 'observe');
    expect(useWiringStore.getState().wires).toHaveLength(14);
    enterLabMode('ex3.1', 'learn');
    expect(useSessionStore.getState().mode).toBe('learn');
    expect(useSessionStore.getState().learnStepIndex).toBe(0);
    expect(useWiringStore.getState().wires).toHaveLength(0);
  });

  it('records runPractised in Observe mode without marking completedExperiments or runCompleted', () => {
    enterLabMode('ex3.1', 'observe');
    const wires = useWiringStore.getState().wires;
    const stage = getStage(ex3_1, 0);

    for (const lamps of [0, 2, 4, 6, 8, 10]) {
      const knob = findVariacForTargetV1(ex3_1, wires, 230, lamps, ZERO_GAINS);
      useControlsStore.getState().setSupplyOn(true);
      useControlsStore.getState().setVariacV(knob);
      useControlsStore.getState().setLamps(lamps);
      const controls = { ...useControlsStore.getState().values };
      const { output, connectionState } = evaluateExperimentPhysics(
        ex3_1,
        wires,
        controls,
        ZERO_GAINS,
      );
      useSessionStore
        .getState()
        .addObservationRow(output, controls, connectionState.energised);
    }

    const truth = computeRunTruth(extractTransformerParams(stage.physicsParams));
    useSessionStore.getState().setRunRegulationInput(truth.regulationPct.toFixed(2));
    useSessionStore.getState().setRunMaxEffLoadInput(truth.maxEffLoadPct.toFixed(1));

    const result = useSessionStore.getState().submitRunAnswers();
    expect(result.passed).toBe(true);
    const session = useSessionStore.getState();
    expect(session.runPractised['ex3.1']).toBe(true);
    expect(session.runCompleted['ex3.1']).not.toBe(true);
    expect(session.completedExperiments).not.toContain('ex3.1');
  });

  it('resolves terminal net labels for Observe mode hover tooltips (including neutral and supply)', () => {
    const stage31 = getStage(ex3_1, 0);
    expect(findStageTerminalNetInfo(stage31, 'sup.P')).toMatchObject({
      netIndex: 0,
    });
    expect(findStageTerminalNetInfo(stage31, 'sup.N')?.label).toMatch(/neutral/i);
    expect(findStageTerminalNetInfo(stage31, 'vp.A')).toBeTruthy();
  });

  it('provides ObserveSteps with which, why, when, and steps for every stage of every experiment', () => {
    for (const exp of Object.values(EXPERIMENTS)) {
      for (const stage of exp.stages) {
        const steps = getObserveSteps(exp.id, stage);
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
          expect(step.which.trim().length).toBeGreaterThan(0);
          expect(step.why.trim().length).toBeGreaterThan(0);
          expect(step.when.trim().length).toBeGreaterThan(0);
          expect(step.steps.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('evaluates ObserveStep readiness and recorded status in ex3.1 and resets observeStepIndex on stage switch', () => {
    enterLabMode('ex3.1', 'observe');
    const stage = getStage(ex3_1, 0);
    const steps = getObserveSteps('ex3.1', stage);
    const noLoadStep = steps[0];
    const wires = useWiringStore.getState().wires;

    // 1. Supply OFF -> not ready
    let controls = { ...useControlsStore.getState().values };
    let evalRes = evaluateExperimentPhysics(ex3_1, wires, controls, ZERO_GAINS);
    let status = noLoadStep.evaluateReady({
      controls,
      output: evalRes.output,
      energised: evalRes.connectionState.energised,
      dualReady: true,
      rows: [],
      params: stage.physicsParams,
    });
    expect(status.ready).toBe(false);
    expect(status.recorded).toBe(false);

    // 2. Supply ON, 0 lamps, V1 = 230 V -> ready
    const knob = findVariacForTargetV1(ex3_1, wires, 230, 0, ZERO_GAINS);
    useControlsStore.getState().setSupplyOn(true);
    useControlsStore.getState().setVariacV(knob);
    useControlsStore.getState().setLamps(0);
    controls = { ...useControlsStore.getState().values };
    evalRes = evaluateExperimentPhysics(ex3_1, wires, controls, ZERO_GAINS);
    status = noLoadStep.evaluateReady({
      controls,
      output: evalRes.output,
      energised: evalRes.connectionState.energised,
      dualReady: true,
      rows: [],
      params: stage.physicsParams,
    });
    expect(status.ready).toBe(true);
    expect(status.recorded).toBe(false);

    // 3. Record row -> recorded becomes true
    useSessionStore
      .getState()
      .addObservationRow(evalRes.output, controls, evalRes.connectionState.energised);
    const rows = useSessionStore.getState().observationRows;
    status = noLoadStep.evaluateReady({
      controls,
      output: evalRes.output,
      energised: evalRes.connectionState.energised,
      dualReady: true,
      rows,
      params: stage.physicsParams,
    });
    expect(status.recorded).toBe(true);

    // 4. Multi-stage switch resets observeStepIndex to 0
    enterLabMode('ex3.2', 'observe');
    useSessionStore.getState().setObserveStepIndex(2);
    expect(useSessionStore.getState().observeStepIndex).toBe(2);
    useSessionStore.getState().switchObserveStage(1);
    expect(useSessionStore.getState().observeStepIndex).toBe(0);
  });
});
