import { describe, expect, it } from 'vitest';
import { buildNets, getConnectedNetTerminals } from '../core/circuit/nets';
import type { ComponentInstance, Wire } from '../core/types';

const TEST_COMPONENTS: ComponentInstance[] = [
  { id: 'sup', type: 'acSupply', label: 'Supply', position: [0, 0, 0], params: {} },
  { id: 'va', type: 'variac1ph', label: 'Variac', position: [1, 0, 0], params: {} },
  { id: 'vp', type: 'voltmeter', label: 'Vp', position: [2, 0, 0], params: {} },
];

describe('getConnectedNetTerminals', () => {
  it('returns null when hovered terminal is null or unknown', () => {
    const graph = buildNets(TEST_COMPONENTS, []);
    expect(getConnectedNetTerminals(graph, null)).toBeNull();
    expect(getConnectedNetTerminals(graph, 'unknown.X')).toBeNull();
  });

  it('returns null for an isolated terminal with no wires or internal links', () => {
    const graph = buildNets(TEST_COMPONENTS, []);
    expect(getConnectedNetTerminals(graph, 'sup.P')).toBeNull();
    expect(getConnectedNetTerminals(graph, 'vp.P')).toBeNull();
  });

  it('returns internally linked terminals even without external wires', () => {
    const graph = buildNets(TEST_COMPONENTS, []);
    const connected = getConnectedNetTerminals(graph, 'va.IN_N');
    expect(connected).not.toBeNull();
    expect(Array.from(connected!).sort()).toEqual(['va.IN_N', 'va.OUT_N']);
  });

  it('returns all transitively connected terminals across wires and internal links', () => {
    const wires: Wire[] = [
      { id: 'w1', a: 'sup.N', b: 'va.IN_N' },
      { id: 'w2', a: 'va.OUT_N', b: 'vp.N' },
    ];
    const graph = buildNets(TEST_COMPONENTS, wires);

    const fromSup = getConnectedNetTerminals(graph, 'sup.N');
    expect(Array.from(fromSup!).sort()).toEqual([
      'sup.N',
      'va.IN_N',
      'va.OUT_N',
      'vp.N',
    ]);

    const fromVp = getConnectedNetTerminals(graph, 'vp.N');
    expect(Array.from(fromVp!).sort()).toEqual([
      'sup.N',
      'va.IN_N',
      'va.OUT_N',
      'vp.N',
    ]);

    expect(getConnectedNetTerminals(graph, 'sup.P')).toBeNull();
  });
});
