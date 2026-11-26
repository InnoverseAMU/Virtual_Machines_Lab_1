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
  ex3_3,
  PRI_NET_A,
  PRI_NET_B,
  PRI_NET_C,
  PRI_NET_D,
  SEC_NET_A,
  SEC_NET_B,
  SEC_NET_C,
  SEC_NET_D,
} from '../core/experiments/ex3_3';
import { netlistToWirePairs } from '../core/experiments/registry';
import {
  evaluateExperimentPhysics,
  findMeterReading,
} from '../core/physics/evaluate';
import {
  computeSumpnerMethodTruth,
  resolveOppositionResidualV,
  resolveTx2PolarityFlipped,
} from '../core/physics/models/sumpner';
import { checkRunAnswers } from '../core/physics/report';
import type { Wire, WireEndpointPair } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { enterLabMode } from '../stores/modeActions';
import { OBSERVE_FIXED_SEED, useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';
import { referenceRun } from './helpers/referenceRun';

const PRI_WIRES_A = netlistToWirePairs(PRI_NET_A);
const PRI_WIRES_B = netlistToWirePairs(PRI_NET_B);
const PRI_WIRES_C = netlistToWirePairs(PRI_NET_C);
const PRI_WIRES_D = netlistToWirePairs(PRI_NET_D);

const SEC_WIRES_A = netlistToWirePairs(SEC_NET_A);
const SEC_WIRES_B = netlistToWirePairs(SEC_NET_B);
const SEC_WIRES_C = netlistToWirePairs(SEC_NET_C);
const SEC_WIRES_D = netlistToWirePairs(SEC_NET_D);

describe("Exp 3.3: Sumpner's Test of Single-Phase Transformer", () => {
  describe('Stage 1 & Stage 2 wiring validation and fault patterns', () => {
    it('accepts all Stage 1 and Stage 2 netlist variants regardless of wire order', () => {
      for (const [idx, wires] of [PRI_WIRES_A, PRI_WIRES_B, PRI_WIRES_C, PRI_WIRES_D].entries()) {
        const res = validateWiring(ex3_3, [...wires].reverse(), 0);
        expect(res.correct, `PRI variant ${idx} failed`).toBe(true);
        expect(res.matchedNetlistIndex).toBe(idx);
      }

      for (const [idx, wires] of [SEC_WIRES_A, SEC_WIRES_B, SEC_WIRES_C, SEC_WIRES_D].entries()) {
        const res = validateWiring(ex3_3, [...wires].reverse(), 1);
        expect(res.correct, `SEC variant ${idx} failed`).toBe(true);
        expect(res.matchedNetlistIndex).toBe(idx);
      }
    });

    it('detects Stage 1 polarity trap (tx1.S1 to tx2.S1) and all primary faults', () => {
      // Polarity trap: join tx1.S1-tx2.S1, vpol across tx1.S2-tx2.S2
      const aidingWires: WireEndpointPair[] = [
        ...PRI_WIRES_A.filter(
          ([a, b]) =>
            a !== 'tx1.S1' &&
            b !== 'tx1.S1' &&
            a !== 'tx2.S1' &&
            b !== 'tx2.S1' &&
            a !== 'tx1.S2' &&
            b !== 'tx1.S2' &&
            a !== 'tx2.S2' &&
            b !== 'tx2.S2',
        ),
        ['tx1.S1', 'tx2.S1'],
        ['tx1.S2', 'vpol.A'],
        ['tx2.S2', 'vpol.B'],
      ];
      const rTrap = validateWiring(ex3_3, aidingWires, 0);
      expect(rTrap.correct).toBe(false);
      expect(rTrap.faults.some((f) => f.id === 'secondary-series-aiding')).toBe(true);
      expect(
        rTrap.faults.find((f) => f.id === 'secondary-series-aiding')?.description,
      ).toContain('230 V');

      // Primary wattmeter faults
      const wpCcRev = PRI_WIRES_A.map(([a, b]): WireEndpointPair => [
        a === 'wp.M' ? 'wp.L' : a === 'wp.L' ? 'wp.M' : a,
        b === 'wp.M' ? 'wp.L' : b === 'wp.L' ? 'wp.M' : b,
      ]);
      expect(
        validateWiring(ex3_3, wpCcRev, 0).faults.some((f) => f.id === 'wp-cc-reversed'),
      ).toBe(true);

      const wpPcOpen = PRI_WIRES_A.filter(([a, b]) => a !== 'wp.V2' && b !== 'wp.V2');
      expect(
        validateWiring(ex3_3, wpPcOpen, 0).faults.some((f) => f.id === 'wp-pc-open'),
      ).toBe(true);

      const wpPcRev = PRI_WIRES_A.map(([a, b]): WireEndpointPair => [
        a === 'wp.V1' ? 'wp.V2' : a === 'wp.V2' ? 'wp.V1' : a,
        b === 'wp.V1' ? 'wp.V2' : b === 'wp.V2' ? 'wp.V1' : b,
      ]);
      expect(
        validateWiring(ex3_3, wpPcRev, 0).faults.some((f) => f.id === 'wp-pc-reversed'),
      ).toBe(true);

      // ap across source
      const apAcross: WireEndpointPair[] = [
        ...PRI_WIRES_A.filter(
          ([a, b]) => a !== 'ap.IN' && b !== 'ap.IN' && a !== 'ap.OUT' && b !== 'ap.OUT',
        ),
        ['vaP.OUT_P', 'ap.IN'],
        ['sup.N', 'ap.OUT'],
      ];
      expect(
        validateWiring(ex3_3, apAcross, 0).faults.find((f) => f.id === 'ap-across-source')?.effect,
      ).toBe('short');

      // live-neutral-short
      expect(
        validateWiring(ex3_3, [...PRI_WIRES_A, ['vaP.OUT_P', 'sup.N']], 0).faults.some(
          (f) => f.id === 'live-neutral-short',
        ),
      ).toBe(true);

      // vp in series
      const vpSeries: WireEndpointPair[] = [
        ...PRI_WIRES_A.filter(
          ([a, b]) =>
            a !== 'vp.A' &&
            b !== 'vp.A' &&
            a !== 'vp.B' &&
            b !== 'vp.B' &&
            !(a === 'vaP.OUT_P' && b === 'wp.M'),
        ),
        ['vaP.OUT_P', 'vp.A'],
        ['vp.B', 'wp.M'],
      ];
      expect(
        validateWiring(ex3_3, vpSeries, 0).faults.some((f) => f.id === 'vp-in-series'),
      ).toBe(true);
    });

    it('detects Stage 2 faults: secondary-series-aiding short, ws faults, as-across-source, and live-neutral-short', () => {
      // Aiding join in Stage 2 (tx1.S1 to tx2.S1) -> short
      const secAiding: WireEndpointPair[] = [
        ...SEC_WIRES_A.filter(
          ([a, b]) => !(a === 'tx1.S1' && b === 'tx2.S2') && !(a === 'tx2.S2' && b === 'tx1.S1'),
        ),
        ['tx1.S1', 'tx2.S1'],
      ];
      const rAid = validateWiring(ex3_3, secAiding, 1);
      expect(rAid.correct).toBe(false);
      expect(rAid.faults.find((f) => f.id === 'secondary-series-aiding')?.effect).toBe('short');

      // ws CC reversed
      const wsCcRev = SEC_WIRES_A.map(([a, b]): WireEndpointPair => [
        a === 'ws.M' ? 'ws.L' : a === 'ws.L' ? 'ws.M' : a,
        b === 'ws.M' ? 'ws.L' : b === 'ws.L' ? 'ws.M' : b,
      ]);
      expect(
        validateWiring(ex3_3, wsCcRev, 1).faults.some((f) => f.id === 'ws-cc-reversed'),
      ).toBe(true);

      // as across source
      const asAcross: WireEndpointPair[] = [
        ...SEC_WIRES_A.filter(
          ([a, b]) => a !== 'as.IN' && b !== 'as.IN' && a !== 'as.OUT' && b !== 'as.OUT',
        ),
        ['vaS.OUT_P', 'as.IN'],
        ['sup.N', 'as.OUT'],
      ];
      expect(
        validateWiring(ex3_3, asAcross, 1).faults.find((f) => f.id === 'as-across-source')?.effect,
      ).toBe('short');

      // live-neutral-short
      expect(
        validateWiring(ex3_3, [...SEC_WIRES_A, ['vaS.OUT_P', 'sup.N']], 1).faults.some(
          (f) => f.id === 'live-neutral-short',
        ),
      ).toBe(true);
    });
  });

  describe('Physics reference values, polarity trap, and seeded reproducibility', () => {
    const zeroGains = { vp: 0, ap: 0, wp: 0, vpol: 0, vs: 0, as: 0, ws: 0 };

    it('Stage 1 at 230 V reads Ip ~ 0.70 A, Wp ~ 40 W (100 div), Vpol < 1 V in opposition, and ~230 V in aiding', () => {
      const oppOut = evaluateExperimentPhysics(
        ex3_3,
        PRI_WIRES_A,
        { 'sup.switch': true, 'vaP.knob': 230 },
        zeroGains,
        { stageIndex: 0, seed: 42, noSag: true },
      ).output;

      expect(oppOut.outputs.Vp).toBeCloseTo(230, 3);
      expect(oppOut.outputs.Ip).toBeCloseTo(0.7, 2);
      expect(oppOut.outputs.Wp).toBeCloseTo(40.0, 1);
      expect(oppOut.outputs.Vpol).toBeLessThan(0.5);

      const wp = findMeterReading(oppOut, 'wp')!;
      expect(wp.mf).toBeCloseTo(0.4, 6);
      expect(wp.dial).toBeCloseTo(100, 0);

      // Series-aiding trap (tx1.S1 to tx2.S1) reads ~230 V on vpol
      const aidingWires: WireEndpointPair[] = [
        ...PRI_WIRES_A.filter(
          ([a, b]) =>
            a !== 'tx1.S1' &&
            b !== 'tx1.S1' &&
            a !== 'tx2.S1' &&
            b !== 'tx2.S1' &&
            a !== 'tx1.S2' &&
            b !== 'tx1.S2' &&
            a !== 'tx2.S2' &&
            b !== 'tx2.S2',
        ),
        ['tx1.S1', 'tx2.S1'],
        ['tx1.S2', 'vpol.A'],
        ['tx2.S2', 'vpol.B'],
      ];
      const aidOut = evaluateExperimentPhysics(
        ex3_3,
        aidingWires,
        { 'sup.switch': true, 'vaP.knob': 230 },
        zeroGains,
        { stageIndex: 0, seed: 42, noSag: true },
      ).output;

      expect(aidOut.outputs.Vpol).toBeCloseTo(230, 1);
      expect(findMeterReading(aidOut, 'vpol')?.shownValue).toBeCloseTo(230, 1);
      expect(aidOut.events.some((e) => e.id === 'polarity-aiding')).toBe(true);
    });

    it('Stage 2 circulates Is ~ 17.39 A at Vs ~ 9.26 V, Ws ~ 90.7 W, keeps primary unchanged, and trips on aiding join', () => {
      const knobS = findVariacForTargetV1(
        ex3_3,
        SEC_WIRES_A,
        17.39,
        0,
        zeroGains,
        {
          stageIndex: 1,
          meterId: 'as',
          knobControlId: 'vaS.knob',
          baseControls: {
            'sup.switch': true,
            'vaP.knob': 230,
            'vaS.knob': 0,
            'ws.vRange': 15,
            'ws.iRange': 20,
          },
        },
      );

      const outLoaded = evaluateExperimentPhysics(
        ex3_3,
        SEC_WIRES_A,
        {
          'sup.switch': true,
          'vaP.knob': 230,
          'vaS.knob': knobS,
          'ws.vRange': 15,
          'ws.iRange': 20,
        },
        zeroGains,
        { stageIndex: 1, seed: 42 },
      ).output;

      expect(outLoaded.outputs.Is).toBeCloseTo(17.39, 0);
      expect(outLoaded.outputs.Vs).toBeCloseTo(9.26, 0);
      expect(outLoaded.outputs.Ws).toBeCloseTo(90.7, 0);

      // Primary readings unaffected by secondary circulating current
      const outZeroSec = evaluateExperimentPhysics(
        ex3_3,
        SEC_WIRES_A,
        {
          'sup.switch': true,
          'vaP.knob': 230,
          'vaS.knob': 0,
          'ws.vRange': 15,
          'ws.iRange': 20,
        },
        zeroGains,
        { stageIndex: 1, seed: 42 },
      ).output;

      expect(outLoaded.outputs.Vp).toBeCloseTo(outZeroSec.outputs.Vp, 6);
      expect(outLoaded.outputs.Ip).toBeCloseTo(outZeroSec.outputs.Ip, 6);
      expect(outLoaded.outputs.Wp).toBeCloseTo(outZeroSec.outputs.Wp, 6);

      const ws = findMeterReading(outLoaded, 'ws')!;
      expect(ws.mf).toBeCloseTo(2, 6);

      // Aiding join in Stage 2 trips the supply MCB
      const secAiding: WireEndpointPair[] = [
        ...SEC_WIRES_A.filter(
          ([a, b]) => !(a === 'tx1.S1' && b === 'tx2.S2') && !(a === 'tx2.S2' && b === 'tx1.S1'),
        ),
        ['tx1.S1', 'tx2.S1'],
      ];
      const tripOut = evaluateExperimentPhysics(
        ex3_3,
        secAiding,
        {
          'sup.switch': true,
          'vaP.knob': 230,
          'vaS.knob': 5,
          'ws.vRange': 15,
          'ws.iRange': 20,
        },
        zeroGains,
        { stageIndex: 1, seed: 42 },
      ).output;
      expect(tripOut.mcbTripped).toBe(true);
      expect(tripOut.runFailed).toBe(true);

      // Overload rules (> 110% warning, > 125% runFailed)
      const over110 = evaluateExperimentPhysics(
        ex3_3,
        SEC_WIRES_A,
        {
          'sup.switch': true,
          'vaP.knob': 230,
          'vaS.knob': 11.0,
          'ws.vRange': 15,
          'ws.iRange': 20,
        },
        zeroGains,
        { stageIndex: 1, noSag: true },
      ).output;
      expect(over110.events.some((e) => e.id === 'transformer-overload')).toBe(true);
      expect(over110.runFailed).toBe(false);

      const over125 = evaluateExperimentPhysics(
        ex3_3,
        SEC_WIRES_A,
        {
          'sup.switch': true,
          'vaP.knob': 230,
          'vaS.knob': 12.2,
          'ws.vRange': 15,
          'ws.iRange': 20,
        },
        zeroGains,
        { stageIndex: 1, noSag: true },
      ).output;
      expect(over125.events.some((e) => e.id === 'transformer-overheating')).toBe(true);
      expect(over125.runFailed).toBe(true);
    });

    it('seeded polarity and residual opposition voltage are deterministic and reproducible', () => {
      expect(resolveTx2PolarityFlipped(42, ex3_3.stages[0].physicsParams)).toBe(true);
      expect(resolveTx2PolarityFlipped(999, ex3_3.stages[0].physicsParams)).toBe(true);
      // When explicit param omitted, derives reproducibly from seed
      expect(resolveTx2PolarityFlipped(42, {})).toBe(resolveTx2PolarityFlipped(42, {}));
      expect(resolveOppositionResidualV(42)).toBe(resolveOppositionResidualV(42));

      const r1 = evaluateExperimentPhysics(
        ex3_3,
        PRI_WIRES_A,
        { 'sup.switch': true, 'vaP.knob': 230 },
        zeroGains,
        { stageIndex: 0, seed: 777 },
      ).output;
      const r2 = evaluateExperimentPhysics(
        ex3_3,
        PRI_WIRES_A,
        { 'sup.switch': true, 'vaP.knob': 230 },
        zeroGains,
        { stageIndex: 0, seed: 777 },
      ).output;
      expect(r1.outputs.Vpol).toBe(r2.outputs.Vpol);
    });
  });

  describe('Method truth, referenceRun fairness, and efficiency chart', () => {
    it('computes method truth matching manual equations and prompt targets', () => {
      const truth = computeSumpnerMethodTruth(ex3_3.stages[0].physicsParams);
      expect(truth.Pi).toBeCloseTo(20.0, 2);
      expect(truth.R2).toBeCloseTo(0.15, 3);
      expect(truth.X2).toBeCloseTo(0.22, 3);
      expect(truth.Pc).toBeCloseTo(45.36, 1);
      expect(truth.VR_lag08).toBeCloseTo(3.81, 1);
      expect(truth.VR_lead08).toBeCloseTo(-0.18, 1);
      expect(truth.xMaxEff).toBeCloseTo(0.664, 2);
    });

    it('passes referenceRun across 6 seeded gain sets and extreme +/-0.5% gain combinations', () => {
      const seeds = [7, 42, 108, 777, 2026, 9001];
      for (const seed of seeds) {
        const run = referenceRun(ex3_3, seed);
        expect(
          run.passed,
          `Seed ${seed} failed: ${run.result.failedCriteria.join('; ')}`,
        ).toBe(true);
      }

      const extremes = [
        { vp: 0.005, ap: 0.005, wp: 0.005, vpol: 0.005, vs: 0.005, as: 0.005, ws: 0.005 },
        { vp: -0.005, ap: -0.005, wp: -0.005, vpol: -0.005, vs: -0.005, as: -0.005, ws: -0.005 },
        { vp: 0.005, ap: -0.005, wp: 0.005, vpol: -0.005, vs: 0.005, as: -0.005, ws: 0.005 },
        { vp: -0.005, ap: 0.005, wp: -0.005, vpol: 0.005, vs: -0.005, as: 0.005, ws: -0.005 },
      ];
      for (const gains of extremes) {
        const run = referenceRun(ex3_3, 123, gains);
        expect(
          run.passed,
          `Extreme ${JSON.stringify(gains)} failed: ${run.result.failedCriteria.join('; ')}`,
        ).toBe(true);
      }
    });

    it('rejects bad answers without leaking truth and plots efficiency vs x from 0.1 to 1.0', () => {
      const run = referenceRun(ex3_3, 1, {
        vp: 0,
        ap: 0,
        wp: 0,
        vpol: 0,
        vs: 0,
        as: 0,
        ws: 0,
      });
      const bad = checkRunAnswers(ex3_3, run.rowsByStage, {
        Pi: 50,
        R2: 0.9,
        X2: 0.9,
        Pc: 120,
        VR_lag: 9.0,
        VR_lead: 4.0,
        xMaxEff: 0.2,
      });
      expect(bad.passed).toBe(false);
      expect(bad.failedAnswers).toHaveLength(7);
      const joined = [...bad.failedCriteria, ...bad.hints].join(' ');
      expect(joined).not.toContain('45.36');
      expect(joined).not.toContain('3.81');

      const chart = ex3_3.charts![0];
      const series = chart.computeSeries!(
        { piInput: 20.0, pcInput: 45.36 },
        ex3_3.stages[0].physicsParams,
      );
      expect(series[0]).toHaveLength(10);
      expect(series[0][0].x).toBe(0.1);
      expect(series[0][9].x).toBe(1.0);
    });
  });

  describe('Learn mode, Observe mode, and Stage 1 -> Stage 2 carryOver', () => {
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

    it('learn steps span ~15 steps including live 230 V trap and resolve to canonical Stage 1 & Stage 2 netlists', () => {
      const steps = getAllLearnSteps(ex3_3);
      expect(steps.length).toBeGreaterThanOrEqual(14);
      expect(steps.some((s) => s.id === 'sumpner-1-aiding-check')).toBe(true);

      // Replay Stage 1 learn connect/disconnect pairs
      const stage0Steps = steps.filter((s) => s.stageId === 'primary-polarity');
      let priPairs: WireEndpointPair[] = [];
      for (const st of stage0Steps) {
        for (const [a, b] of st.disconnectTerminals ?? []) {
          priPairs = priPairs.filter(
            ([x, y]) => !((x === a && y === b) || (x === b && y === a)),
          );
        }
        for (const pair of st.connectTerminals ?? []) {
          priPairs.push(pair);
        }
      }
      expect(validateWiring(ex3_3, priPairs, 0).correct).toBe(true);

      // Carry over Stage 1 wires to Stage 2, then replay Stage 2 learn steps
      const stage1 = getStage(ex3_3, 1);
      const stage1Comps = getStageComponents(ex3_3, stage1);
      const carried = applyStageCarryOver(
        priPairs.map(([a, b], i): Wire => ({ id: `w${i}`, a, b })),
        stage1,
        stage1Comps,
      );
      const secPairs: WireEndpointPair[] = carried.map((w) => [w.a, w.b]);
      for (const st of steps.filter((s) => s.stageId === 'secondary-circuit')) {
        for (const pair of st.connectTerminals ?? []) {
          secPairs.push(pair);
        }
      }
      expect(validateWiring(ex3_3, secPairs, 1).correct).toBe(true);
    });

    it('carries over primary wires and opposition join from Stage 1 to Stage 2 while dropping vpol wires', () => {
      enterLabMode('ex3.3', 'self');
      const s0 = getStage(ex3_3, 0);
      const priPairs = wiresFromNetlist(
        s0.acceptedNetlists[0],
        collectInternalLinks(getStageComponents(ex3_3, s0)),
      );
      useWiringStore.getState().setSolutionWires(priPairs);
      expect(
        useSessionStore.getState().submitWiring(useWiringStore.getState().wires).correct,
      ).toBe(true);

      useSessionStore.getState().continueToNextStage();
      expect(useSessionStore.getState().currentStageIndex).toBe(1);

      const carriedWires = useWiringStore.getState().wires;
      expect(carriedWires.some((w) => w.a.startsWith('vpol.') || w.b.startsWith('vpol.'))).toBe(false);
      expect(
        carriedWires.some(
          (w) =>
            (w.a === 'tx1.S1' && w.b === 'tx2.S2') ||
            (w.a === 'tx2.S2' && w.b === 'tx1.S1'),
        ),
      ).toBe(true);
      expect(carriedWires.some((w) => w.a === 'sup.P' || w.b === 'sup.P')).toBe(true);
    });

    it('Observe mode loads pre-wired opposition connections across both stages', () => {
      enterLabMode('ex3.3', 'observe');
      expect(useSessionStore.getState().sessionSeed).toBe(OBSERVE_FIXED_SEED);
      expect(validateWiring(ex3_3, useWiringStore.getState().wires, 0).correct).toBe(true);

      useSessionStore.getState().switchObserveStage(1);
      expect(useSessionStore.getState().currentStageIndex).toBe(1);
      expect(validateWiring(ex3_3, useWiringStore.getState().wires, 1).correct).toBe(true);
    });

    it('Self mode completes Stage 1 -> carryOver -> Stage 2 -> Report answers', () => {
      enterLabMode('ex3.3', 'self');
      const s0 = getStage(ex3_3, 0);
      const s1 = getStage(ex3_3, 1);

      const priPairs = wiresFromNetlist(
        s0.acceptedNetlists[0],
        collectInternalLinks(getStageComponents(ex3_3, s0)),
      );
      useWiringStore.getState().setSolutionWires(priPairs);
      expect(useSessionStore.getState().submitWiring(useWiringStore.getState().wires).correct).toBe(true);

      const knobP = findVariacForTargetV1(ex3_3, useWiringStore.getState().wires, 230, 0, undefined, {
        stageIndex: 0,
        meterId: 'vp',
        knobControlId: 'vaP.knob',
      });
      useControlsStore.getState().setControlValue('sup.switch', true);
      useControlsStore.getState().setControlValue('vaP.knob', knobP);
      const priEval = evaluateExperimentPhysics(
        ex3_3,
        useWiringStore.getState().wires,
        useControlsStore.getState().values,
        useControlsStore.getState().gains,
        { stageIndex: 0, seed: useSessionStore.getState().sessionSeed },
      );
      useSessionStore
        .getState()
        .addObservationRow(priEval.output, useControlsStore.getState().values, priEval.connectionState.energised);

      useSessionStore.getState().continueToNextStage();
      const secPairs = wiresFromNetlist(
        s1.acceptedNetlists[0],
        collectInternalLinks(getStageComponents(ex3_3, s1)),
      );
      useWiringStore.getState().setSolutionWires(secPairs);
      expect(useSessionStore.getState().submitWiring(useWiringStore.getState().wires).correct).toBe(true);
      expect(useSessionStore.getState().completedExperiments).toContain('ex3.3');

      for (const frac of [0.25, 0.5, 0.75, 1.0]) {
        const knobS = findVariacForTargetV1(
          ex3_3,
          useWiringStore.getState().wires,
          17.39 * frac,
          0,
          useControlsStore.getState().gains,
          {
            stageIndex: 1,
            meterId: 'as',
            knobControlId: 'vaS.knob',
            baseControls: { ...useControlsStore.getState().values, 'sup.switch': true, 'vaP.knob': knobP },
          },
        );
        useControlsStore.getState().setControlValue('sup.switch', true);
        useControlsStore.getState().setControlValue('vaP.knob', knobP);
        useControlsStore.getState().setControlValue('vaS.knob', knobS);
        const secEval = evaluateExperimentPhysics(
          ex3_3,
          useWiringStore.getState().wires,
          useControlsStore.getState().values,
          useControlsStore.getState().gains,
          { stageIndex: 1, seed: useSessionStore.getState().sessionSeed },
        );
        useSessionStore
          .getState()
          .addObservationRow(secEval.output, useControlsStore.getState().values, secEval.connectionState.energised);
      }

      const truth = computeSumpnerMethodTruth(s0.physicsParams);
      const session = useSessionStore.getState();
      session.setRunAnswerInput('Pi', truth.Pi.toFixed(1));
      session.setRunAnswerInput('R2', truth.R2.toFixed(3));
      session.setRunAnswerInput('X2', truth.X2.toFixed(3));
      session.setRunAnswerInput('Pc', truth.Pc.toFixed(1));
      session.setRunAnswerInput('VR_lag', truth.VR_lag08.toFixed(2));
      session.setRunAnswerInput('VR_lead', truth.VR_lead08.toFixed(2));
      session.setRunAnswerInput('xMaxEff', truth.xMaxEff.toFixed(2));

      const reportRes = useSessionStore.getState().submitRunAnswers();
      expect(reportRes.passed, reportRes.failedCriteria.join('; ')).toBe(true);
      expect(useSessionStore.getState().runCompleted['ex3.3']).toBe(true);
    });
  });
});
