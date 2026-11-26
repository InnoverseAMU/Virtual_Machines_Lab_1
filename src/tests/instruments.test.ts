import { describe, expect, it } from 'vitest';
import {
  ammeterAcrossSource,
  liveNeutralShort,
  voltmeterInSeries,
  wattmeterFaults,
} from '../core/circuit/faultFactories';
import { matchFaultPatterns } from '../core/circuit/faults';
import { buildNets, crossProduct } from '../core/circuit/nets';
import { COMPONENT_DEFS, resolveComponentInternalLinks } from '../core/components';
import { NET_A } from '../core/experiments/ex3_1';
import {
  deriveHiddenPolarity,
  deriveHiddenTerminalScramble,
  evaluateAnalogMeter,
  evaluateWattmeter,
} from '../core/physics/meters';
import type { ComponentInstance, ComponentTypeDef, Net } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';

describe('Platform generalisation: netlist crossProduct, fault factories, instruments, seeded state', () => {
  it('crossProduct produces Cartesian product of independent net variants and merges shared terminals', () => {
    const base: Net[] = [['sup.P', 'va.IN_P'], ['sup.N', 'va.IN_N']];
    const wmChoices: Net[][] = [
      [['va.OUT_P', 'wm.M', 'wm.V1'], ['wm.L', 'tx.P1']],
      [['va.OUT_P', 'wm.M'], ['wm.L', 'wm.V1', 'tx.P1']],
    ];
    const amChoices: Net[][] = [
      [['tx.S1', 'am.IN'], ['am.OUT', 'ld.A'], ['tx.S2', 'ld.B']],
      [['tx.S1', 'ld.A'], ['tx.S2', 'am.IN'], ['am.OUT', 'ld.B']],
    ];

    const result = crossProduct([[base], wmChoices, amChoices]);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual([...base, ...wmChoices[0], ...amChoices[0]]);
    expect(result[1]).toEqual([...base, ...wmChoices[0], ...amChoices[1]]);
    expect(result[2]).toEqual([...base, ...wmChoices[1], ...amChoices[0]]);
    expect(result[3]).toEqual([...base, ...wmChoices[1], ...amChoices[1]]);

    // Shared terminal merging
    const merged = crossProduct([
      [[['a', 'b']]],
      [[['b', 'c']], [['b', 'd']]],
    ]);
    expect(merged).toEqual([[['a', 'b', 'c']], [['a', 'b', 'd']]]);

    expect(crossProduct([])).toEqual([]);
    expect(crossProduct([[base], []])).toEqual([]);
  });

  it('fault factories generate exact wattmeter, ammeter, voltmeter, and live-neutral patterns', () => {
    const comps: ComponentInstance[] = [
      { id: 'sup', type: 'acSupply', label: 'Sup', position: [0, 0, 0], params: {} },
      { id: 'va', type: 'variac1ph', label: 'Va', position: [1, 0, 0], params: {} },
      { id: 'wm', type: 'wattmeter', label: 'Wm', position: [2, 0, 0], params: {} },
      { id: 'tx', type: 'transformer1ph', label: 'Tx', position: [3, 0, 0], params: {} },
      { id: 'vp', type: 'voltmeter', label: 'Vp', position: [4, 0, 0], params: {} },
      { id: 'vs', type: 'voltmeter', label: 'Vs', position: [5, 0, 0], params: {} },
      { id: 'am', type: 'ammeter', label: 'Am', position: [6, 0, 0], params: {} },
      { id: 'ld', type: 'lampLoad', label: 'Ld', position: [7, 0, 0], params: {} },
    ];

    const faults = [
      ...wattmeterFaults('wm', NET_A),
      ammeterAcrossSource('am', ['tx.S1', 'tx.S2']),
      voltmeterInSeries('vs', [['tx.S1', 'ld.A']], ['tx.S2', 'ld.B']),
      liveNeutralShort([['sup.P', 'va.OUT_P']], ['sup.N', 'va.IN_N']),
    ];

    expect(faults).toHaveLength(6);

    // Clean canonical wiring triggers 0 faults
    const cleanWires = NET_A.flatMap((n) =>
      n.slice(1).map((t): [string, string] => [n[0], t]),
    );
    expect(matchFaultPatterns(faults, buildNets(comps, cleanWires))).toHaveLength(0);

    // Swapped M and L triggers wm-cc-reversed
    const swappedCC = cleanWires.map(([a, b]): [string, string] => {
      const m = (t: string) => (t === 'wm.M' ? 'wm.L' : t === 'wm.L' ? 'wm.M' : t);
      return [m(a), m(b)];
    });
    expect(
      matchFaultPatterns(faults, buildNets(comps, swappedCC)).map((f) => f.id),
    ).toContain('wm-cc-reversed');
  });

  it('supports wattmeter rated power factor (1.0 and 0.2) and reverse switch sign flip', () => {
    const lpf = evaluateWattmeter(120, 230, 2.0, 300, 2.5, 0, false, 150, 0.2, false);
    // MF = 300 * 2.5 * 0.2 / 150 = 1.0 W/div
    expect(lpf.mf).toBeCloseTo(1.0, 6);
    expect(lpf.dial).toBeCloseTo(120, 6);
    expect(lpf.shownValue).toBeCloseTo(120, 6);
    expect(lpf.reversed).toBe(false);

    // Reverse switch ON flips shown sign & dial negative
    const lpfRev = evaluateWattmeter(120, 230, 2.0, 300, 2.5, 0, false, 150, 0.2, true);
    expect(lpfRev.shownValue).toBeCloseTo(-120, 6);
    expect(lpfRev.dial).toBeCloseTo(-120, 6);
    expect(lpfRev.reversed).toBe(true);
    expect(lpfRev.pointerRatio).toBeLessThan(0);

    // Analog meter with reverse switch / negative value
    const amRev = evaluateAnalogMeter(5.0, 10, 0, { reversed: true });
    expect(amRev.shownValue).toBeCloseTo(-5.0, 6);
    expect(amRev.reversed).toBe(true);
  });

  it('supports ComponentTypeDef.internalLinks as a function of controls', () => {
    const dynamicDef: ComponentTypeDef = {
      ...COMPONENT_DEFS.variac1ph,
      internalLinks: (controls) =>
        controls['va.linkMode'] === 'common' ? [['IN_N', 'OUT_N']] : [],
    };
    const instance: ComponentInstance = {
      id: 'va',
      type: 'variac1ph',
      label: 'Variac',
      position: [0, 0, 0],
      params: {},
    };
    expect(
      resolveComponentInternalLinks(dynamicDef, instance, { 'va.linkMode': 'common' }),
    ).toEqual([['IN_N', 'OUT_N']]);
    expect(
      resolveComponentInternalLinks(dynamicDef, instance, { 'va.linkMode': 'isolated' }),
    ).toEqual([]);
  });

  it('supports 0.1 V variac fine step without integer truncation in controlsStore', () => {
    useControlsStore.getState().initFromControls([
      {
        id: 'va.knob',
        componentId: 'va',
        kind: 'knob',
        label: 'Variac',
        min: 0,
        max: 270,
        step: 1,
        fineStep: 0.1,
        unit: 'V',
        defaultValue: 0,
      },
    ]);
    useControlsStore.getState().stepControlValue('va.knob', 0.1, 0, 270, 0.1);
    useControlsStore.getState().stepControlValue('va.knob', 0.1, 0, 270, 0.1);
    expect(useControlsStore.getState().values['va.knob']).toBe(0.2);
    expect(useControlsStore.getState().variacV).toBe(0.2);
  });

  it('derives deterministic hidden polarity flips and terminal scrambles from session seed', () => {
    const p1 = deriveHiddenPolarity(42, 'tx.secondary');
    const p2 = deriveHiddenPolarity(42, 'tx.secondary');
    expect(p1).toBe(p2);
    expect([1, -1]).toContain(p1);

    const terms = ['U1', 'U2', 'V1', 'V2', 'W1', 'W2'] as const;
    const s1 = deriveHiddenTerminalScramble(101, 'motor.panel', terms);
    const s2 = deriveHiddenTerminalScramble(101, 'motor.panel', terms);
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual([...terms].sort());

    const polarities = Array.from({ length: 20 }, (_, i) =>
      deriveHiddenPolarity(i + 1, 'tx.secondary'),
    );
    expect(polarities).toContain(1);
    expect(polarities).toContain(-1);
  });
});
