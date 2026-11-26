import { beforeEach, describe, expect, it } from 'vitest';
import { collectInternalLinks, wiresFromNetlist } from '../core/circuit/nets';
import { findVariacForTargetV1 } from '../core/circuit/learn';
import { validateWiring } from '../core/circuit/validate';
import { ex3_1, NET_A, NET_B } from '../core/experiments/ex3_1';
import { evaluateExperimentPhysics } from '../core/physics/evaluate';
import { extractTransformerParams } from '../core/physics/models/transformerLoad';
import { computeRunTruth } from '../core/physics/report';
import { useControlsStore } from '../stores/controlsStore';
import { enterLabMode } from '../stores/modeActions';
import { parseStoredProgress, useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';
import type { MeterGains } from '../core/types';

const ZERO_GAINS: MeterGains = { vp: 0, vs: 0, am: 0, wm: 0 };

describe('Observe mode (pre-wired bench)', () => {
  beforeEach(() => {
    useWiringStore.getState().clearAllWiresScripted();
    useSessionStore.setState({
      screen: 'mode',
      experimentId: 'ex3.1',
      mode: 'self',
      completedExperiments: [],
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
    expect(ex3_1.netPurposes).toBeDefined();
    const keys = ex3_1.netCategoryKeys ?? [];
    expect(keys.length).toBe(ex3_1.acceptedNetlists[0].length);
    for (const key of keys) {
      const text = ex3_1.netPurposes?.[key];
      expect(typeof text).toBe('string');
      expect((text ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('defaults runPractised to {} when missing in legacy stored progress', () => {
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

    const withPractised = parseStoredProgress(
      JSON.stringify({ runPractised: { 'ex3.1': true } }),
    );
    expect(withPractised.runPractised).toEqual({ 'ex3.1': true });
  });

  it('loads 14 locked wires in Observe mode and clears them when entering Self or Learn mode', () => {
    enterLabMode('ex3.1', 'observe');

    expect(useSessionStore.getState().mode).toBe('observe');
    expect(useSessionStore.getState().screen).toBe('lab');
    const observeWires = useWiringStore.getState().wires;
    expect(observeWires).toHaveLength(14);
    expect(validateWiring(ex3_1, observeWires).correct).toBe(true);

    // Manual wiring/removal is blocked and shows the locked toast
    useWiringStore.getState().clickTerminal('sup.P', false);
    expect(useWiringStore.getState().selectedTerminal).toBeNull();
    expect(useWiringStore.getState().wires).toHaveLength(14);
    expect(useSessionStore.getState().toasts.at(-1)?.message).toBe(
      'Wires are locked in Observe mode.',
    );

    const firstWireId = observeWires[0].id;
    useWiringStore.getState().removeWire(firstWireId, false);
    expect(useWiringStore.getState().wires).toHaveLength(14);

    // Entering Self mode after Observe starts with an empty bench
    enterLabMode('ex3.1', 'self');
    expect(useSessionStore.getState().mode).toBe('self');
    expect(useWiringStore.getState().wires).toHaveLength(0);

    // Re-enter Observe, then switch to Learn mode -> starts with 0 wires at step 0
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

    for (const lamps of [0, 2, 4, 6, 8, 10]) {
      const knob = findVariacForTargetV1(ex3_1, wires, 230, lamps, ZERO_GAINS);
      useControlsStore.getState().setSupplyOn(true);
      useControlsStore.getState().setVariacV(knob);
      useControlsStore.getState().setLamps(lamps);
      const st = useControlsStore.getState();
      const controls = {
        supplyOn: st.supplyOn,
        variacV: st.variacV,
        wmVRange: st.wmVRange,
        wmIRange: st.wmIRange,
        lamps: st.lamps,
      };
      const { output, connectionState } = evaluateExperimentPhysics(
        ex3_1,
        wires,
        controls,
        ZERO_GAINS,
      );
      useSessionStore
        .getState()
        .addObservationRow(output, controls, connectionState.primaryEnergised);
    }

    const truth = computeRunTruth(extractTransformerParams(ex3_1.physicsParams));
    useSessionStore.getState().setRunRegulationInput(truth.regulationPct.toFixed(2));
    useSessionStore.getState().setRunMaxEffLoadInput(truth.maxEffLoadPct.toFixed(1));

    const result = useSessionStore.getState().submitRunAnswers();
    expect(result.passed).toBe(true);
    const session = useSessionStore.getState();
    expect(session.runPractised['ex3.1']).toBe(true);
    expect(session.runCompleted['ex3.1']).not.toBe(true);
    expect(session.completedExperiments).not.toContain('ex3.1');
  });
});
