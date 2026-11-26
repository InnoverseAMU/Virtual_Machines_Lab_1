import { beforeEach, describe, expect, it } from 'vitest';
import { buildFeedback } from '../core/circuit/feedback';
import { deriveConnectionState, matchFaultPatterns } from '../core/circuit/faults';
import {
  evaluateLearnStepCondition,
  findVariacForTargetV1,
} from '../core/circuit/learn';
import { buildNets, type WireInput } from '../core/circuit/nets';
import { canModifyWiring, validateWiring, WIRING_BLOCKED_MESSAGE } from '../core/circuit/validate';
import { ex3_1, NET_A, NET_B } from '../core/experiments/ex3_1';
import { netlistToWirePairs } from '../core/experiments/registry';
import { drawSessionMeterGains } from '../core/physics/meters';
import {
  DEFAULT_TRANSFORMER_PARAMS,
  solveTransformerLoad,
} from '../core/physics/models/transformerLoad';
import {
  captureObservationRow,
  checkRunAnswers,
  computeRowEfficiency,
  computeRowLoadVA,
  computeRunTruth,
  evaluateRunPrerequisites,
} from '../core/physics/report';
import type { MeterGains, ObservationRow, TransformerLoadControls, WireEndpointPair } from '../core/types';
import { enterLabMode } from '../stores/modeActions';
import { useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';

const CANONICAL_WIRES: WireEndpointPair[] = netlistToWirePairs(NET_A);
const NET_B_WIRES: WireEndpointPair[] = netlistToWirePairs(NET_B);

function makeConn(wires: WireInput[], supplyOn = true) {
  const graph = buildNets(ex3_1.components, wires);
  const faults = matchFaultPatterns(ex3_1.faultPatterns, graph);
  return deriveConnectionState(graph, faults, supplyOn);
}

const baseControls: TransformerLoadControls = {
  supplyOn: true,
  variacV: 230,
  wmVRange: 300,
  wmIRange: 10,
  lamps: 0,
};

function runGoldenSimulatedRun(gains: MeterGains): ObservationRow[] {
  const lampSteps = [0, 2, 4, 6, 8, 10, 11];
  const conn = makeConn(CANONICAL_WIRES, true);
  return lampSteps.map((lamps, idx) => {
    const knob = findVariacForTargetV1(ex3_1, CANONICAL_WIRES, 230, lamps, gains);
    const controls: TransformerLoadControls = {
      supplyOn: true,
      variacV: knob,
      wmVRange: 300,
      wmIRange: 10,
      lamps,
    };
    const out = solveTransformerLoad(DEFAULT_TRANSFORMER_PARAMS, controls, conn, gains);
    return captureObservationRow(out, controls, idx + 1, `golden_${idx + 1}`);
  });
}

describe('Exp 3.1 Golden Tests (frozen reference behaviour)', () => {
  describe('1. Spec Section 6 reference values', () => {
    it('matches Spec Section 6 table within 1% at V1 = 230 V (no sag) and freezes exact outputs', () => {
      const conn = makeConn(CANONICAL_WIRES, true);
      const specReference = [
        { lamps: 0, I2: 0, V2: 115.0, Pout: 0, Pin: 20, eta: 0 },
        { lamps: 5, I2: 8.6, V2: 113.7, Pout: 977, Pin: 1008, eta: 0.969 },
        { lamps: 10, I2: 17.0, V2: 112.4, Pout: 1910, Pin: 1973, eta: 0.968 },
        { lamps: 12, I2: 20.3, V2: 111.9, Pout: 2271, Pin: 2353, eta: 0.965 },
      ];

      for (const row of specReference) {
        const out = solveTransformerLoad(
          DEFAULT_TRANSFORMER_PARAMS,
          { ...baseControls, lamps: row.lamps },
          conn,
          { vp: 0, vs: 0, am: 0, wm: 0 },
          { noSag: true },
        );

        expect(out.V1).toBeCloseTo(230, 6);
        if (row.lamps === 0) {
          expect(out.I2).toBe(0);
          expect(out.V2).toBeCloseTo(row.V2, 4);
          expect(out.Pout).toBe(0);
          expect(out.Pin).toBeCloseTo(row.Pin, 4);
          expect(out.eta).toBe(0);
        } else {
          expect(Math.abs(out.I2 - row.I2) / row.I2).toBeLessThan(0.01);
          expect(Math.abs(out.V2 - row.V2) / row.V2).toBeLessThan(0.01);
          expect(Math.abs(out.Pout - row.Pout) / row.Pout).toBeLessThan(0.01);
          expect(Math.abs(out.Pin - row.Pin) / row.Pin).toBeLessThan(0.01);
          expect(Math.abs(out.eta - row.eta) / row.eta).toBeLessThan(0.01);
        }
      }

      // Freeze exact model outputs with sag enabled at 10 lamps
      const sagged10 = solveTransformerLoad(
        DEFAULT_TRANSFORMER_PARAMS,
        { ...baseControls, lamps: 10 },
        conn,
        { vp: 0, vs: 0, am: 0, wm: 0 },
      );
      expect(sagged10.V1).toBeLessThan(230);
      expect(sagged10.V1).toBeCloseTo(227.44, 1);
      expect(sagged10.meters.wm.mf).toBe(20);
      expect(sagged10.meters.wm.dial * sagged10.meters.wm.mf).toBeCloseTo(
        sagged10.Pin,
        10,
      );
    });
  });

  describe('2. Validation outcomes for Netlist A, Netlist B, and every fault', () => {
    it('passes Netlist A and Netlist B with zero issues', () => {
      const resA = validateWiring(ex3_1, CANONICAL_WIRES);
      expect(resA.correct).toBe(true);
      expect(resA.matchedNetlistIndex).toBe(0);
      expect(resA.openNets).toHaveLength(0);
      expect(resA.shorts).toHaveLength(0);
      expect(resA.extras).toHaveLength(0);
      expect(resA.faults).toHaveLength(0);

      const resB = validateWiring(ex3_1, NET_B_WIRES);
      expect(resB.correct).toBe(true);
      expect(resB.matchedNetlistIndex).toBe(1);
      expect(resB.openNets).toHaveLength(0);
      expect(resB.shorts).toHaveLength(0);
      expect(resB.extras).toHaveLength(0);
      expect(resB.faults).toHaveLength(0);
    });

    it('detects all 8 Spec Section 5 faults with exact feedback descriptions and effects', () => {
      // 1. wm-cc-reversed
      const ccReversed = CANONICAL_WIRES.map(([a, b]): WireEndpointPair => {
        const m = (t: string) => (t === 'wm.M' ? 'wm.L' : t === 'wm.L' ? 'wm.M' : t);
        return [m(a), m(b)];
      });
      const rCcRev = validateWiring(ex3_1, ccReversed);
      expect(rCcRev.correct).toBe(false);
      expect(rCcRev.faults.find((f) => f.id === 'wm-cc-reversed')).toMatchObject({
        effect: 'reversed-reading',
        effectTarget: 'wm',
        description:
          'The wattmeter current coil is the wrong way round. M faces the mains, L faces the load.',
      });

      // 2. wm-pc-open
      const pcOpen = CANONICAL_WIRES.filter(([a, b]) => a !== 'wm.V2' && b !== 'wm.V2');
      const rPcOpen = validateWiring(ex3_1, pcOpen);
      expect(rPcOpen.correct).toBe(false);
      expect(rPcOpen.faults.find((f) => f.id === 'wm-pc-open')).toMatchObject({
        effect: 'no-reading',
        effectTarget: 'wm',
        description:
          'The wattmeter pressure coil is not across the supply, so it senses no voltage.',
      });

      // 3. wm-pc-reversed
      const pcRev = CANONICAL_WIRES.map(([a, b]): WireEndpointPair => {
        const m = (t: string) => (t === 'wm.V1' ? 'wm.V2' : t === 'wm.V2' ? 'wm.V1' : t);
        return [m(a), m(b)];
      });
      const rPcRev = validateWiring(ex3_1, pcRev);
      expect(rPcRev.correct).toBe(false);
      expect(rPcRev.faults.find((f) => f.id === 'wm-pc-reversed')).toMatchObject({
        effect: 'reversed-reading',
        effectTarget: 'wm',
        description:
          'The pressure coil ends are swapped. V1 goes to the live side, V2 to neutral.',
      });

      // 4. ammeter-across-secondary
      const amShort: WireEndpointPair[] = [
        ...CANONICAL_WIRES.filter(
          ([a, b]) =>
            !(a === 'am.IN' || b === 'am.IN' || a === 'am.OUT' || b === 'am.OUT'),
        ),
        ['tx.S1', 'am.IN'],
        ['tx.S2', 'am.OUT'],
        ['tx.S1', 'ld.A'],
      ];
      const rAmShort = validateWiring(ex3_1, amShort);
      expect(rAmShort.correct).toBe(false);
      expect(
        rAmShort.faults.find((f) => f.id === 'ammeter-across-secondary'),
      ).toMatchObject({
        effect: 'short',
        effectTarget: 'am',
        description:
          'The ammeter is across the secondary instead of in series with the load. An ammeter is almost a short circuit.',
      });

      // 5. live-neutral-short
      const lnShort: WireEndpointPair[] = [...CANONICAL_WIRES, ['va.OUT_P', 'sup.N']];
      const rLnShort = validateWiring(ex3_1, lnShort);
      expect(rLnShort.correct).toBe(false);
      expect(
        rLnShort.faults.find((f) => f.id === 'live-neutral-short'),
      ).toMatchObject({
        effect: 'short',
        effectTarget: 'sup',
        description: 'A live terminal is connected to neutral.',
      });

      // 6. variac-bypassed
      const vaBypass: WireEndpointPair[] = [
        ...CANONICAL_WIRES.filter(([a, b]) => !(a === 'sup.P' && b === 'va.IN_P')),
        ['sup.P', 'wm.M'],
      ];
      const rVaBypass = validateWiring(ex3_1, vaBypass);
      expect(rVaBypass.correct).toBe(false);
      expect(rVaBypass.faults.find((f) => f.id === 'variac-bypassed')).toMatchObject({
        effect: 'wrong-reading',
        effectTarget: 'va',
        description:
          'The autotransformer is bypassed, so you cannot set or hold the primary voltage.',
      });

      // 7. voltmeter-in-series-load
      const vsSeries: WireEndpointPair[] = [
        ...CANONICAL_WIRES.filter(
          ([a, b]) =>
            a !== 'vs.A' &&
            b !== 'vs.A' &&
            a !== 'vs.B' &&
            b !== 'vs.B' &&
            !(a === 'am.OUT' && b === 'ld.A'),
        ),
        ['tx.S1', 'vs.A'],
        ['vs.B', 'ld.A'],
      ];
      const rVsSeries = validateWiring(ex3_1, vsSeries);
      expect(rVsSeries.correct).toBe(false);
      expect(
        rVsSeries.faults.find((f) => f.id === 'voltmeter-in-series-load'),
      ).toMatchObject({
        effect: 'wrong-reading',
        effectTarget: 'vs',
        description:
          'A voltmeter must be connected across what it measures, not in series with the load.',
      });

      // 8. voltmeter-in-series-primary
      const vpSeries: WireEndpointPair[] = [
        ...CANONICAL_WIRES.filter(
          ([a, b]) =>
            !(a === 'wm.L' && b === 'tx.P1') &&
            !(a === 'wm.L' && b === 'vp.A') &&
            a !== 'vp.B' &&
            b !== 'vp.B',
        ),
        ['wm.L', 'vp.A'],
        ['vp.B', 'tx.P1'],
      ];
      const rVpSeries = validateWiring(ex3_1, vpSeries);
      expect(rVpSeries.correct).toBe(false);
      expect(
        rVpSeries.faults.find((f) => f.id === 'voltmeter-in-series-primary'),
      ).toMatchObject({
        effect: 'wrong-reading',
        effectTarget: 'vp',
        description:
          'The primary voltmeter is in series with the transformer. Connect it across the primary winding.',
      });

      // Feedback and wiring lock checks
      const fb = buildFeedback(ex3_1, rCcRev, 0);
      expect(fb.faultMessages).toContain(
        'The wattmeter current coil is the wrong way round. M faces the mains, L faces the load.',
      );
      expect(canModifyWiring(true)).toEqual({
        allowed: false,
        message: WIRING_BLOCKED_MESSAGE,
      });
    });
  });

  describe('3. Report fairness results', () => {
    it('freezes model truth and passes seeded & extreme +/-0.5% gain runs without leaking truth', () => {
      const truth = computeRunTruth(DEFAULT_TRANSFORMER_PARAMS);
      expect(truth.v2NoLoad).toBeCloseTo(115, 6);
      expect(truth.regulationPct).toBeCloseTo(2.322, 2);
      expect(truth.maxEffLoadPct).toBeCloseTo(66.4, 0);

      const gainSets: MeterGains[] = [
        ...[11, 42, 108, 777, 2026].map((seed) => drawSessionMeterGains(seed)),
        { vp: 0.005, vs: 0.005, am: 0.005, wm: 0.005 },
        { vp: -0.005, vs: -0.005, am: -0.005, wm: -0.005 },
        { vp: 0.005, vs: -0.005, am: 0.005, wm: -0.005 },
        { vp: -0.005, vs: 0.005, am: -0.005, wm: 0.005 },
      ];

      for (const gains of gainSets) {
        const rows = runGoldenSimulatedRun(gains);
        expect(evaluateRunPrerequisites(rows).allMet).toBe(true);

        const noLoad = rows.find((r) => r.i2 <= 0.1)!;
        const rated = rows.find((r) => r.i2 >= 15 && r.i2 <= 19)!;
        const studentReg = ((noLoad.v2 - rated.v2) / 115) * 100;

        let bestEff = -1;
        let bestVA = 0;
        for (const r of rows) {
          const eff = computeRowEfficiency(r);
          if (eff > bestEff) {
            bestEff = eff;
            bestVA = computeRowLoadVA(r);
          }
        }
        const studentMaxEffPct = (bestVA / 2000) * 100;

        const check = checkRunAnswers(
          rows,
          { regulationPct: studentReg, maxEffLoadPct: studentMaxEffPct },
          truth,
        );
        expect(check.passed, check.failedCriteria.join('; ')).toBe(true);
      }

      // Bad answers fail without leaking true numbers
      const rowsZero = runGoldenSimulatedRun({ vp: 0, vs: 0, am: 0, wm: 0 });
      const badCheck = checkRunAnswers(
        rowsZero,
        { regulationPct: 9.9, maxEffLoadPct: 10 },
        truth,
      );
      expect(badCheck.passed).toBe(false);
      const joined = [...badCheck.failedCriteria, ...badCheck.hints].join(' ');
      expect(joined).not.toContain(truth.regulationPct.toFixed(2));
      expect(joined).not.toContain(truth.maxEffLoadPct.toFixed(1));
    });
  });

  describe('4. Learn-step wire equality', () => {
    it('produces 17 steps whose combined wires equal Netlist A exactly and satisfy step 12-14 conditions', () => {
      expect(ex3_1.learnSteps).toHaveLength(17);
      const stepWires: WireEndpointPair[] = ex3_1.learnSteps.flatMap(
        (s) => s.connectTerminals ?? [],
      );

      const res = validateWiring(ex3_1, stepWires);
      expect(res.correct).toBe(true);
      expect(res.matchedNetlistIndex).toBe(0);

      const stepNets = buildNets(ex3_1.components, stepWires).nets;
      const netANets = buildNets(ex3_1.components, CANONICAL_WIRES).nets;
      expect(stepNets).toEqual(netANets);

      const conn = makeConn(stepWires, true);
      const step12 = ex3_1.learnSteps[11];
      const out12 = solveTransformerLoad(
        DEFAULT_TRANSFORMER_PARAMS,
        { ...baseControls, variacV: 230 },
        conn,
      );
      expect(
        evaluateLearnStepCondition(step12, { ...baseControls, variacV: 230 }, out12, false).met,
      ).toBe(true);
    });
  });

  describe('5. Observe wires', () => {
    beforeEach(() => {
      useWiringStore.getState().clearAllWiresScripted();
      useSessionStore.getState().resetLabSession();
    });

    it('loads 14 locked wires matching Netlist A in Observe mode', () => {
      enterLabMode('ex3.1', 'observe');
      const wires = useWiringStore.getState().wires;
      expect(wires).toHaveLength(14);
      const res = validateWiring(ex3_1, wires);
      expect(res.correct).toBe(true);
      expect(res.matchedNetlistIndex).toBe(0);

      useWiringStore.getState().clickTerminal('sup.P', false);
      expect(useWiringStore.getState().wires).toHaveLength(14);
    });
  });
});
