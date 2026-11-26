import { describe, expect, it } from 'vitest';
import { buildFeedback } from '../core/circuit/feedback';
import { validateWiring } from '../core/circuit/validate';
import { ex3_1, NET_A } from '../core/experiments/ex3_1';
import { netlistToWirePairs } from '../core/experiments/registry';

const CANONICAL_WIRES = netlistToWirePairs(NET_A);

describe('buildFeedback and progressive hints', () => {
  it('returns success feedback with no faults or categories when wiring passes', () => {
    const res = validateWiring(ex3_1, CANONICAL_WIRES);
    const fb = buildFeedback(ex3_1, res, 0);
    expect(fb.correct).toBe(true);
    expect(fb.categoryMessages).toHaveLength(0);
    expect(fb.faultMessages).toHaveLength(0);
    expect(fb.terminalPairHint).toBeNull();
  });

  it('groups open nets by category and hides exact terminals before hint level 6', () => {
    const missingTwo = CANONICAL_WIRES.filter(
      ([a, b]) =>
        !(a === 'wm.L' && b === 'tx.P1') && !(a === 'va.OUT_N' && b === 'tx.P2'),
    );
    const res = validateWiring(ex3_1, missingTwo);

    for (let level = 0; level <= 5; level++) {
      const fb = buildFeedback(ex3_1, res, level);
      expect(fb.correct).toBe(false);
      // Both missing nets belong to 'primary' so category deduplicates to one message
      expect(fb.categoryMessages).toContain('The primary side is incomplete.');
      expect(fb.terminalPairHint).toBeNull();
      expect(fb.revealedHints).toHaveLength(level);
      expect(fb.remainingHints).toBe(6 - level);
      const joined = [
        fb.summary,
        ...fb.categoryMessages,
        ...fb.revealedHints,
      ].join(' ');
      expect(joined).not.toContain('tx.P1');
      expect(joined).not.toContain('tx.P2');
      expect(joined).not.toContain('wm.L');
    }
  });

  it('reveals the first open net terminal pair only at the final hint level (6)', () => {
    const missingOne = CANONICAL_WIRES.filter(
      ([a, b]) => !(a === 'am.OUT' && b === 'ld.A'),
    );
    const res = validateWiring(ex3_1, missingOne);
    const fb5 = buildFeedback(ex3_1, res, 5);
    expect(fb5.terminalPairHint).toBeNull();
    expect(fb5.remainingHints).toBe(1);

    const fb6 = buildFeedback(ex3_1, res, 6);
    expect(fb6.remainingHints).toBe(0);
    expect(fb6.terminalPairHint).toEqual(['am.OUT', 'ld.A']);
  });

  it('includes Spec Section 5 fault feedback messages', () => {
    const swapped = CANONICAL_WIRES.map(([a, b]): [string, string] => {
      const m = (t: string) =>
        t === 'wm.M' ? 'wm.L' : t === 'wm.L' ? 'wm.M' : t;
      return [m(a), m(b)];
    });
    const res = validateWiring(ex3_1, swapped);
    const fb = buildFeedback(ex3_1, res, 0);
    expect(fb.faultMessages).toContain(
      'The wattmeter current coil is the wrong way round. M faces the mains, L faces the load.',
    );
  });
});
