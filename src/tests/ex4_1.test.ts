import { beforeEach, describe, expect, it } from 'vitest';
import { buildNets, wiresFromNetlist } from '../core/circuit/nets';
import { getStage } from '../core/circuit/stages';
import { validateWiring } from '../core/circuit/validate';
import { ex4_1 } from '../core/experiments/ex4_1';
import { evaluateExperimentPhysics, findMeterReading } from '../core/physics/evaluate';
import {
  computePulloutSlip,
  DEFAULT_IM3PH_PARAMS,
  solveIMCircuitAtSlip,
  solveSlipByBisection,
} from '../core/physics/motors/im3ph';
import { useSessionStore } from '../stores/sessionStore';
import { referenceRun } from './helpers/referenceRun';

const STAGE = getStage(ex4_1, 0);
const CANON_WIRES = wiresFromNetlist(STAGE.acceptedNetlists[0], []);

describe('Experiment 4.1: Load test of 3-phase induction motor', () => {
  beforeEach(() => {
    useSessionStore.getState().selectExperiment('ex4.1');
  });

  it('matches hand-calculated motor model checkpoints within 3% and solves slip monotonically', () => {
    // Checkpoint at s = 0.0467, 230 V line
    const fullPt = solveIMCircuitAtSlip(230, 0.0467, DEFAULT_IM3PH_PARAMS);
    expect(fullPt.I2phase).toBeCloseTo(2.43, 1);
    expect(fullPt.IL).toBeCloseTo(5.93, 1);
    expect(Math.abs(fullPt.Pin - 1811) / 1811).toBeLessThan(0.03);
    expect(fullPt.pf).toBeCloseTo(0.77, 1);
    expect(Math.abs(fullPt.Pshaft - 1460) / 1460).toBeLessThan(0.03);
    expect(fullPt.Tshaft).toBeCloseTo(9.76, 1);
    expect(fullPt.etaPct).toBeCloseTo(80.6, 0);

    // No-load checkpoint (Tload = 0)
    const noLoadPt = solveSlipByBisection(230, 0, DEFAULT_IM3PH_PARAMS);
    expect(noLoadPt.s).toBeCloseTo(0.0016, 3);
    expect(noLoadPt.IL).toBeCloseTo(3.36, 1);
    expect(Math.abs(noLoadPt.Pin - 204) / 204).toBeLessThan(0.03);
    expect(noLoadPt.pf).toBeCloseTo(0.15, 1);

    // Pullout Tmax and starting torque
    const sMax = computePulloutSlip(DEFAULT_IM3PH_PARAMS);
    expect(sMax).toBeCloseTo(0.36, 1);
    const maxPt = solveIMCircuitAtSlip(230, sMax, DEFAULT_IM3PH_PARAMS);
    expect(maxPt.Tshaft).toBeCloseTo(32, 0);
    const startPt = solveIMCircuitAtSlip(230, 1.0, DEFAULT_IM3PH_PARAMS);
    expect(startPt.Tdev).toBeCloseTo(22.5, 0);

    // Stalled below ~31 V, rotating above ~31 V; stalled above Tmax (~32 N·m)
    expect(solveSlipByBisection(25, 0, DEFAULT_IM3PH_PARAMS).stalled).toBe(true);
    expect(solveSlipByBisection(45, 0, DEFAULT_IM3PH_PARAMS).stalled).toBe(false);
    const overMaxPt = solveSlipByBisection(230, 35, DEFAULT_IM3PH_PARAMS);
    expect(overMaxPt.stalled).toBe(true);
    expect(overMaxPt.IL).toBeGreaterThan(25);

    // Monotonicity of slip & speed against increasing brake torque
    let prevSlip = 0;
    let prevRpm = 1500;
    for (const T of [0, 2, 4, 6, 8, 9.76, 12, 16]) {
      const pt = solveSlipByBisection(230, T, DEFAULT_IM3PH_PARAMS);
      expect(pt.s).toBeGreaterThan(prevSlip);
      expect(pt.rpm).toBeLessThan(prevRpm);
      prevSlip = pt.s;
      prevRpm = pt.rpm;
    }
  });

  it('computes W1 and W2 accurately across three loads (sum = Pin) with negative W1 at no load', () => {
    for (const loadF of [0, 5.0, 9.95]) {
      const bRes = evaluateExperimentPhysics(
        ex4_1,
        CANON_WIRES,
        {
          'sup3.switch': true,
          'va3.knob': 230,
          'wm.vRange': 300,
          'wm.iRange': 5,
          'wm.reverse': false,
          'sel.pos': 'B',
          'motor.loadF': loadF,
        },
        { wm: 0, vm: 0, am: 0, s1: 0, s2: 0, tacho: 0 },
      ).output;
      const cRes = evaluateExperimentPhysics(
        ex4_1,
        CANON_WIRES,
        {
          'sup3.switch': true,
          'va3.knob': 230,
          'wm.vRange': 300,
          'wm.iRange': 5,
          'wm.reverse': false,
          'sel.pos': 'C',
          'motor.loadF': loadF,
        },
        { wm: 0, vm: 0, am: 0, s1: 0, s2: 0, tacho: 0 },
      ).output;

      const wmB = findMeterReading(bRes, 'wm')!;
      const wmC = findMeterReading(cRes, 'wm')!;
      if (loadF === 0) {
        expect(wmB.reversed).toBe(true);
        // With REV switch ON, dial goes positive upscale for student recording
        const revB = evaluateExperimentPhysics(
          ex4_1,
          CANON_WIRES,
          {
            'sup3.switch': true,
            'va3.knob': 230,
            'wm.vRange': 300,
            'wm.iRange': 5,
            'wm.reverse': true,
            'sel.pos': 'B',
            'motor.loadF': 0,
          },
          { wm: 0 },
        ).output;
        const wmRevB = findMeterReading(revB, 'wm')!;
        expect(wmRevB.reversed).toBe(false);
        expect(wmRevB.dial).toBeGreaterThan(10);
        const w1Signed = -wmRevB.dial!;
        const w2Signed = wmC.dial!;
        const pinFromSum = (w1Signed + w2Signed) * wmC.mf! * 2;
        expect(Math.abs(pinFromSum - bRes.outputs.PinTrue) / bRes.outputs.PinTrue).toBeLessThan(0.01);
      } else {
        expect(wmB.reversed).toBe(false);
        expect(wmC.reversed).toBe(false);
        const pinFromSum = (wmB.dial! + wmC.dial!) * wmC.mf! * 2;
        expect(Math.abs(pinFromSum - bRes.outputs.PinTrue) / bRes.outputs.PinTrue).toBeLessThan(0.01);
      }
    }
  });

  it('validates net variants, selector internal link, and trips MCB on CT secondary open or stall', () => {
    // Accepted net variants (wm.V1 on CT primary or on motor.A; vm swapped)
    for (const netlist of STAGE.acceptedNetlists) {
      const wires = wiresFromNetlist(netlist, []);
      expect(validateWiring(ex4_1, wires, 0).correct).toBe(true);
    }

    // Selector internal link switching COM between B and C
    const comps = ex4_1.components;
    const graphB = buildNets(comps, CANON_WIRES, { 'sel.pos': 'B' });
    expect(graphB.areConnected('wm.V2', 'va3.OUT_B')).toBe(true);
    expect(graphB.areConnected('wm.V2', 'va3.OUT_C')).toBe(false);

    const graphC = buildNets(comps, CANON_WIRES, { 'sel.pos': 'C' });
    expect(graphC.areConnected('wm.V2', 'va3.OUT_C')).toBe(true);
    expect(graphC.areConnected('wm.V2', 'va3.OUT_B')).toBe(false);

    // CT secondary open while primary carries current -> danger trip
    const ctOpenWires = CANON_WIRES.filter(
      ([a, b]) => !((a === 'ct.S_M' && b === 'wm.M') || (a === 'wm.M' && b === 'ct.S_M')),
    );
    const ctOpenOut = evaluateExperimentPhysics(
      ex4_1,
      ctOpenWires,
      { 'sup3.switch': true, 'va3.knob': 230, 'sel.pos': 'B', 'motor.loadF': 0 },
      {},
    ).output;
    expect(ctOpenOut.mcbTripped).toBe(true);
    expect(ctOpenOut.events.some((e) => e.id === 'ct-secondary-open')).toBe(true);

    // Overload stall trip (> 2 * rated current when Tload > Tmax)
    const stallOut = evaluateExperimentPhysics(
      ex4_1,
      CANON_WIRES,
      { 'sup3.switch': true, 'va3.knob': 230, 'sel.pos': 'B', 'motor.loadF': 16 },
      {},
    );
    // At 16 kgf, Tload = 15.7 N·m < 32 N·m so runs loaded; drop voltage so Tmax(V) < Tload
    expect(stallOut.output.mcbTripped).toBe(false);
    const lowVStall = evaluateExperimentPhysics(
      ex4_1,
      CANON_WIRES,
      { 'sup3.switch': true, 'va3.knob': 140, 'sel.pos': 'B', 'motor.loadF': 16 },
      {},
    );
    expect(lowVStall.output.mcbTripped).toBe(true);
    expect(lowVStall.output.events.some((e) => e.id === 'motor-overload-stall')).toBe(true);
  });

  it('captures signed W1/W2 rows with reverse switch state & invalidates pending row on load change', () => {
    const baseControls = {
      'sup3.switch': true,
      'va3.knob': 230,
      'wm.vRange': 300,
      'wm.iRange': 5,
      'wm.reverse': true,
      'sel.pos': 'B',
      'motor.loadF': 0,
    };
    const outW1Rev = evaluateExperimentPhysics(ex4_1, CANON_WIRES, baseControls, {
      vm: 0,
      am: 0,
      wm: 0,
      s1: 0,
      s2: 0,
      tacho: 0,
    }).output;

    const store = useSessionStore.getState();
    store.captureDualReading('first', outW1Rev, baseControls);
    expect(useSessionStore.getState().pendingDualReading?.first?.reverseOn).toBe(true);
    expect(useSessionStore.getState().pendingDualReading?.first?.signedDiv).toBeLessThan(0);

    // Changing load invalidates pending reading when addObservationRow checks signature
    const c2Controls = { ...baseControls, 'sel.pos': 'C', 'wm.reverse': false, 'motor.loadF': 4 };
    const outW2ChangedLoad = evaluateExperimentPhysics(ex4_1, CANON_WIRES, c2Controls, {}).output;
    store.addObservationRow(outW2ChangedLoad, c2Controls, true);
    expect(useSessionStore.getState().observationRows).toHaveLength(0);

    // Capturing both W1 and W2 at identical load/voltage commits row with signed W1 < 0
    const c2SameLoad = { ...baseControls, 'sel.pos': 'C', 'wm.reverse': false };
    const outW2Same = evaluateExperimentPhysics(ex4_1, CANON_WIRES, c2SameLoad, {
      vm: 0,
      am: 0,
      wm: 0,
      s1: 0,
      s2: 0,
      tacho: 0,
    }).output;
    store.captureDualReading('second', outW2Same, c2SameLoad);
    store.addObservationRow(outW2Same, c2SameLoad, true);
    const rows = useSessionStore.getState().observationRows;
    expect(rows).toHaveLength(1);
    expect(rows[0].values.w1Rev).toBe(true);
    expect(Number(rows[0].values.W1)).toBeLessThan(0);
    expect(Number(rows[0].values.Pin)).toBeCloseTo(204, 0);
  });

  it('passes referenceRun across 5 seeds and extreme gains on every meter including spring balances', () => {
    for (const seed of [202601, 42, 777, 1337, 9999]) {
      const rSeed = referenceRun(ex4_1, seed);
      expect(rSeed.passed, rSeed.result.failedCriteria.join('; ')).toBe(true);
    }

    const extremeGainSets: Record<string, number>[] = [
      { vm: -0.005, am: -0.005, wm: -0.005, s1: -0.005, s2: -0.005, tacho: -0.005 },
      { vm: 0.005, am: 0.005, wm: 0.005, s1: 0.005, s2: 0.005, tacho: 0.005 },
      { vm: 0.005, am: -0.005, wm: 0.005, s1: 0.005, s2: -0.005, tacho: -0.005 },
      { vm: -0.005, am: 0.005, wm: -0.005, s1: -0.005, s2: 0.005, tacho: 0.005 },
    ];
    for (const gains of extremeGainSets) {
      const r = referenceRun(ex4_1, 202601, gains);
      expect(r.passed, r.result.failedCriteria.join('; ')).toBe(true);
    }
  });
});
