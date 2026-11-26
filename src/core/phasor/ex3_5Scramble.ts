import { wiresFromNetlist, type WireInput } from '../circuit/nets';
import { deriveHiddenTerminalScramble } from '../physics/meters';
import type { Net, TerminalId, WireEndpointPair } from '../types';
import { cPolar } from './complex';
import type { PhasorEdge } from './network';

export const OBSERVE_FIXED_SEED = 202601;
export const EX3_5_SCRAMBLE_SALT = 'ex3.5.terminals';

export const SCRAMBLED_SEC_TERMINALS: readonly TerminalId[] = [
  'tx.T1',
  'tx.T2',
  'tx.T3',
  'tx.T4',
  'tx.T5',
  'tx.T6',
  'tx.T7',
  'tx.T8',
  'tx.T9',
  'tx.T10',
  'tx.T11',
  'tx.T12',
] as const;

export const TRUE_SEC_LABELS = [
  'a1',
  'a2',
  'a3',
  'a4',
  'b1',
  'b2',
  'b3',
  'b4',
  'c1',
  'c2',
  'c3',
  'c4',
] as const;

export type TrueSecLabel = (typeof TRUE_SEC_LABELS)[number];
export type PhaseLetter = 'a' | 'b' | 'c';

export interface TrueHalfWindingTemplate {
  id: string;
  phase: PhaseLetter;
  half: 1 | 2;
  posLabel: TrueSecLabel;
  negLabel: TrueSecLabel;
  angleDeg: number;
}

export const HALF_WINDING_TEMPLATES: readonly TrueHalfWindingTemplate[] = [
  { id: 'a_h1', phase: 'a', half: 1, posLabel: 'a1', negLabel: 'a2', angleDeg: 0 },
  { id: 'a_h2', phase: 'a', half: 2, posLabel: 'a3', negLabel: 'a4', angleDeg: 0 },
  { id: 'b_h1', phase: 'b', half: 1, posLabel: 'b1', negLabel: 'b2', angleDeg: -120 },
  { id: 'b_h2', phase: 'b', half: 2, posLabel: 'b3', negLabel: 'b4', angleDeg: -120 },
  { id: 'c_h1', phase: 'c', half: 1, posLabel: 'c1', negLabel: 'c2', angleDeg: 120 },
  { id: 'c_h2', phase: 'c', half: 2, posLabel: 'c3', negLabel: 'c4', angleDeg: 120 },
] as const;

export interface ResolvedHalfWinding extends TrueHalfWindingTemplate {
  posTerminal: TerminalId;
  negTerminal: TerminalId;
}

export interface ScrambledTerminalMap {
  seed: number;
  terminalToTrue: Record<TerminalId, TrueSecLabel>;
  trueToTerminal: Record<TrueSecLabel, TerminalId>;
  halfWindings: ResolvedHalfWinding[];
}

export function canonicalPairKey(a: TerminalId, b: TerminalId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getScrambledTerminalMap(
  seed: number,
  salt = EX3_5_SCRAMBLE_SALT,
): ScrambledTerminalMap {
  const permuted = deriveHiddenTerminalScramble(seed, salt, [
    ...TRUE_SEC_LABELS,
  ]) as TrueSecLabel[];

  const terminalToTrue: Record<TerminalId, TrueSecLabel> = {};
  const trueToTerminal = {} as Record<TrueSecLabel, TerminalId>;

  SCRAMBLED_SEC_TERMINALS.forEach((termId, idx) => {
    const trueLabel = permuted[idx];
    terminalToTrue[termId] = trueLabel;
    trueToTerminal[trueLabel] = termId;
  });

  const halfWindings: ResolvedHalfWinding[] = HALF_WINDING_TEMPLATES.map(
    (tpl) => ({
      ...tpl,
      posTerminal: trueToTerminal[tpl.posLabel],
      negTerminal: trueToTerminal[tpl.negLabel],
    }),
  );

  return {
    seed,
    terminalToTrue,
    trueToTerminal,
    halfWindings,
  };
}

export function findTrueWindingForPair(
  seed: number,
  a: TerminalId,
  b: TerminalId,
): ResolvedHalfWinding | null {
  const { halfWindings } = getScrambledTerminalMap(seed);
  const key = canonicalPairKey(a, b);
  return (
    halfWindings.find(
      (hw) => canonicalPairKey(hw.posTerminal, hw.negTerminal) === key,
    ) ?? null
  );
}

/**
 * Builds complex EMF edges for all 6 half-windings of transformer3ph at a given
 * primary line-to-line voltage (default nominal 230 V -> 57.5 V per half-winding).
 */
export function buildHalfWindingEdges(
  seed: number,
  vaLineV: number,
  basePrimaryLineV = 230,
  baseHalfV = 57.5,
): PhasorEdge[] {
  const { halfWindings } = getScrambledTerminalMap(seed);
  const halfMag = baseHalfV * (vaLineV / Math.max(1e-6, basePrimaryLineV));
  return halfWindings.map((hw) => ({
    id: hw.id,
    a: hw.posTerminal,
    b: hw.negTerminal,
    emf: cPolar(halfMag, hw.angleDeg),
    label: `${hw.posLabel}-${hw.negLabel}`,
  }));
}

/**
 * Canonical nets for stages 2..5 resolved for a given session seed.
 */
export function getCanonicalStageNetsForSeed(
  stageId: string,
  seed: number,
): Net[] {
  const { trueToTerminal: t } = getScrambledTerminalMap(seed);
  if (stageId === 'identify-phases') {
    // Series aiding each phase: a2-a3, b2-b3, c2-c3
    return [
      [t.a2, t.a3],
      [t.b2, t.b3],
      [t.c2, t.c3],
    ];
  }
  if (stageId === 'star') {
    // Fig. 3.5.1: Star point a1-b1-c1; phase halves in series aiding a2-a3, b2-b3, c2-c3
    return [
      [t.a1, t.b1, t.c1],
      [t.a2, t.a3],
      [t.b2, t.b3],
      [t.c2, t.c3],
    ];
  }
  if (stageId === 'delta') {
    // Fig. 3.5.2: Series aiding a2-a3, b2-b3, c2-c3; closed delta a4-b1, b4-c1, c4-a1
    return [
      [t.a2, t.a3],
      [t.b2, t.b3],
      [t.c2, t.c3],
      [t.a4, t.b1],
      [t.b4, t.c1],
      [t.c4, t.a1],
    ];
  }
  if (stageId === 'zigzag') {
    // Fig. 3.5.3: Neutral a1-b1-c1; interconnected legs a2-b4, b2-c4, c2-a4 (outputs b3, c3, a3)
    return [
      [t.a1, t.b1, t.c1],
      [t.a2, t.b4],
      [t.b2, t.c4],
      [t.c2, t.a4],
    ];
  }
  return [];
}

export function getCanonicalStageWiresForSeed(
  stageId: string,
  seed: number,
): WireEndpointPair[] {
  return wiresFromNetlist(getCanonicalStageNetsForSeed(stageId, seed), []);
}

/**
 * Checks if student phase groupings partition the 6 half-windings into 3 valid
 * same-phase pairs (e.g. [a_h1, a_h2], [b_h1, b_h2], [c_h1, c_h2] in any order).
 */
export function arePhaseGroupsValid(
  seed: number,
  groups: [TerminalId, TerminalId][][],
): boolean {
  if (groups.length !== 3) return false;
  const { halfWindings } = getScrambledTerminalMap(seed);
  const seenWindings = new Set<string>();
  const seenPhases = new Set<PhaseLetter>();

  for (const group of groups) {
    if (group.length !== 2) return false;
    const hw0 = halfWindings.find(
      (hw) =>
        canonicalPairKey(hw.posTerminal, hw.negTerminal) ===
        canonicalPairKey(group[0][0], group[0][1]),
    );
    const hw1 = halfWindings.find(
      (hw) =>
        canonicalPairKey(hw.posTerminal, hw.negTerminal) ===
        canonicalPairKey(group[1][0], group[1][1]),
    );
    if (!hw0 || !hw1) return false;
    if (hw0.id === hw1.id || hw0.phase !== hw1.phase) return false;
    seenWindings.add(hw0.id);
    seenWindings.add(hw1.id);
    seenPhases.add(hw0.phase);
  }
  return seenWindings.size === 6 && seenPhases.size === 3;
}

/**
 * Computes terminal badge text for the 12 transformer3ph secondary posts based on
 * the current identification state without baking experiment IDs into UI components.
 */
export function resolveScrambledTerminalLabels(
  seed: number,
  identifiedPairs: [TerminalId, TerminalId][],
  phasesIdentified: boolean,
): Record<TerminalId, string> {
  const labels: Record<TerminalId, string> = {};
  const { terminalToTrue } = getScrambledTerminalMap(seed);

  if (phasesIdentified) {
    for (const termId of SCRAMBLED_SEC_TERMINALS) {
      const short = termId.replace(/^tx\./, '');
      labels[termId] = `${short} (${terminalToTrue[termId]})`;
    }
    return labels;
  }

  // Sort identified pairs deterministically by earliest terminal index so W1..W6 are stable
  const pairIndex = new Map<TerminalId, number>();
  identifiedPairs.forEach((pair, idx) => {
    const tag = idx + 1;
    pairIndex.set(pair[0], tag);
    pairIndex.set(pair[1], tag);
  });

  for (const termId of SCRAMBLED_SEC_TERMINALS) {
    const short = termId.replace(/^tx\./, '');
    const wNum = pairIndex.get(termId);
    labels[termId] = wNum !== undefined ? `${short} · W${wNum}` : short;
  }
  return labels;
}

export function wiresToPairs(wires: readonly WireInput[]): WireEndpointPair[] {
  return wires.map((w) => (Array.isArray(w) ? w : [w.a, w.b]));
}
