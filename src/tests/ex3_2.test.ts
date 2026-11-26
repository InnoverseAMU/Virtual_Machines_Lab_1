import { beforeEach, describe, expect, it } from 'vitest';
import { findVariacForTargetV1 } from '../core/circuit/learn';
import { collectInternalLinks, wiresFromNetlist } from '../core/circuit/nets';
import {
  getAllLearnSteps,
  getStage,
  getStageComponents,
} from '../core/circuit/stages';
import { validateWiring } from '../core/circuit/validate';
import { ex3_2, OC_NET_A, OC_NET_B, SC_NET_A } from '../core/experiments/ex3_2';
import { netlistToWirePairs } from '../core/experiments/registry';
import {
  evaluateExperimentPhysics,
  findMeterReading,
} from '../core/physics/evaluate';
import { computeOcScMethodTruth } from '../core/physics/models/transformerOcSc';
import { checkRunAnswers } from '../core/physics/report';
import type { WireEndpointPair } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { enterLabMode } from '../stores/modeActions';
import { OBSERVE_FIXED_SEED, useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';
import { referenceRun } from './helpers/referenceRun';

const OC_WIRES_A = netlistToWirePairs(OC_NET_A);
const OC_WIRES_B = netlistToWirePairs(OC_NET_B);
const SC_WIRES = netlistToWirePairs(SC_NET_A);

describe('Exp 3.2: Open-Circuit and Short-Circuit Tests', () => {
  describe('Stage 1 (OC) & Stage 2 (SC) validation and faults', () => {
    it('passes OC Netlist A, OC Netlist B, and SC Netlist regardless of wire order', () => {
      const rOcA = validateWiring(ex3_2, OC_WIRES_A, 0);
      expect(rOcA.correct).toBe(true);
      expect(rOcA.matchedNetlistIndex).toBe(0);

      const rOcB = validateWiring(ex3_2, [...OC_WIRES_B].reverse(), 0);
      expect(rOcB.correct).toBe(true);
      expect(rOcB.matchedNetlistIndex).toBe(1);

      const rSc = validateWiring(ex3_2, [...SC_WIRES].reverse(), 1);
      expect(rSc.correct).toBe(true);
      expect(rSc.matchedNetlistIndex).toBe(0);
    });

    it('detects every Stage 1 (OC) fault pattern', () => {
      // hv-winding-not-open
      const rHvWire = validateWiring(ex3_2, [...OC_WIRES_A, ['tx.P1', 'sup.N']], 0);
      expect(rHvWire.correct).toBe(false);
      expect(rHvWire.faults.find((f) => f.id === 'hv-winding-not-open')?.effect).toBe('danger');

      // wrong-side-for-oc
      const rWrongSide = validateWiring(
        ex3_2,
        [
          ...OC_WIRES_A.filter(([a, b]) => a !== 'tx.S1' && b !== 'tx.S1'),
          ['am.OUT', 'tx.P1'],
        ],
        0,
      );
      expect(rWrongSide.faults.some((f) => f.id === 'wrong-side-for-oc')).toBe(true);

      // wattmeter faults (CC reversed, PC open, PC reversed)
      const ocCcRev = OC_WIRES_A.map(([a, b]): WireEndpointPair => [
        a === 'wm.M' ? 'wm.L' : a === 'wm.L' ? 'wm.M' : a,
        b === 'wm.M' ? 'wm.L' : b === 'wm.L' ? 'wm.M' : b,
      ]);
      expect(
        validateWiring(ex3_2, ocCcRev, 0).faults.some((f) => f.id === 'wm-cc-reversed'),
      ).toBe(true);

      const ocPcOpen = OC_WIRES_A.filter(([a, b]) => a !== 'wm.V2' && b !== 'wm.V2');
      expect(
        validateWiring(ex3_2, ocPcOpen, 0).faults.some((f) => f.id === 'wm-pc-open'),
      ).toBe(true);

      const ocPcRev = OC_WIRES_A.map(([a, b]): WireEndpointPair => [
        a === 'wm.V1' ? 'wm.V2' : a === 'wm.V2' ? 'wm.V1' : a,
        b === 'wm.V1' ? 'wm.V2' : b === 'wm.V2' ? 'wm.V1' : b,
      ]);
      expect(
        validateWiring(ex3_2, ocPcRev, 0).faults.some((f) => f.id === 'wm-pc-reversed'),
      ).toBe(true);

      // ammeter-across-source
      const amAcross: WireEndpointPair[] = [
        ...OC_WIRES_A.filter(
          ([a, b]) => a !== 'am.IN' && b !== 'am.IN' && a !== 'am.OUT' && b !== 'am.OUT',
        ),
        ['va.OUT_P', 'am.IN'],
        ['sup.N', 'am.OUT'],
      ];
      expect(
        validateWiring(ex3_2, amAcross, 0).faults.find((f) => f.id === 'ammeter-across-source')?.effect,
      ).toBe('short');

      // live-neutral-short
      expect(
        validateWiring(ex3_2, [...OC_WIRES_A, ['va.OUT_P', 'sup.N']], 0).faults.some(
          (f) => f.id === 'live-neutral-short',
        ),
      ).toBe(true);

      // voltmeter-in-series
      const vmSeries: WireEndpointPair[] = [
        ...OC_WIRES_A.filter(
          ([a, b]) =>
            a !== 'vm.A' &&
            b !== 'vm.A' &&
            a !== 'vm.B' &&
            b !== 'vm.B' &&
            !(a === 'va.OUT_P' && b === 'wm.M'),
        ),
        ['va.OUT_P', 'vm.A'],
        ['vm.B', 'wm.M'],
      ];
      expect(
        validateWiring(ex3_2, vmSeries, 0).faults.some((f) => f.id === 'voltmeter-in-series'),
      ).toBe(true);
    });

    it('detects every Stage 2 (SC) fault pattern including pc-on-m-side and lv-not-shorted', () => {
      // pc-on-m-side (V1 in N4 instead of N5)
      const pcOnM: WireEndpointPair[] = [
        ...SC_WIRES.filter(([a, b]) => a !== 'wm.V1' && b !== 'wm.V1'),
        ['wm.V1', 'wm.M'],
      ];
      const rPcM = validateWiring(ex3_2, pcOnM, 1);
      expect(rPcM.correct).toBe(false);
      expect(rPcM.faults.some((f) => f.id === 'pc-on-m-side')).toBe(true);

      // lv-not-shorted
      const noShort = SC_WIRES.filter(([a, b]) => !(a === 'tx.S1' && b === 'tx.S2'));
      expect(
        validateWiring(ex3_2, noShort, 1).faults.some((f) => f.id === 'lv-not-shorted'),
      ).toBe(true);

      // ammeter-across-source & live-neutral-short & wattmeter faults
      const scAmShort: WireEndpointPair[] = [
        ...SC_WIRES.filter(
          ([a, b]) => a !== 'am.IN' && b !== 'am.IN' && a !== 'am.OUT' && b !== 'am.OUT',
        ),
        ['va.OUT_P', 'am.IN'],
        ['sup.N', 'am.OUT'],
      ];
      expect(
        validateWiring(ex3_2, scAmShort, 1).faults.some((f) => f.id === 'ammeter-across-source'),
      ).toBe(true);

      expect(
        validateWiring(ex3_2, [...SC_WIRES, ['wm.L', 'sup.N']], 1).faults.some(
          (f) => f.id === 'live-neutral-short',
        ),
      ).toBe(true);

      const scCcRev = SC_WIRES.map(([a, b]): WireEndpointPair => [
        a === 'wm.M' ? 'wm.L' : a === 'wm.L' ? 'wm.M' : a,
        b === 'wm.M' ? 'wm.L' : b === 'wm.L' ? 'wm.M' : b,
      ]);
      expect(
        validateWiring(ex3_2, scCcRev, 1).faults.some((f) => f.id === 'wm-cc-reversed'),
      ).toBe(true);
    });
  });

  describe('Physics reference values and protection limits', () => {
    it('Stage 1 (OC) at 115 V reads Io ~ 0.70 A, Po ~ 20.0 W, dial ~ 100 div, and pegs on 0.5 A range', () => {
      const zeroGains = { vm: 0, am: 0, wm: 0 };
      const out115 = evaluateExperimentPhysics(
        ex3_2,
        OC_WIRES_A,
        {
          'sup.switch': true,
          'va.knob': 115,
          'wm.vRange': 150,
          'wm.iRange': 1,
        },
        zeroGains,
        { stageIndex: 0, noSag: true },
      ).output;

      expect(out115.outputs.Vo).toBeCloseTo(115, 4);
      expect(out115.outputs.Io).toBeCloseTo(0.7, 2);
      expect(out115.outputs.Po).toBeCloseTo(20.04, 1);

      const wm = findMeterReading(out115, 'wm')!;
      expect(wm.mf).toBeCloseTo(0.2, 6);
      expect(wm.dial).toBeCloseTo(100.2, 0);

      // 0.5 A range at 0.70 A is 140%: overrange (pegged) with warning, not damaged
      const outLowRange = evaluateExperimentPhysics(
        ex3_2,
        OC_WIRES_A,
        {
          'sup.switch': true,
          'va.knob': 115,
          'wm.vRange': 150,
          'wm.iRange': 0.5,
        },
        zeroGains,
        { stageIndex: 0, noSag: true },
      ).output;
      const wmLow = findMeterReading(outLowRange, 'wm')!;
      expect(wmLow.overrange).toBe(true);
      expect(wmLow.damaged).toBe(false);
      expect(wmLow.pointerRatio).toBe(1.05);
      expect(outLowRange.events.some((e) => e.id === 'wm-overrange')).toBe(true);
    });

    it('Stage 2 (SC) at 8.70 A reads Vsc ~ 9.26 V, Psc ~ 45.4 W, dial ~ 9 div, and trips > 125% Isc', () => {
      const zeroGains = { vm: 0, am: 0, wm: 0 };
      const knob87 = findVariacForTargetV1(ex3_2, SC_WIRES, 8.7, 0, zeroGains, {
        stageIndex: 1,
        meterId: 'am',
      });
      const outSc = evaluateExperimentPhysics(
        ex3_2,
        SC_WIRES,
        {
          'sup.switch': true,
          'va.knob': knob87,
          'wm.vRange': 75,
          'wm.iRange': 10,
        },
        zeroGains,
        { stageIndex: 1 },
      ).output;

      expect(outSc.outputs.Isc).toBeCloseTo(8.7, 0);
      expect(outSc.outputs.Vsc).toBeCloseTo(9.27, 0);
      expect(outSc.outputs.Psc).toBeCloseTo(45.4, 0);
      const wm = findMeterReading(outSc, 'wm')!;
      expect(wm.mf).toBe(5);
      expect(wm.dial).toBeCloseTo(9.1, 0);

      // Missing LV short gives tiny open-circuit current
      const noShort = SC_WIRES.filter(([a, b]) => !(a === 'tx.S1' && b === 'tx.S2'));
      const outNoShort = evaluateExperimentPhysics(
        ex3_2,
        noShort,
        { 'sup.switch': true, 'va.knob': 9.3, 'wm.vRange': 75, 'wm.iRange': 10 },
        zeroGains,
        { stageIndex: 1 },
      ).output;
      expect(outNoShort.outputs.Isc).toBeLessThan(0.05);

      // Overcurrent > 125% of 8.70 A (10.875 A -> ~11.6 V) trips supply
      const outTrip = evaluateExperimentPhysics(
        ex3_2,
        SC_WIRES,
        { 'sup.switch': true, 'va.knob': 12.0, 'wm.vRange': 75, 'wm.iRange': 10 },
        zeroGains,
        { stageIndex: 1 },
      ).output;
      expect(outTrip.mcbTripped).toBe(true);
      expect(outTrip.runFailed).toBe(true);
    });
  });

  describe('Answers, chart curve, and referenceRun fairness', () => {
    it('computes method truth matching manual equations and prompt targets', () => {
      const truth = computeOcScMethodTruth(ex3_2.stages[0].physicsParams);
      expect(truth.rc_lv).toBeCloseTo(660.0, 0);
      expect(truth.xm_lv).toBeCloseTo(169.6, 0);
      expect(truth.R_hv).toBeCloseTo(0.6, 2);
      expect(truth.X_hv).toBeCloseTo(0.88, 2);
      expect(truth.Pc).toBeCloseTo(45.45, 1);
      expect(truth.VR_lag08).toBeCloseTo(3.81, 1);
      expect(truth.VR_lead08).toBeCloseTo(-0.18, 1);
      expect(truth.xMaxEff).toBeCloseTo(0.664, 2);
    });

    it('passes referenceRun across 5+ seeded gain sets and extreme +/-0.5% gain combinations', () => {
      const seeds = [7, 42, 108, 777, 2026, 9001];
      for (const seed of seeds) {
        const run = referenceRun(ex3_2, seed);
        expect(
          run.passed,
          `Seed ${seed} failed: ${run.result.failedCriteria.join('; ')}`,
        ).toBe(true);
      }

      const extremes = [
        { vm: 0.005, am: 0.005, wm: 0.005 },
        { vm: -0.005, am: -0.005, wm: -0.005 },
        { vm: 0.005, am: -0.005, wm: 0.005 },
        { vm: -0.005, am: 0.005, wm: -0.005 },
      ];
      for (const gains of extremes) {
        const run = referenceRun(ex3_2, 123, gains);
        expect(
          run.passed,
          `Extreme ${JSON.stringify(gains)} failed: ${run.result.failedCriteria.join('; ')}`,
        ).toBe(true);
      }
    });

    it('rejects bad answers without leaking truth and plots efficiency vs x from 0.1 to 1.0', () => {
      const run = referenceRun(ex3_2, 1, { vm: 0, am: 0, wm: 0 });
      const bad = checkRunAnswers(ex3_2, run.rowsByStage, {
        rc_lv: 100,
        xm_lv: 50,
        R_hv: 2.0,
        X_hv: 2.0,
        Pc: 100,
        VR_lag: 8.0,
        VR_lead: 5.0,
        xMaxEff: 0.2,
      });
      expect(bad.passed).toBe(false);
      expect(bad.failedAnswers).toHaveLength(8);
      const joined = [...bad.failedCriteria, ...bad.hints].join(' ');
      expect(joined).not.toContain('660.0');
      expect(joined).not.toContain('3.81');

      const chart = ex3_2.charts![0];
      const series = chart.computeSeries!(
        { piInput: 20.04, pcInput: 45.45 },
        ex3_2.stages[0].physicsParams,
      );
      expect(series[0]).toHaveLength(10);
      expect(series[0][0].x).toBe(0.1);
      expect(series[0][9].x).toBe(1.0);
      const maxPt = series[0].reduce((best, pt) => (pt.y > best.y ? pt : best));
      expect(maxPt.x).toBeCloseTo(0.7, 1);
    });
  });

  describe('Learn mode, Observe mode, and Self mode multi-stage progression', () => {
    beforeEach(() => {
      useWiringStore.getState().clearAllWiresScripted();
      useSessionStore.setState({
        completedExperiments: [],
        completedStages: {},
        runCompleted: {},
        runPractised: {},
      });
      useSessionStore.getState().resetLabSession();
    });

    it('learn steps span both stages and produce canonical OC and SC netlists', () => {
      const steps = getAllLearnSteps(ex3_2);
      expect(steps.length).toBeGreaterThanOrEqual(14);
      expect(steps.some((s) => s.stageId === 'oc-test')).toBe(true);
      expect(steps.some((s) => s.stageId === 'sc-test')).toBe(true);

      const ocStepWires = steps
        .filter((s) => s.stageId === 'oc-test')
        .flatMap((s) => s.connectTerminals ?? []);
      expect(validateWiring(ex3_2, ocStepWires, 0).correct).toBe(true);

      const scStepWires = steps
        .filter((s) => s.stageId === 'sc-test')
        .flatMap((s) => s.connectTerminals ?? []);
      expect(validateWiring(ex3_2, scStepWires, 1).correct).toBe(true);
    });

    it('Observe mode loads locked pre-wired connections for both Stage 1 and Stage 2', () => {
      enterLabMode('ex3.2', 'observe');
      expect(useSessionStore.getState().sessionSeed).toBe(OBSERVE_FIXED_SEED);
      const stage0Wires = useWiringStore.getState().wires;
      expect(validateWiring(ex3_2, stage0Wires, 0).correct).toBe(true);

      useSessionStore.getState().switchObserveStage(1);
      expect(useSessionStore.getState().currentStageIndex).toBe(1);
      const stage1Wires = useWiringStore.getState().wires;
      expect(validateWiring(ex3_2, stage1Wires, 1).correct).toBe(true);
    });

    it('Self mode requires both stages wired and report passed before marking completedExperiments and runCompleted', () => {
      enterLabMode('ex3.2', 'self');
      const s0 = getStage(ex3_2, 0);
      const s1 = getStage(ex3_2, 1);

      const ocPairs = wiresFromNetlist(
        s0.acceptedNetlists[0],
        collectInternalLinks(getStageComponents(ex3_2, s0)),
      );
      useWiringStore.getState().setSolutionWires(ocPairs);
      expect(useSessionStore.getState().submitWiring(useWiringStore.getState().wires).correct).toBe(true);
      expect(useSessionStore.getState().completedExperiments).not.toContain('ex3.2');

      // Record Stage 1 row at 115 V
      const knobOc = findVariacForTargetV1(ex3_2, useWiringStore.getState().wires, 115, 0, undefined, {
        stageIndex: 0,
        meterId: 'vm',
      });
      useControlsStore.getState().setControlValue('sup.switch', true);
      useControlsStore.getState().setControlValue('va.knob', knobOc);
      const ocEval = evaluateExperimentPhysics(
        ex3_2,
        useWiringStore.getState().wires,
        useControlsStore.getState().values,
        useControlsStore.getState().gains,
        { stageIndex: 0 },
      );
      useSessionStore
        .getState()
        .addObservationRow(ocEval.output, useControlsStore.getState().values, ocEval.connectionState.energised);

      // Advance to Stage 2
      useSessionStore.getState().continueToNextStage();
      expect(useSessionStore.getState().currentStageIndex).toBe(1);

      const scPairs = wiresFromNetlist(
        s1.acceptedNetlists[0],
        collectInternalLinks(getStageComponents(ex3_2, s1)),
      );
      useWiringStore.getState().setSolutionWires(scPairs);
      expect(useSessionStore.getState().submitWiring(useWiringStore.getState().wires).correct).toBe(true);
      expect(useSessionStore.getState().completedExperiments).toContain('ex3.2');

      // Record Stage 2 rows at 25%, 50%, 75%, 100% of 8.70 A
      for (const frac of [0.25, 0.5, 0.75, 1.0]) {
        const knobSc = findVariacForTargetV1(
          ex3_2,
          useWiringStore.getState().wires,
          8.7 * frac,
          0,
          useControlsStore.getState().gains,
          { stageIndex: 1, meterId: 'am' },
        );
        useControlsStore.getState().setControlValue('sup.switch', true);
        useControlsStore.getState().setControlValue('va.knob', knobSc);
        const scEval = evaluateExperimentPhysics(
          ex3_2,
          useWiringStore.getState().wires,
          useControlsStore.getState().values,
          useControlsStore.getState().gains,
          { stageIndex: 1 },
        );
        useSessionStore
          .getState()
          .addObservationRow(scEval.output, useControlsStore.getState().values, scEval.connectionState.energised);
      }

      const truth = computeOcScMethodTruth(s0.physicsParams);
      const session = useSessionStore.getState();
      session.setRunAnswerInput('rc_lv', truth.rc_lv.toFixed(1));
      session.setRunAnswerInput('xm_lv', truth.xm_lv.toFixed(1));
      session.setRunAnswerInput('R_hv', truth.R_hv.toFixed(3));
      session.setRunAnswerInput('X_hv', truth.X_hv.toFixed(3));
      session.setRunAnswerInput('Pc', truth.Pc.toFixed(1));
      session.setRunAnswerInput('VR_lag', truth.VR_lag08.toFixed(2));
      session.setRunAnswerInput('VR_lead', truth.VR_lead08.toFixed(2));
      session.setRunAnswerInput('xMaxEff', truth.xMaxEff.toFixed(2));

      const reportRes = useSessionStore.getState().submitRunAnswers();
      expect(reportRes.passed, reportRes.failedCriteria.join('; ')).toBe(true);
      expect(useSessionStore.getState().runCompleted['ex3.2']).toBe(true);
    });

    it('supports directly toggling between OC and SC stages in Self and Learn modes', () => {
      // Self mode toggle preserves per-stage wires and observation rows
      enterLabMode('ex3.2', 'self');
      const s0 = getStage(ex3_2, 0);
      const s1 = getStage(ex3_2, 1);

      const ocPairs = wiresFromNetlist(
        s0.acceptedNetlists[0],
        collectInternalLinks(getStageComponents(ex3_2, s0)),
      );
      useWiringStore.getState().setSolutionWires(ocPairs);
      expect(useWiringStore.getState().wires).toHaveLength(ocPairs.length);

      useSessionStore.getState().switchSelfStage(1);
      expect(useSessionStore.getState().currentStageIndex).toBe(1);
      expect(useWiringStore.getState().wires).toHaveLength(0);

      const scPairs = wiresFromNetlist(
        s1.acceptedNetlists[0],
        collectInternalLinks(getStageComponents(ex3_2, s1)),
      );
      useWiringStore.getState().setSolutionWires(scPairs);

      // Toggle back to Open-Circuit stage and confirm OC wires are restored
      useSessionStore.getState().switchSelfStage(0);
      expect(useSessionStore.getState().currentStageIndex).toBe(0);
      expect(useWiringStore.getState().wires).toHaveLength(ocPairs.length);

      // Toggle forward to Short-Circuit stage again and confirm SC wires are restored
      useSessionStore.getState().switchSelfStage(1);
      expect(useSessionStore.getState().currentStageIndex).toBe(1);
      expect(useWiringStore.getState().wires).toHaveLength(scPairs.length);

      // Learn mode toggle jumps to target stage's first step cleanly
      enterLabMode('ex3.2', 'learn');
      useSessionStore.getState().switchLearnStage(1);
      expect(useSessionStore.getState().currentStageIndex).toBe(1);
      const steps = getAllLearnSteps(ex3_2);
      const scStartIdx = steps.findIndex((st) => st.stageId === s1.id);
      expect(useSessionStore.getState().learnStepIndex).toBe(scStartIdx);

      useSessionStore.getState().switchLearnStage(0);
      expect(useSessionStore.getState().currentStageIndex).toBe(0);
      expect(useSessionStore.getState().learnStepIndex).toBe(0);
    });
  });
});
