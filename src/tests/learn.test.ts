import { beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateLearnStepCondition,
  findVariacForTargetV1,
} from '../core/circuit/learn';
import {
  buildNets,
  collectInternalLinks,
  wiresFromNetlist,
} from '../core/circuit/nets';
import {
  getAllLearnSteps,
  getStage,
  getStageComponents,
} from '../core/circuit/stages';
import { validateWiring } from '../core/circuit/validate';
import { getComponentDef } from '../core/components';
import { ex3_1, NET_A } from '../core/experiments/ex3_1';
import { ex3_2, OC_NET_A, SC_NET_A } from '../core/experiments/ex3_2';
import { netlistToWirePairs } from '../core/experiments/registry';
import {
  evaluateExperimentPhysics,
  findMeterReading,
} from '../core/physics/evaluate';
import { extractTransformerParams } from '../core/physics/models/transformerLoad';
import { computeOcScMethodTruth } from '../core/physics/models/transformerOcSc';
import { computeRunTruth } from '../core/physics/report';
import type {
  MeterGains,
  TransformerLoadControls,
  WireEndpointPair,
} from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { enterLabMode } from '../stores/modeActions';
import { useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';

describe('Exp 3.1 Learn mode steps and conditions', () => {
  it('has 17 learn steps referencing existing component ids and terminal ids', () => {
    const steps = getAllLearnSteps(ex3_1);
    expect(steps).toHaveLength(17);

    const componentIds = new Set(ex3_1.components.map((c) => c.id));
    const terminalIds = new Set<string>();
    for (const c of ex3_1.components) {
      for (const t of getComponentDef(c.type).terminals) {
        terminalIds.add(`${c.id}.${t.name}`);
      }
    }

    for (const step of steps) {
      expect(step.id).toBeTruthy();
      expect(step.stageId).toBe(ex3_1.stages[0].id);
      for (const cid of step.focus) {
        expect(componentIds.has(cid), `Unknown component in focus: ${cid}`).toBe(
          true,
        );
      }
      for (const [a, b] of step.connectTerminals ?? []) {
        expect(terminalIds.has(a), `Unknown terminal: ${a}`).toBe(true);
        expect(terminalIds.has(b), `Unknown terminal: ${b}`).toBe(true);
      }
    }
  });

  it('wires drawn across all learn steps equal Netlist A exactly', () => {
    const stepWires: WireEndpointPair[] = getAllLearnSteps(ex3_1).flatMap(
      (s) => s.connectTerminals ?? [],
    );
    const res = validateWiring(ex3_1, stepWires);
    expect(res.correct).toBe(true);
    expect(res.matchedNetlistIndex).toBe(0);

    const stepNets = buildNets(ex3_1.components, stepWires).nets;
    const netANets = buildNets(
      ex3_1.components,
      netlistToWirePairs(NET_A),
    ).nets;
    expect(stepNets).toEqual(netANets);
  });

  it('step 12 condition requires supply ON and V1 within 230 +/- 3 V', () => {
    const steps = getAllLearnSteps(ex3_1);
    const step12 = steps[11];
    const stepWires = steps.flatMap((s) => s.connectTerminals ?? []);

    const offControls: TransformerLoadControls = {
      supplyOn: false,
      variacV: 230,
      wmVRange: 300,
      wmIRange: 10,
      lamps: 0,
    };
    const offOut = evaluateExperimentPhysics(ex3_1, stepWires, offControls).output;
    expect(
      evaluateLearnStepCondition(step12, offControls, offOut, false).met,
    ).toBe(false);

    const lowControls: TransformerLoadControls = {
      ...offControls,
      supplyOn: true,
      variacV: 200,
    };
    const lowOut = evaluateExperimentPhysics(ex3_1, stepWires, lowControls).output;
    expect(
      evaluateLearnStepCondition(step12, lowControls, lowOut, false).met,
    ).toBe(false);

    const okControls: TransformerLoadControls = {
      ...offControls,
      supplyOn: true,
      variacV: 230,
    };
    const okOut = evaluateExperimentPhysics(ex3_1, stepWires, okControls).output;
    expect(
      evaluateLearnStepCondition(step12, okControls, okOut, false).met,
    ).toBe(true);
  });

  it('step 13 condition requires supply ON, 0 lamps, V1 within 230 +/- 3 V, and Got it ack', () => {
    const steps = getAllLearnSteps(ex3_1);
    const step13 = steps[12];
    const stepWires = steps.flatMap((s) => s.connectTerminals ?? []);
    const controls: TransformerLoadControls = {
      supplyOn: true,
      variacV: 230,
      wmVRange: 300,
      wmIRange: 10,
      lamps: 0,
    };
    const out = evaluateExperimentPhysics(ex3_1, stepWires, controls).output;

    const beforeAck = evaluateLearnStepCondition(step13, controls, out, false);
    expect(beforeAck.canAcknowledge).toBe(true);
    expect(beforeAck.met).toBe(false);

    const afterAck = evaluateLearnStepCondition(step13, controls, out, true);
    expect(afterAck.met).toBe(true);

    const withLoad: TransformerLoadControls = { ...controls, lamps: 1 };
    const loadOut = evaluateExperimentPhysics(ex3_1, stepWires, withLoad).output;
    expect(
      evaluateLearnStepCondition(step13, withLoad, loadOut, true).met,
    ).toBe(false);
  });

  it('step 14 condition requires >= 5 lamps ON and V1 re-adjusted to 230 +/- 3 V', () => {
    const steps = getAllLearnSteps(ex3_1);
    const step14 = steps[13];
    const stepWires = steps.flatMap((s) => s.connectTerminals ?? []);

    const fewLamps: TransformerLoadControls = {
      supplyOn: true,
      variacV: 231,
      wmVRange: 300,
      wmIRange: 10,
      lamps: 4,
    };
    const fewOut = evaluateExperimentPhysics(ex3_1, stepWires, fewLamps).output;
    expect(
      evaluateLearnStepCondition(step14, fewLamps, fewOut, false).met,
    ).toBe(false);

    const tenLamps: TransformerLoadControls = {
      supplyOn: true,
      variacV: 233,
      wmVRange: 300,
      wmIRange: 10,
      lamps: 10,
    };
    const tenOut = evaluateExperimentPhysics(ex3_1, stepWires, tenLamps).output;
    expect(
      evaluateLearnStepCondition(step14, tenLamps, tenOut, false).met,
    ).toBe(true);
  });

  it('findVariacForTargetV1 finds knob value producing V1 = 230 +/- 1 V across lamp counts', () => {
    const stepWires = getAllLearnSteps(ex3_1).flatMap(
      (s) => s.connectTerminals ?? [],
    );
    for (const lamps of [0, 5, 10, 12]) {
      const knob = findVariacForTargetV1(ex3_1, stepWires, 230, lamps);
      const out = evaluateExperimentPhysics(ex3_1, stepWires, {
        supplyOn: true,
        variacV: knob,
        wmVRange: 300,
        wmIRange: 10,
        lamps,
      }).output;
      const vp = findMeterReading(out, 'vp')?.shownValue ?? 0;
      expect(Math.abs(vp - 230)).toBeLessThanOrEqual(1);
    }
  });
});

const ZERO_GAINS: MeterGains = { vp: 0, vs: 0, am: 0, wm: 0 };

describe('Learn mode observations & practice check across experiments', () => {
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

  it('captures observation rows and checks report answers in Exp 3.1 Learn mode without marking runCompleted', () => {
    enterLabMode('ex3.1', 'learn');
    expect(useSessionStore.getState().mode).toBe('learn');

    const wires = netlistToWirePairs(NET_A);
    useWiringStore.getState().setSolutionWires(wires);

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

    expect(useSessionStore.getState().observationRows).toHaveLength(6);

    const stage = getStage(ex3_1, 0);
    const truth = computeRunTruth(extractTransformerParams(stage.physicsParams));
    useSessionStore
      .getState()
      .setRunRegulationInput(truth.regulationPct.toFixed(2));
    useSessionStore
      .getState()
      .setRunMaxEffLoadInput(truth.maxEffLoadPct.toFixed(1));

    const result = useSessionStore.getState().submitRunAnswers();
    expect(result.passed, result.failedCriteria.join('; ')).toBe(true);
    const session = useSessionStore.getState();
    expect(session.runCompleted['ex3.1']).not.toBe(true);
    expect(session.runPractised['ex3.1']).not.toBe(true);
    expect(session.completedExperiments).not.toContain('ex3.1');
  });

  it('captures per-stage observation rows and checks report answers in Exp 3.2 Learn mode without marking runCompleted', () => {
    enterLabMode('ex3.2', 'learn');
    expect(useSessionStore.getState().mode).toBe('learn');

    const s0 = getStage(ex3_2, 0);
    const s1 = getStage(ex3_2, 1);

    const ocPairs = wiresFromNetlist(
      OC_NET_A,
      collectInternalLinks(getStageComponents(ex3_2, s0)),
    );
    useWiringStore.getState().setSolutionWires(ocPairs);
    const knobOc = findVariacForTargetV1(
      ex3_2,
      ocPairs,
      115,
      0,
      ZERO_GAINS,
      { stageIndex: 0, meterId: 'vm' },
    );
    useControlsStore.getState().setControlValue('sup.switch', true);
    useControlsStore.getState().setControlValue('va.knob', knobOc);
    const ocEval = evaluateExperimentPhysics(
      ex3_2,
      ocPairs,
      useControlsStore.getState().values,
      ZERO_GAINS,
      { stageIndex: 0 },
    );
    useSessionStore
      .getState()
      .addObservationRow(
        ocEval.output,
        useControlsStore.getState().values,
        ocEval.connectionState.energised,
      );

    // Switch to Stage 2 in Learn mode and capture SC observations
    useSessionStore.getState().setCurrentStageIndex(1);
    const scPairs = wiresFromNetlist(
      SC_NET_A,
      collectInternalLinks(getStageComponents(ex3_2, s1)),
    );
    useWiringStore.getState().setSolutionWires(scPairs);
    for (const frac of [0.25, 0.5, 0.75, 1.0]) {
      const knobSc = findVariacForTargetV1(
        ex3_2,
        scPairs,
        8.7 * frac,
        0,
        ZERO_GAINS,
        { stageIndex: 1, meterId: 'am' },
      );
      useControlsStore.getState().setControlValue('sup.switch', true);
      useControlsStore.getState().setControlValue('va.knob', knobSc);
      const scEval = evaluateExperimentPhysics(
        ex3_2,
        scPairs,
        useControlsStore.getState().values,
        ZERO_GAINS,
        { stageIndex: 1 },
      );
      useSessionStore
        .getState()
        .addObservationRow(
          scEval.output,
          useControlsStore.getState().values,
          scEval.connectionState.energised,
        );
    }

    const sessionBeforeCheck = useSessionStore.getState();
    expect(sessionBeforeCheck.observationRowsByStage[s0.id]).toHaveLength(1);
    expect(sessionBeforeCheck.observationRowsByStage[s1.id]).toHaveLength(4);

    const truth = computeOcScMethodTruth(s0.physicsParams);
    sessionBeforeCheck.setRunAnswerInput('rc_lv', truth.rc_lv.toFixed(1));
    sessionBeforeCheck.setRunAnswerInput('xm_lv', truth.xm_lv.toFixed(1));
    sessionBeforeCheck.setRunAnswerInput('R_hv', truth.R_hv.toFixed(3));
    sessionBeforeCheck.setRunAnswerInput('X_hv', truth.X_hv.toFixed(3));
    sessionBeforeCheck.setRunAnswerInput('Pc', truth.Pc.toFixed(1));
    sessionBeforeCheck.setRunAnswerInput('VR_lag', truth.VR_lag08.toFixed(2));
    sessionBeforeCheck.setRunAnswerInput('VR_lead', truth.VR_lead08.toFixed(2));
    sessionBeforeCheck.setRunAnswerInput('xMaxEff', truth.xMaxEff.toFixed(2));

    const result = useSessionStore.getState().submitRunAnswers();
    expect(result.passed, result.failedCriteria.join('; ')).toBe(true);
    const session = useSessionStore.getState();
    expect(session.runCompleted['ex3.2']).not.toBe(true);
    expect(session.runPractised['ex3.2']).not.toBe(true);
    expect(session.completedExperiments).not.toContain('ex3.2');
  });

  it('Exp 3.2 step 7 (oc-step-7) sets variac near 115 V (within 115 +/- 2 V) and treats damaged probes as overrange', () => {
    const steps = getAllLearnSteps(ex3_2);
    const step7 = steps[6];
    expect(step7.id).toBe('oc-step-7');
    const cond = step7.completionCondition!;

    const ocWires = steps
      .slice(0, 7)
      .filter((s) => s.stageId === step7.stageId)
      .flatMap((s) => s.connectTerminals ?? []);

    const targetKnob = findVariacForTargetV1(
      ex3_2,
      ocWires,
      cond.targetV,
      0,
      ZERO_GAINS,
      {
        stageIndex: 0,
        knobControlId: 'controlId' in cond ? cond.controlId : 'va.knob',
        meterId: cond.meterId,
      },
    );
    expect(targetKnob).toBeGreaterThanOrEqual(113);
    expect(targetKnob).toBeLessThanOrEqual(117);

    const out = evaluateExperimentPhysics(
      ex3_2,
      ocWires,
      {
        'sup.switch': true,
        'va.knob': targetKnob,
        'wm.vRange': 150,
        'wm.iRange': 1,
      },
      ZERO_GAINS,
      { stageIndex: 0 },
    ).output;
    const status = evaluateLearnStepCondition(
      step7,
      { 'sup.switch': true, 'va.knob': targetKnob },
      out,
      false,
    );
    expect(status.met).toBe(true);
    const vmVal = findMeterReading(out, 'vm')?.shownValue ?? 0;
    expect(Math.abs(vmVal - 115)).toBeLessThanOrEqual(2);
  });
});
