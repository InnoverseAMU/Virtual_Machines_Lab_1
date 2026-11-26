import { beforeEach, describe, expect, it } from 'vitest';
import { findVariacForTargetV1 } from '../core/circuit/learn';
import { collectInternalLinks, wiresFromNetlist } from '../core/circuit/nets';
import {
  applyStageCarryOver,
  getAllLearnSteps,
  getStage,
  getStageComponents,
} from '../core/circuit/stages';
import { validateWiring } from '../core/circuit/validate';
import {
  ex3_4,
  LOAD_NET_A,
  LOAD_NET_B,
  LOAD_NET_C,
  LOAD_NET_D,
  POL_NET_A,
  POL_NET_B,
  POL_NET_C,
  POL_NET_D,
} from '../core/experiments/ex3_4';
import { netlistToWirePairs } from '../core/experiments/registry';
import {
  evaluateExperimentPhysics,
  findMeterReading,
} from '../core/physics/evaluate';
import {
  computeParallelMethodTruth,
  extractParallelParams,
  solveParallelNodal,
} from '../core/physics/models/transformerParallel';
import { checkRunAnswers } from '../core/physics/report';
import type { Wire, WireEndpointPair } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { enterLabMode } from '../stores/modeActions';
import { OBSERVE_FIXED_SEED, useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';
import { referenceRun } from './helpers/referenceRun';

const POL_WIRES_A = netlistToWirePairs(POL_NET_A);
const POL_WIRES_B = netlistToWirePairs(POL_NET_B);
const POL_WIRES_C = netlistToWirePairs(POL_NET_C);
const POL_WIRES_D = netlistToWirePairs(POL_NET_D);

const LOAD_WIRES_A = netlistToWirePairs(LOAD_NET_A);
const LOAD_WIRES_B = netlistToWirePairs(LOAD_NET_B);
const LOAD_WIRES_C = netlistToWirePairs(LOAD_NET_C);
const LOAD_WIRES_D = netlistToWirePairs(LOAD_NET_D);

describe('Exp 3.4: Parallel Operation of Single-Phase Transformers', () => {
  describe('Stage 1 (Polarity) & Stage 2 (Load Sharing) validation and faults', () => {
    it('passes all 4 Stage 1 and all 4 Stage 2 netlist variants regardless of wire order', () => {
      for (const [idx, wires] of [POL_WIRES_A, POL_WIRES_B, POL_WIRES_C, POL_WIRES_D].entries()) {
        const res = validateWiring(ex3_4, [...wires].reverse(), 0);
        expect(res.correct, `POL variant ${idx} failed`).toBe(true);
        expect(res.matchedNetlistIndex).toBe(idx);
      }

      for (const [idx, wires] of [LOAD_WIRES_A, LOAD_WIRES_B, LOAD_WIRES_C, LOAD_WIRES_D].entries()) {
        const res = validateWiring(ex3_4, [...wires].reverse(), 1);
        expect(res.correct, `LOAD variant ${idx} failed`).toBe(true);
        expect(res.matchedNetlistIndex).toBe(idx);
      }
    });

    it('detects the Stage 1 polarity trap (txA.S1 to txB.S1) and primary faults', () => {
      const trapWires: WireEndpointPair[] = [
        ...POL_WIRES_A.filter(
          ([a, b]) =>
            a !== 'txA.S1' &&
            b !== 'txA.S1' &&
            a !== 'txB.S1' &&
            b !== 'txB.S1' &&
            a !== 'txA.S2' &&
            b !== 'txA.S2' &&
            a !== 'txB.S2' &&
            b !== 'txB.S2',
        ),
        ['txA.S1', 'txB.S1'],
        ['txA.S2', 'vpol.A'],
        ['txB.S2', 'vpol.B'],
      ];
      const rTrap = validateWiring(ex3_4, trapWires, 0);
      expect(rTrap.correct).toBe(false);
      expect(rTrap.faults.some((f) => f.id === 'secondary-series-aiding')).toBe(true);
      expect(
        rTrap.faults.find((f) => f.id === 'secondary-series-aiding')?.description,
      ).toContain('230 V');

      expect(
        validateWiring(ex3_4, [...POL_WIRES_A, ['va.OUT_P', 'sup.N']], 0).faults.some(
          (f) => f.id === 'live-neutral-short',
        ),
      ).toBe(true);
    });

    it('detects every Stage 2 fault: wattmeter faults, ammeters across load/each other, bus short, and aiding polarity', () => {
      // wmA CC reversed & wmB PC open
      const wmACcRev = LOAD_WIRES_A.map(([a, b]): WireEndpointPair => [
        a === 'wmA.M' ? 'wmA.L' : a === 'wmA.L' ? 'wmA.M' : a,
        b === 'wmA.M' ? 'wmA.L' : b === 'wmA.L' ? 'wmA.M' : b,
      ]);
      expect(
        validateWiring(ex3_4, wmACcRev, 1).faults.some((f) => f.id === 'wmA-cc-reversed'),
      ).toBe(true);

      const wmBPcOpen = LOAD_WIRES_A.filter(([a, b]) => a !== 'wmB.V2' && b !== 'wmB.V2');
      expect(
        validateWiring(ex3_4, wmBPcOpen, 1).faults.some((f) => f.id === 'wmB-pc-open'),
      ).toBe(true);

      // amA across load
      const amAAcross: WireEndpointPair[] = [
        ...LOAD_WIRES_A.filter(
          ([a, b]) => a !== 'amA.IN' && b !== 'amA.IN' && a !== 'amA.OUT' && b !== 'amA.OUT',
        ),
        ['vL.A', 'amA.IN'],
        ['vL.B', 'amA.OUT'],
      ];
      expect(
        validateWiring(ex3_4, amAAcross, 1).faults.find((f) => f.id === 'amA-across-load')?.effect,
      ).toBe('short');

      // ammeters across each other
      const amEachOther: WireEndpointPair[] = [
        ...LOAD_WIRES_A,
        ['amA.IN', 'amB.IN'],
        ['amA.OUT', 'amB.OUT'],
      ];
      expect(
        validateWiring(ex3_4, amEachOther, 1).faults.find(
          (f) => f.id === 'ammeters-across-each-other',
        )?.effect,
      ).toBe('short');

      // secondary bus short
      expect(
        validateWiring(ex3_4, [...LOAD_WIRES_A, ['vL.A', 'vL.B']], 1).faults.some(
          (f) => f.id === 'secondary-bus-short',
        ),
      ).toBe(true);

      // aiding join in Stage 2
      expect(
        validateWiring(ex3_4, [...LOAD_WIRES_A, ['txA.S1', 'txB.S1']], 1).faults.find(
          (f) => f.id === 'secondary-series-aiding',
        )?.effect,
      ).toBe('short');
    });
  });

  describe('Complex nodal physics, circulating current, polarity trap, and load-before-polarity', () => {
    const zeroGains = {
      vp: 0,
      vpol: 0,
      amA: 0,
      wmA: 0,
      amB: 0,
      wmB: 0,
      amL: 0,
      vL: 0,
    };

    it('Stage 1 polarity trap reads ~230 V on vpol while opposition reads < 1 V', () => {
      const oppOut = evaluateExperimentPhysics(
        ex3_4,
        POL_WIRES_A,
        { 'sup.switch': true, 'va.knob': 230 },
        zeroGains,
        { stageIndex: 0, seed: 42, noSag: true },
      ).output;
      expect(oppOut.outputs.Vpol).toBeLessThan(0.5);

      const trapWires: WireEndpointPair[] = [
        ...POL_WIRES_A.filter(
          ([a, b]) =>
            a !== 'txA.S1' &&
            b !== 'txA.S1' &&
            a !== 'txB.S1' &&
            b !== 'txB.S1' &&
            a !== 'txA.S2' &&
            b !== 'txA.S2' &&
            a !== 'txB.S2' &&
            b !== 'txB.S2',
        ),
        ['txA.S1', 'txB.S1'],
        ['txA.S2', 'vpol.A'],
        ['txB.S2', 'vpol.B'],
      ];
      const trapOut = evaluateExperimentPhysics(
        ex3_4,
        trapWires,
        { 'sup.switch': true, 'va.knob': 230 },
        zeroGains,
        { stageIndex: 0, seed: 42, noSag: true },
      ).output;
      expect(trapOut.outputs.Vpol).toBeCloseTo(229.9, 0);
      expect(findMeterReading(trapOut, 'vpol')?.shownValue).toBeCloseTo(229.9, 0);
    });

    it('matches complex nodal solution within 1% at no-load (~0.31 A) and three loaded points (up to ~42 A)', () => {
      const p = extractParallelParams(ex3_4.stages[1].physicsParams);

      // Point 0: No-load circulating current
      const noLoad = evaluateExperimentPhysics(
        ex3_4,
        LOAD_WIRES_A,
        {
          'sup.switch': true,
          'va.knob': 230,
          'wmA.iRange': 20,
          'wmB.iRange': 40,
          'lamps.switch': false,
          'lamps.lamps': 0,
          'rheostat.switch': false,
          'rheostat.R': 100,
        },
        zeroGains,
        { stageIndex: 1, noSag: true },
      ).output;
      expect(noLoad.outputs.IL).toBeCloseTo(0, 3);
      expect(noLoad.outputs.IA).toBeCloseTo(0.31, 2);
      expect(noLoad.outputs.IB).toBeCloseTo(0.31, 2);

      // Three loaded points: 10 ohm rheostat, 5 ohm rheostat, 3 ohm rheostat + 3 lamps (~42.5 A)
      const cases: Array<{ lampsOn: boolean; lamps: number; rheoOn: boolean; R: number; GL: number }> = [
        { lampsOn: false, lamps: 0, rheoOn: true, R: 10, GL: 1 / 10 },
        { lampsOn: false, lamps: 0, rheoOn: true, R: 5, GL: 1 / 5 },
        { lampsOn: true, lamps: 3, rheoOn: true, R: 3, GL: 3 / 66.125 + 1 / 3 },
      ];

      for (const c of cases) {
        const expected = solveParallelNodal(230, c.GL, p);
        const sim = evaluateExperimentPhysics(
          ex3_4,
          LOAD_WIRES_A,
          {
            'sup.switch': true,
            'va.knob': 230,
            'wmA.iRange': 20,
            'wmB.iRange': 40,
            'lamps.switch': c.lampsOn,
            'lamps.lamps': c.lamps,
            'rheostat.switch': c.rheoOn,
            'rheostat.R': c.R,
          },
          zeroGains,
          { stageIndex: 1, noSag: true },
        ).output;

        expect(Math.abs(sim.outputs.IA - expected.IA) / expected.IA).toBeLessThan(0.01);
        expect(Math.abs(sim.outputs.IB - expected.IB) / expected.IB).toBeLessThan(0.01);
        expect(Math.abs(sim.outputs.IL - expected.IL) / expected.IL).toBeLessThan(0.01);
        expect(Math.abs(sim.outputs.VL - expected.VL) / expected.VL).toBeLessThan(0.01);
        expect(Math.abs(sim.outputs.WA - expected.WA) / expected.WA).toBeLessThan(0.01);
        expect(Math.abs(sim.outputs.WB - expected.WB) / expected.WB).toBeLessThan(0.01);
      }
    });

    it('trips MCB on swapped-polarity aiding parallel wiring and when load is switched on before polarity is fixed', () => {
      const swappedB: WireEndpointPair[] = LOAD_WIRES_A.map(([a, b]): WireEndpointPair => [
        a === 'txB.S2' ? 'txB.S1' : a === 'txB.S1' ? 'txB.S2' : a,
        b === 'txB.S2' ? 'txB.S1' : b === 'txB.S1' ? 'txB.S2' : b,
      ]);
      const evalRes = evaluateExperimentPhysics(
        ex3_4,
        swappedB,
        {
          'sup.switch': true,
          'va.knob': 230,
          'lamps.switch': true,
          'lamps.lamps': 4,
          'rheostat.switch': false,
          'rheostat.R': 100,
        },
        zeroGains,
        { stageIndex: 1, seed: 42 },
      );
      expect(evalRes.connectionState.loadBeforePolarity).toBe(true);
      expect(evalRes.output.mcbTripped).toBe(true);
      expect(evalRes.output.runFailed).toBe(true);
    });
  });

  describe('Answers, charts, and referenceRun fairness', () => {
    it('computes method truth matching prompt estimates (0.31 A, ~42 A, B, no)', () => {
      const truth = computeParallelMethodTruth(ex3_4.stages[1].physicsParams);
      expect(truth.circulatingCurrentA).toBeCloseTo(0.31, 2);
      expect(truth.firstRatedIL).toBeCloseTo(41.96, 1);
      expect(truth.firstTransformer).toBe('B');
      expect(truth.proportionalShare).toBe('no');
    });

    it('passes referenceRun across 6 seeded gain sets and extreme +/-0.5% gain combinations', () => {
      const seeds = [7, 42, 108, 777, 2026, 9001];
      for (const seed of seeds) {
        const run = referenceRun(ex3_4, seed);
        expect(
          run.passed,
          `Seed ${seed} failed: ${run.result.failedCriteria.join('; ')}`,
        ).toBe(true);
      }

      const extremes = [
        { vp: 0.005, vpol: 0.005, amA: 0.005, wmA: 0.005, amB: 0.005, wmB: 0.005, amL: 0.005, vL: 0.005 },
        { vp: -0.005, vpol: -0.005, amA: -0.005, wmA: -0.005, amB: -0.005, wmB: -0.005, amL: -0.005, vL: -0.005 },
        { vp: 0.005, vpol: -0.005, amA: 0.005, wmA: -0.005, amB: -0.005, wmB: 0.005, amL: -0.005, vL: 0.005 },
        { vp: -0.005, vpol: 0.005, amA: -0.005, wmA: 0.005, amB: 0.005, wmB: -0.005, amL: 0.005, vL: -0.005 },
      ];
      for (const gains of extremes) {
        const run = referenceRun(ex3_4, 123, gains);
        expect(
          run.passed,
          `Extreme ${JSON.stringify(gains)} failed: ${run.result.failedCriteria.join('; ')}`,
        ).toBe(true);
      }
    });

    it('rejects bad answers without leaking truth and defines both sharing charts with kVA comparison lines', () => {
      const run = referenceRun(ex3_4, 1, {
        vp: 0,
        vpol: 0,
        amA: 0,
        wmA: 0,
        amB: 0,
        wmB: 0,
        amL: 0,
        vL: 0,
      });
      const bad = checkRunAnswers(ex3_4, run.rowsByStage, {
        circulatingCurrentA: 5.0,
        firstRatedIL: 10.0,
        firstTransformer: 'A',
        proportionalShare: 'yes',
      });
      expect(bad.passed).toBe(false);
      expect(bad.failedAnswers).toHaveLength(4);
      const joined = [...bad.failedCriteria, ...bad.hints].join(' ');
      expect(joined).not.toContain('41.96');
      expect(joined).not.toContain('0.31');

      const charts = ex3_4.stages[1].charts!;
      expect(charts).toHaveLength(2);
      expect(charts[0].series.some((s) => s.yColumn === 'iaProp' && s.dashed)).toBe(true);
      expect(charts[1].series.some((s) => s.yColumn === 'wbProp' && s.dashed)).toBe(true);
    });
  });

  describe('Learn mode, Observe mode, and Self mode carryOver', () => {
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

    it('learn steps span ~14 steps including live ~230 V polarity trap and produce valid Stage 1 & Stage 2 wiring', () => {
      const steps = getAllLearnSteps(ex3_4);
      expect(steps.length).toBeGreaterThanOrEqual(14);
      expect(steps.some((s) => s.id === 'par-1-aiding-check')).toBe(true);

      let polPairs: WireEndpointPair[] = [];
      for (const st of steps.filter((s) => s.stageId === 'polarity-check')) {
        for (const [a, b] of st.disconnectTerminals ?? []) {
          polPairs = polPairs.filter(
            ([x, y]) => !((x === a && y === b) || (x === b && y === a)),
          );
        }
        for (const p of st.connectTerminals ?? []) {
          polPairs.push(p);
        }
      }
      expect(validateWiring(ex3_4, polPairs, 0).correct).toBe(true);

      const s1 = getStage(ex3_4, 1);
      const carried = applyStageCarryOver(
        polPairs.map(([a, b], i): Wire => ({ id: `w${i}`, a, b })),
        s1,
        getStageComponents(ex3_4, s1),
      );
      const loadPairs: WireEndpointPair[] = carried.map((w) => [w.a, w.b]);
      for (const st of steps.filter((s) => s.stageId === 'load-sharing')) {
        for (const p of st.connectTerminals ?? []) {
          loadPairs.push(p);
        }
      }
      expect(validateWiring(ex3_4, loadPairs, 1).correct).toBe(true);
    });

    it('carries over primary wires and opposition join (both canonical and mirror) while dropping vpol', () => {
      const s1 = getStage(ex3_4, 1);
      const s1Comps = getStageComponents(ex3_4, s1);

      const carriedFromA = applyStageCarryOver(
        POL_WIRES_A.map(([a, b], i): Wire => ({ id: `a${i}`, a, b })),
        s1,
        s1Comps,
      );
      expect(carriedFromA.some((w) => w.a.startsWith('vpol.') || w.b.startsWith('vpol.'))).toBe(false);
      expect(
        carriedFromA.some(
          (w) =>
            (w.a === 'txA.S1' && w.b === 'txB.S2') ||
            (w.a === 'txB.S2' && w.b === 'txA.S1'),
        ),
      ).toBe(true);

      const carriedFromC = applyStageCarryOver(
        POL_WIRES_C.map(([a, b], i): Wire => ({ id: `c${i}`, a, b })),
        s1,
        s1Comps,
      );
      expect(
        carriedFromC.some(
          (w) =>
            (w.a === 'txA.S2' && w.b === 'txB.S1') ||
            (w.a === 'txB.S1' && w.b === 'txA.S2'),
        ),
      ).toBe(true);
    });

    it('Observe mode loads locked pre-wired circuits across both stages', () => {
      enterLabMode('ex3.4', 'observe');
      expect(useSessionStore.getState().sessionSeed).toBe(OBSERVE_FIXED_SEED);
      expect(validateWiring(ex3_4, useWiringStore.getState().wires, 0).correct).toBe(true);

      useSessionStore.getState().switchObserveStage(1);
      expect(useSessionStore.getState().currentStageIndex).toBe(1);
      expect(validateWiring(ex3_4, useWiringStore.getState().wires, 1).correct).toBe(true);
    });

    it('Self mode completes Stage 1 -> carryOver -> Stage 2 -> Report answers', () => {
      enterLabMode('ex3.4', 'self');
      const s0 = getStage(ex3_4, 0);
      const s1 = getStage(ex3_4, 1);

      const polPairs = wiresFromNetlist(
        s0.acceptedNetlists[0],
        collectInternalLinks(getStageComponents(ex3_4, s0)),
      );
      useWiringStore.getState().setSolutionWires(polPairs);
      expect(
        useSessionStore.getState().submitWiring(useWiringStore.getState().wires).correct,
      ).toBe(true);

      const knobPol = findVariacForTargetV1(ex3_4, useWiringStore.getState().wires, 230, 0, undefined, {
        stageIndex: 0,
        meterId: 'vp',
        knobControlId: 'va.knob',
      });
      useControlsStore.getState().setControlValue('sup.switch', true);
      useControlsStore.getState().setControlValue('va.knob', knobPol);
      const polEval = evaluateExperimentPhysics(
        ex3_4,
        useWiringStore.getState().wires,
        useControlsStore.getState().values,
        useControlsStore.getState().gains,
        { stageIndex: 0, seed: useSessionStore.getState().sessionSeed },
      );
      useSessionStore
        .getState()
        .addObservationRow(polEval.output, useControlsStore.getState().values, polEval.connectionState.energised);

      useSessionStore.getState().continueToNextStage();
      const loadPairs = wiresFromNetlist(
        s1.acceptedNetlists[0],
        collectInternalLinks(getStageComponents(ex3_4, s1)),
      );
      useWiringStore.getState().setSolutionWires(loadPairs);
      expect(
        useSessionStore.getState().submitWiring(useWiringStore.getState().wires).correct,
      ).toBe(true);
      expect(useSessionStore.getState().completedExperiments).toContain('ex3.4');

      const steps = [
        { lampsOn: false, lamps: 0, rheoOn: false, R: 100 },
        { lampsOn: false, lamps: 0, rheoOn: true, R: 20 },
        { lampsOn: false, lamps: 0, rheoOn: true, R: 10 },
        { lampsOn: false, lamps: 0, rheoOn: true, R: 5 },
        { lampsOn: false, lamps: 0, rheoOn: true, R: 3.2 },
        { lampsOn: true, lamps: 3, rheoOn: true, R: 3.0 },
      ];
      for (const pt of steps) {
        const base = {
          ...useControlsStore.getState().values,
          'sup.switch': true,
          'lamps.switch': pt.lampsOn,
          'lamps.lamps': pt.lamps,
          'rheostat.switch': pt.rheoOn,
          'rheostat.R': pt.R,
        };
        const knob = findVariacForTargetV1(
          ex3_4,
          useWiringStore.getState().wires,
          230,
          pt.lamps,
          useControlsStore.getState().gains,
          {
            stageIndex: 1,
            meterId: 'vp',
            knobControlId: 'va.knob',
            loadControlId: 'lamps.lamps',
            baseControls: base,
          },
        );
        useControlsStore.getState().setControlValue('sup.switch', true);
        useControlsStore.getState().setControlValue('lamps.switch', pt.lampsOn);
        useControlsStore.getState().setControlValue('lamps.lamps', pt.lamps);
        useControlsStore.getState().setControlValue('rheostat.switch', pt.rheoOn);
        useControlsStore.getState().setControlValue('rheostat.R', pt.R);
        useControlsStore.getState().setControlValue('va.knob', knob);
        const evalOut = evaluateExperimentPhysics(
          ex3_4,
          useWiringStore.getState().wires,
          useControlsStore.getState().values,
          useControlsStore.getState().gains,
          { stageIndex: 1, seed: useSessionStore.getState().sessionSeed },
        );
        useSessionStore
          .getState()
          .addObservationRow(evalOut.output, useControlsStore.getState().values, evalOut.connectionState.energised);
      }

      const truth = computeParallelMethodTruth(s1.physicsParams);
      const session = useSessionStore.getState();
      session.setRunAnswerInput('circulatingCurrentA', truth.circulatingCurrentA.toFixed(2));
      session.setRunAnswerInput('firstRatedIL', truth.firstRatedIL.toFixed(1));
      session.setRunAnswerInput('firstTransformer', truth.firstTransformer);
      session.setRunAnswerInput('proportionalShare', truth.proportionalShare);

      const reportRes = useSessionStore.getState().submitRunAnswers();
      expect(reportRes.passed, reportRes.failedCriteria.join('; ')).toBe(true);
      expect(useSessionStore.getState().runCompleted['ex3.4']).toBe(true);
    });
  });
});
