import { describe, expect, it } from 'vitest';
import {
  canModifyWiring,
  validateWiring,
  WIRING_BLOCKED_MESSAGE,
} from '../core/circuit/validate';
import { ex3_1, NET_A, NET_B } from '../core/experiments/ex3_1';
import { netlistToWirePairs } from '../core/experiments/registry';
import type { WireEndpointPair } from '../core/types';

const CANONICAL_WIRES: WireEndpointPair[] = netlistToWirePairs(NET_A);
const NET_B_WIRES: WireEndpointPair[] = netlistToWirePairs(NET_B);

describe('Exp 3.1 wiring validation (union-find nets)', () => {
  it('passes Netlist A wiring', () => {
    const res = validateWiring(ex3_1, CANONICAL_WIRES);
    expect(res.correct).toBe(true);
    expect(res.matchedNetlistIndex).toBe(0);
    expect(res.openNets).toHaveLength(0);
    expect(res.shorts).toHaveLength(0);
    expect(res.extras).toHaveLength(0);
    expect(res.faults).toHaveLength(0);
  });

  it('passes Netlist B wiring (V1 tied to L)', () => {
    const res = validateWiring(ex3_1, NET_B_WIRES);
    expect(res.correct).toBe(true);
    expect(res.matchedNetlistIndex).toBe(1);
    expect(res.faults).toHaveLength(0);
  });

  it('does not depend on wire order or wire direction', () => {
    const shuffled = [...CANONICAL_WIRES]
      .reverse()
      .map(([a, b], idx): WireEndpointPair => (idx % 2 === 0 ? [b, a] : [a, b]));
    const res = validateWiring(ex3_1, shuffled);
    expect(res.correct).toBe(true);
    expect(res.openNets).toHaveLength(0);
    expect(res.shorts).toHaveLength(0);
    expect(res.faults).toHaveLength(0);
  });

  it('accepts neutral net joined through either va.IN_N or va.OUT_N', () => {
    const viaInN: WireEndpointPair[] = [
      ['sup.P', 'va.IN_P'],
      ['sup.N', 'va.IN_N'],
      ['va.IN_N', 'wm.V2'],
      ['va.IN_N', 'tx.P2'],
      ['va.IN_N', 'vp.B'],
      ['va.OUT_P', 'wm.M'],
      ['wm.M', 'wm.V1'],
      ['wm.L', 'tx.P1'],
      ['wm.L', 'vp.A'],
      ['tx.S1', 'vs.A'],
      ['tx.S1', 'am.IN'],
      ['am.OUT', 'ld.A'],
      ['tx.S2', 'vs.B'],
      ['tx.S2', 'ld.B'],
    ];
    expect(validateWiring(ex3_1, viaInN).correct).toBe(true);

    const viaOutN: WireEndpointPair[] = [
      ['sup.P', 'va.IN_P'],
      ['sup.N', 'va.OUT_N'],
      ['va.OUT_N', 'wm.V2'],
      ['va.OUT_N', 'tx.P2'],
      ['va.OUT_N', 'vp.B'],
      ['va.OUT_P', 'wm.M'],
      ['wm.M', 'wm.V1'],
      ['wm.L', 'tx.P1'],
      ['wm.L', 'vp.A'],
      ['tx.S1', 'vs.A'],
      ['tx.S1', 'am.IN'],
      ['am.OUT', 'ld.A'],
      ['tx.S2', 'vs.B'],
      ['tx.S2', 'ld.B'],
    ];
    expect(validateWiring(ex3_1, viaOutN).correct).toBe(true);
  });

  it('reports one missing wire as an open net without revealing exact terminals in category', () => {
    const missingOne = CANONICAL_WIRES.filter(
      ([a, b]) => !(a === 'wm.L' && b === 'tx.P1'),
    );
    const res = validateWiring(ex3_1, missingOne);
    expect(res.correct).toBe(false);
    expect(res.openNets).toHaveLength(1);
    expect(res.openNets[0].netIndex).toBe(3);
    expect(res.openNets[0].category).not.toContain('wm.L');
    expect(res.openNets[0].category).not.toContain('tx.P1');
  });

  it('detects wm-cc-reversed (M and L swapped)', () => {
    const wires = CANONICAL_WIRES.map(([a, b]): WireEndpointPair => {
      const mapTerm = (t: string) =>
        t === 'wm.M' ? 'wm.L' : t === 'wm.L' ? 'wm.M' : t;
      return [mapTerm(a), mapTerm(b)];
    });
    const res = validateWiring(ex3_1, wires);
    expect(res.correct).toBe(false);
    const fault = res.faults.find((f) => f.id === 'wm-cc-reversed');
    expect(fault?.description).toBe(
      'The wattmeter current coil is the wrong way round. M faces the mains, L faces the load.',
    );
  });

  it('detects wm-pc-open (wm.V2 disconnected from neutral)', () => {
    const wires = CANONICAL_WIRES.filter(
      ([a, b]) => a !== 'wm.V2' && b !== 'wm.V2',
    );
    const res = validateWiring(ex3_1, wires);
    expect(res.correct).toBe(false);
    const fault = res.faults.find((f) => f.id === 'wm-pc-open');
    expect(fault?.description).toBe(
      'The wattmeter pressure coil is not across the supply, so it senses no voltage.',
    );
  });

  it('detects wm-pc-reversed (V1 and V2 swapped)', () => {
    const wires = CANONICAL_WIRES.map(([a, b]): WireEndpointPair => {
      const mapTerm = (t: string) =>
        t === 'wm.V1' ? 'wm.V2' : t === 'wm.V2' ? 'wm.V1' : t;
      return [mapTerm(a), mapTerm(b)];
    });
    const res = validateWiring(ex3_1, wires);
    expect(res.correct).toBe(false);
    const fault = res.faults.find((f) => f.id === 'wm-pc-reversed');
    expect(fault?.description).toBe(
      'The pressure coil ends are swapped. V1 goes to the live side, V2 to neutral.',
    );
  });

  it('detects ammeter-across-secondary', () => {
    const wires: WireEndpointPair[] = [
      ...CANONICAL_WIRES.filter(
        ([a, b]) =>
          !(a === 'am.IN' || b === 'am.IN' || a === 'am.OUT' || b === 'am.OUT'),
      ),
      ['tx.S1', 'am.IN'],
      ['tx.S2', 'am.OUT'],
      ['tx.S1', 'ld.A'],
    ];
    const res = validateWiring(ex3_1, wires);
    expect(res.correct).toBe(false);
    const fault = res.faults.find((f) => f.id === 'ammeter-across-secondary');
    expect(fault?.effect).toBe('short');
    expect(fault?.description).toBe(
      'The ammeter is across the secondary instead of in series with the load. An ammeter is almost a short circuit.',
    );
  });

  it('detects live-neutral-short', () => {
    const wires: WireEndpointPair[] = [...CANONICAL_WIRES, ['va.OUT_P', 'sup.N']];
    const res = validateWiring(ex3_1, wires);
    expect(res.correct).toBe(false);
    const fault = res.faults.find((f) => f.id === 'live-neutral-short');
    expect(fault?.effect).toBe('short');
    expect(fault?.description).toBe('A live terminal is connected to neutral.');
  });

  it('detects variac-bypassed', () => {
    const wires: WireEndpointPair[] = [
      ...CANONICAL_WIRES.filter(
        ([a, b]) => !(a === 'sup.P' && b === 'va.IN_P'),
      ),
      ['sup.P', 'wm.M'],
    ];
    const res = validateWiring(ex3_1, wires);
    expect(res.correct).toBe(false);
    const fault = res.faults.find((f) => f.id === 'variac-bypassed');
    expect(fault?.description).toBe(
      'The autotransformer is bypassed, so you cannot set or hold the primary voltage.',
    );
  });

  it('detects voltmeter-in-series-load (stretch)', () => {
    const baseWithoutVs: WireEndpointPair[] = [
      ...CANONICAL_WIRES.filter(
        ([a, b]) =>
          a !== 'vs.A' && b !== 'vs.A' && a !== 'vs.B' && b !== 'vs.B',
      ),
      ['tx.S1', 'vs.A'],
      ['vs.B', 'ld.A'],
    ];
    const wires = baseWithoutVs.filter(
      ([a, b]) => !(a === 'am.OUT' && b === 'ld.A'),
    );
    const res = validateWiring(ex3_1, wires);
    expect(res.correct).toBe(false);
    const fault = res.faults.find((f) => f.id === 'voltmeter-in-series-load');
    expect(fault?.description).toBe(
      'A voltmeter must be connected across what it measures, not in series with the load.',
    );
  });

  it('blocks wiring modifications while supply is ON', () => {
    expect(canModifyWiring(false)).toEqual({ allowed: true });
    expect(canModifyWiring(true)).toEqual({
      allowed: false,
      message: WIRING_BLOCKED_MESSAGE,
    });
  });

  it('detects voltmeter-in-series-primary (stretch)', () => {
    const wires: WireEndpointPair[] = [
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
    const res = validateWiring(ex3_1, wires);
    expect(res.correct).toBe(false);
    const fault = res.faults.find((f) => f.id === 'voltmeter-in-series-primary');
    expect(fault?.description).toBe(
      'The primary voltmeter is in series with the transformer. Connect it across the primary winding.',
    );
  });
});
