import { describe, expect, it } from 'vitest';
import {
  cAbs,
  cAdd,
  cAngleDeg,
  cPolar,
  cSub,
} from '../core/phasor/complex';
import {
  arePhaseGroupsValid,
  buildHalfWindingEdges,
  canonicalPairKey,
  findTrueWindingForPair,
  getCanonicalStageWiresForSeed,
  getScrambledTerminalMap,
  SCRAMBLED_SEC_TERMINALS,
} from '../core/phasor/ex3_5Scramble';
import {
  measureTerminalVoltage,
  solvePhasorNetwork,
} from '../core/phasor/network';

describe('Phasor complex math & network engine', () => {
  it('computes 3-phase vector sums and Zig-Zag 60° vector combinations accurately', () => {
    const ea = cPolar(57.5, 0);
    const eb = cPolar(57.5, -120);
    const ec = cPolar(57.5, 120);

    const balancedSum = cAdd(cAdd(ea, eb), ec);
    expect(cAbs(balancedSum)).toBeLessThan(1e-9);

    // -Ea + Eb = sqrt(3) * 57.5 ∠ -150° = 99.59 V
    const zzPhase = cSub(eb, ea);
    expect(cAbs(zzPhase)).toBeCloseTo(57.5 * Math.sqrt(3), 2);
    expect(cAngleDeg(zzPhase)).toBeCloseTo(-150, 1);

    // Line-to-line between (-Ea+Eb) and (-Eb+Ec) = 3 * 57.5 = 172.5 V
    const zzC = cSub(ec, eb);
    expect(cAbs(cSub(zzPhase, zzC))).toBeCloseTo(172.5, 2);
  });

  it('solves isolated half-windings as 57.5 V within pair and disconnected (0 V) across pairs', () => {
    const seed = 101;
    const { trueToTerminal: t } = getScrambledTerminalMap(seed);
    const edges = buildHalfWindingEdges(seed, 230, 230, 57.5);
    const sol = solvePhasorNetwork(SCRAMBLED_SEC_TERMINALS, edges, []);

    expect(sol.hasLoopFault).toBe(false);
    const sameHalf = measureTerminalVoltage(sol, t.a1, t.a2);
    expect(sameHalf.connected).toBe(true);
    expect(sameHalf.magnitude).toBeCloseTo(57.5, 2);

    const diffHalf = measureTerminalVoltage(sol, t.a1, t.b1);
    expect(diffHalf.connected).toBe(false);
    expect(diffHalf.magnitude).toBe(0);
  });

  it('distinguishes series-aiding (115 V), series-opposing (0 V), and cross-phase (57.5 V / 99.6 V)', () => {
    const seed = 202601;
    const { trueToTerminal: t } = getScrambledTerminalMap(seed);
    const edges = buildHalfWindingEdges(seed, 230, 230, 57.5);

    const aiding = solvePhasorNetwork(SCRAMBLED_SEC_TERMINALS, edges, [[t.a2, t.a3]]);
    expect(measureTerminalVoltage(aiding, t.a1, t.a4).magnitude).toBeCloseTo(115, 2);

    const opposing = solvePhasorNetwork(SCRAMBLED_SEC_TERMINALS, edges, [[t.a1, t.a3]]);
    expect(measureTerminalVoltage(opposing, t.a2, t.a4).magnitude).toBeCloseTo(0, 4);

    // Different phases with 50 V halves: |Ea + Eb| = 50 V (120°) and |Ea - Eb| = 86.6 V (60°)
    const edges50 = buildHalfWindingEdges(seed, 200, 230, 57.5); // 50 V halves
    const diffSub = solvePhasorNetwork(SCRAMBLED_SEC_TERMINALS, edges50, [[t.a2, t.b3]]);
    expect(measureTerminalVoltage(diffSub, t.a1, t.b4).magnitude).toBeCloseTo(50, 2);

    const diffAdd = solvePhasorNetwork(SCRAMBLED_SEC_TERMINALS, edges50, [[t.a2, t.b4]]);
    expect(measureTerminalVoltage(diffAdd, t.a1, t.b3).magnitude).toBeCloseTo(50 * Math.sqrt(3), 2);
  });

  it('flags KVL loop faults on dead short or wrong-polarity closed delta, and stays fault-free on balanced delta', () => {
    const seed = 555;
    const { trueToTerminal: t } = getScrambledTerminalMap(seed);
    const edges = buildHalfWindingEdges(seed, 230, 230, 57.5);

    // Shorted half winding
    const shortSol = solvePhasorNetwork(SCRAMBLED_SEC_TERMINALS, edges, [[t.a1, t.a2]]);
    expect(shortSol.hasLoopFault).toBe(true);
    expect(shortSol.maxLoopEmfV).toBeCloseTo(57.5, 1);

    // Balanced Delta
    const deltaSol = solvePhasorNetwork(
      SCRAMBLED_SEC_TERMINALS,
      edges,
      getCanonicalStageWiresForSeed('delta', seed),
    );
    expect(deltaSol.hasLoopFault).toBe(false);
    expect(deltaSol.maxLoopEmfV).toBeLessThan(1e-4);

    // Reversed phase c inside closed Delta (c1-a1 instead of c4-a1 -> c reversed!)
    const badDelta = solvePhasorNetwork(SCRAMBLED_SEC_TERMINALS, edges, [
      [t.a2, t.a3],
      [t.b2, t.b3],
      [t.c2, t.c3],
      [t.a4, t.b1],
      [t.b4, t.c4],
      [t.c1, t.a1],
    ]);
    expect(badDelta.hasLoopFault).toBe(true);
    expect(badDelta.maxLoopEmfV).toBeGreaterThan(150);
  });

  it('produces deterministic per-seed scrambles and validates winding pairs & phase groups', () => {
    const m1 = getScrambledTerminalMap(202601);
    const m1Again = getScrambledTerminalMap(202601);
    const m2 = getScrambledTerminalMap(9001);

    expect(m1.terminalToTrue).toEqual(m1Again.terminalToTrue);
    expect(m1.terminalToTrue).not.toEqual(m2.terminalToTrue);

    for (const hw of m1.halfWindings) {
      expect(findTrueWindingForPair(202601, hw.posTerminal, hw.negTerminal)?.id).toBe(hw.id);
    }

    const validGroups = (['a', 'b', 'c'] as const).map((ph) =>
      m1.halfWindings
        .filter((hw) => hw.phase === ph)
        .map((hw) => [hw.posTerminal, hw.negTerminal] as [string, string]),
    );
    expect(arePhaseGroupsValid(202601, validGroups)).toBe(true);

    // Swapping a pair across phase a and phase b breaks grouping
    const badGroups = [
      [validGroups[0][0], validGroups[1][0]],
      [validGroups[0][1], validGroups[1][1]],
      validGroups[2],
    ];
    expect(arePhaseGroupsValid(202601, badGroups)).toBe(false);
    expect(canonicalPairKey('tx.T9', 'tx.T2')).toBe('tx.T2|tx.T9');
  });
});
