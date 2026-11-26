import { describe, expect, it } from 'vitest';
import { deriveConnectionState, matchFaultPatterns } from '../core/circuit/faults';
import { buildNets, type WireInput } from '../core/circuit/nets';
import { ex3_1, NET_A } from '../core/experiments/ex3_1';
import { netlistToWirePairs } from '../core/experiments/registry';
import { drawSessionMeterGains } from '../core/physics/meters';
import {
  DEFAULT_TRANSFORMER_PARAMS,
  solveTransformerLoad,
} from '../core/physics/models/transformerLoad';
import {
  checkPowerOnSafety,
  evaluateExperimentPhysics,
} from '../core/physics/evaluate';
import type { TransformerLoadControls, WireEndpointPair } from '../core/types';

const CANONICAL_WIRES = netlistToWirePairs(NET_A);

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

describe('Exp 3.1 physics and meter models', () => {
  it('matches Spec Section 6 reference table within 1% at V1 = 230 V', () => {
    const conn = makeConn(CANONICAL_WIRES, true);
    const reference = [
      { lamps: 0, I2: 0, V2: 115.0, Pout: 0, Pin: 20, eta: 0 },
      { lamps: 5, I2: 8.6, V2: 113.7, Pout: 977, Pin: 1008, eta: 0.969 },
      { lamps: 10, I2: 17.0, V2: 112.4, Pout: 1910, Pin: 1973, eta: 0.968 },
      { lamps: 12, I2: 20.3, V2: 111.9, Pout: 2271, Pin: 2353, eta: 0.965 },
    ];

    for (const row of reference) {
      const out = solveTransformerLoad(
        DEFAULT_TRANSFORMER_PARAMS,
        { ...baseControls, lamps: row.lamps },
        conn,
        undefined,
        { noSag: true },
      );

      expect(out.V1).toBeCloseTo(230, 6);
      if (row.lamps === 0) {
        expect(out.I2).toBe(0);
        expect(out.V2).toBeCloseTo(row.V2, 1);
        expect(out.Pout).toBe(0);
        expect(out.Pin).toBeCloseTo(row.Pin, 1);
      } else {
        expect(Math.abs(out.I2 - row.I2) / row.I2).toBeLessThan(0.01);
        expect(Math.abs(out.V2 - row.V2) / row.V2).toBeLessThan(0.01);
        expect(Math.abs(out.Pout - row.Pout) / row.Pout).toBeLessThan(0.01);
        expect(Math.abs(out.Pin - row.Pin) / row.Pin).toBeLessThan(0.01);
        expect(Math.abs(out.eta - row.eta) / row.eta).toBeLessThan(0.01);
      }
    }
  });

  it('with gain = 0 at 230 V and 10 lamps, wattmeter dial * MF === truePower exactly', () => {
    const conn = makeConn(CANONICAL_WIRES, true);
    const out = solveTransformerLoad(
      DEFAULT_TRANSFORMER_PARAMS,
      { ...baseControls, lamps: 10, wmVRange: 300, wmIRange: 10 },
      conn,
      { vp: 0, vs: 0, am: 0, wm: 0 },
      { noSag: true },
    );

    expect(out.meters.wm.mf).toBe(20);
    expect(out.meters.wm.dial * out.meters.wm.mf).toBeCloseTo(out.Pin, 10);
    expect(out.meters.wm.shownValue).toBeCloseTo(out.Pin, 10);
    expect(Math.abs(out.meters.am.shownValue - 17.0) / 17.0).toBeLessThan(0.01);
    expect(Math.abs(out.meters.vs.shownValue - 112.4) / 112.4).toBeLessThan(0.01);
  });

  it('with seeded session gain, shownPower stays within 0.5% of full scale and dial * MF === shownPower', () => {
    const conn = makeConn(CANONICAL_WIRES, true);
    const gains = drawSessionMeterGains(42);
    const out = solveTransformerLoad(
      DEFAULT_TRANSFORMER_PARAMS,
      { ...baseControls, lamps: 10, wmVRange: 300, wmIRange: 10 },
      conn,
      gains,
      { noSag: true },
    );

    const fullScalePower = 300 * 10;
    expect(out.meters.wm.dial * out.meters.wm.mf).toBeCloseTo(
      out.meters.wm.shownValue,
      10,
    );
    expect(
      Math.abs(out.meters.wm.shownValue - out.meters.wm.trueValue),
    ).toBeLessThanOrEqual(0.005 * fullScalePower);
  });

  it('supply sag reduces V1 by ~2.6 V at 12 lamps when variac is held at 230 V', () => {
    const conn = makeConn(CANONICAL_WIRES, true);
    const out = solveTransformerLoad(
      DEFAULT_TRANSFORMER_PARAMS,
      { ...baseControls, variacV: 230, lamps: 12 },
      conn,
    );

    expect(out.V1).toBeLessThan(230);
    expect(230 - out.V1).toBeGreaterThan(2.0);
    expect(230 - out.V1).toBeLessThan(3.5);
  });

  it('wattmeter reverses when M and L are swapped or V1 and V2 are swapped', () => {
    const swappedCC = CANONICAL_WIRES.map(([a, b]): WireEndpointPair => {
      const m = (t: string) =>
        t === 'wm.M' ? 'wm.L' : t === 'wm.L' ? 'wm.M' : t;
      return [m(a), m(b)];
    });
    const outCC = solveTransformerLoad(
      DEFAULT_TRANSFORMER_PARAMS,
      { ...baseControls, lamps: 5 },
      makeConn(swappedCC, true),
    );
    expect(outCC.meters.wm.reversed).toBe(true);
    expect(outCC.meters.wm.dial).toBeLessThan(0);
    expect(outCC.meters.wm.pointerRatio).toBeLessThan(0);
    expect(outCC.meters.wm.pointerRatio).toBeGreaterThanOrEqual(-0.05);

    const swappedPC = CANONICAL_WIRES.map(([a, b]): WireEndpointPair => {
      const m = (t: string) =>
        t === 'wm.V1' ? 'wm.V2' : t === 'wm.V2' ? 'wm.V1' : t;
      return [m(a), m(b)];
    });
    const outPC = solveTransformerLoad(
      DEFAULT_TRANSFORMER_PARAMS,
      { ...baseControls, lamps: 5 },
      makeConn(swappedPC, true),
    );
    expect(outPC.meters.wm.reversed).toBe(true);
    expect(outPC.meters.wm.dial).toBeLessThan(0);
  });

  it('wattmeter reads zero when wm.V2 is disconnected', () => {
    const pcOpen = CANONICAL_WIRES.filter(
      ([a, b]) => a !== 'wm.V2' && b !== 'wm.V2',
    );
    const out = solveTransformerLoad(
      DEFAULT_TRANSFORMER_PARAMS,
      { ...baseControls, lamps: 10 },
      makeConn(pcOpen, true),
    );
    expect(out.meters.wm.shownValue).toBe(0);
    expect(out.meters.wm.dial).toBe(0);
    // Secondary still delivers load because primary path through CC is intact
    expect(out.I2).toBeGreaterThan(15);
  });

  it('trips MCB on short circuit faults when supply is turned ON', () => {
    const shortedWires: WireEndpointPair[] = [
      ...CANONICAL_WIRES,
      ['va.OUT_P', 'sup.N'],
    ];
    const out = solveTransformerLoad(
      DEFAULT_TRANSFORMER_PARAMS,
      { ...baseControls, lamps: 5 },
      makeConn(shortedWires, true),
    );
    expect(out.mcbTripped).toBe(true);
    expect(out.runFailed).toBe(true);
    expect(out.V1).toBe(0);
    expect(out.events[0]?.id).toBe('mcb-trip');
  });

  it('handles voltmeter-in-series-load by dropping I2 to 0 while vs reads no-load V2', () => {
    const vsInSeries: WireEndpointPair[] = [
      ...CANONICAL_WIRES.filter(
        ([a, b]) =>
          a !== 'vs.A' && b !== 'vs.A' && a !== 'vs.B' && b !== 'vs.B' && a !== 'am.IN' && b !== 'am.IN' && a !== 'am.OUT' && b !== 'am.OUT',
      ),
      ['tx.S1', 'vs.A'],
      ['vs.B', 'am.IN'],
      ['am.OUT', 'ld.A'],
    ];
    const out = solveTransformerLoad(
      DEFAULT_TRANSFORMER_PARAMS,
      { ...baseControls, lamps: 10 },
      makeConn(vsInSeries, true),
      undefined,
      { noSag: true },
    );
    expect(out.I2).toBe(0);
    expect(out.meters.am.shownValue).toBe(0);
    expect(out.meters.vs.shownValue).toBeCloseTo(115, 1);
  });

  it('pegs and damages meters above 100% and 150% of range, and fails run >125% I2', () => {
    const conn = makeConn(CANONICAL_WIRES, true);
    // Low wattmeter range (2.5 A) with 10 lamps (I1 ~ 8.5 A > 1.5 * 2.5 = 3.75 A -> damaged)
    const outWmDamaged = solveTransformerLoad(
      DEFAULT_TRANSFORMER_PARAMS,
      { ...baseControls, lamps: 10, wmIRange: 2.5 },
      conn,
    );
    expect(outWmDamaged.meters.wm.damaged).toBe(true);
    expect(outWmDamaged.meters.wm.shownValue).toBe(0);

    // Overvoltage to push I2 > 21.7 A (e.g. variac at 260 V, 12 lamps)
    const outOverload = solveTransformerLoad(
      DEFAULT_TRANSFORMER_PARAMS,
      { ...baseControls, variacV: 260, lamps: 12 },
      conn,
    );
    expect(outOverload.I2).toBeGreaterThan(21.7);
    expect(outOverload.runFailed).toBe(true);
    expect(outOverload.events.some((e) => e.id === 'transformer-overheating')).toBe(
      true,
    );
  });

  it('evaluateExperimentPhysics maps ex3_1 + NET_A + controls to Section 6 reference values', () => {
    const res = evaluateExperimentPhysics(
      ex3_1,
      CANONICAL_WIRES,
      { ...baseControls, lamps: 10 },
      { vp: 0, vs: 0, am: 0, wm: 0 },
      { noSag: true },
    );

    expect(res.connectionState.loadConnected).toBe(true);
    expect(res.output.V1).toBeCloseTo(230, 5);
    expect(Math.abs(res.output.I2 - 17.0) / 17.0).toBeLessThan(0.01);
    expect(Math.abs(res.output.V2 - 112.4) / 112.4).toBeLessThan(0.01);
    expect(
      res.output.meters.wm.dial * res.output.meters.wm.mf,
    ).toBeCloseTo(res.output.Pin, 10);
  });

  it('checkPowerOnSafety warns when powered ON above 10 V and passes at <= 10 V', () => {
    expect(checkPowerOnSafety(0)).toBeNull();
    expect(checkPowerOnSafety(10)).toBeNull();
    const warn = checkPowerOnSafety(11);
    expect(warn?.severity).toBe('warning');
    expect(warn?.message).toBe('Start the autotransformer from zero.');
  });
});
