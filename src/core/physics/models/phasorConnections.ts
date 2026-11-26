import { getStageHints } from '../../circuit/stages';
import {
  arePhaseGroupsValid,
  buildHalfWindingEdges,
  canonicalPairKey,
  findTrueWindingForPair,
  getCanonicalStageWiresForSeed,
  getScrambledTerminalMap,
  OBSERVE_FIXED_SEED,
  SCRAMBLED_SEC_TERMINALS,
} from '../../phasor/ex3_5Scramble';
import { measureTerminalVoltage, solvePhasorNetwork } from '../../phasor/network';
import type {
  BaseConnectionState,
  FaultPattern,
  MeterReading,
  NetGraphLike,
  PhysicsModel,
  PhysicsSolveInput,
  PhysicsSolveOutput,
  RuntimeEvent,
  StageValidationInput,
  TerminalId,
  ValidationResult,
} from '../../types';
import { evaluateAnalogMeter } from '../meters';

export interface PhasorConnectionsState extends BaseConnectionState {
  stageKind: string;
  supplyOn: boolean;
  variacV: number;
  maxLoopEmfV: number;
  hasLoopFault: boolean;
  topologyOk: boolean;
  starPhaseV: number;
  starLineV: number;
  deltaLineV: number;
  zigzagPhaseV: number;
  zigzagLineV: number;
  probeV: number;
  probeConnected: boolean;
  probeTermA: string;
  probeTermB: string;
}

const DEFAULT_HALF_V = 57.5;
const DEFAULT_BASE_LINE_V = 230;

function wiresFromGraphAndInputs(
  wires: { a: TerminalId; b: TerminalId }[],
  seed: number,
  vaLineV: number,
  baseLineV: number,
  baseHalfV: number,
) {
  const pairs = wires.map((w) => [w.a, w.b] as [TerminalId, TerminalId]);
  const edges = buildHalfWindingEdges(seed, vaLineV, baseLineV, baseHalfV);
  const sol = solvePhasorNetwork(SCRAMBLED_SEC_TERMINALS, edges, pairs, [], 0.5);
  return { edges, sol };
}

function approxEq(val: number, target: number, tol: number): boolean {
  return Math.abs(val - target) <= tol;
}

function checkThreePhaseStageWires(
  stageId: string,
  wires: { a: TerminalId; b: TerminalId }[],
  seed: number,
): {
  ok: boolean;
  hasLoopFault: boolean;
  maxLoopEmfV: number;
  faults: FaultPattern[];
  reason: string;
} {
  const pairs = wires.map((w) => [w.a, w.b] as [TerminalId, TerminalId]);
  const edges = buildHalfWindingEdges(
    seed,
    DEFAULT_BASE_LINE_V,
    DEFAULT_BASE_LINE_V,
    DEFAULT_HALF_V,
  );
  const sol = solvePhasorNetwork(SCRAMBLED_SEC_TERMINALS, edges, pairs, [], 0.5);

  if (sol.hasLoopFault) {
    const maxV = sol.maxLoopEmfV;
    return {
      ok: false,
      hasLoopFault: true,
      maxLoopEmfV: maxV,
      faults: [
        {
          id: 'phasor-loop-fault',
          description: `Closed winding loop has unbalanced EMF (~${maxV.toFixed(1)} V). This will cause heavy circulating current when energised!`,
          match: {},
          effect: 'short',
        },
      ],
      reason: `Closed winding loop has unbalanced EMF (~${maxV.toFixed(1)} V).`,
    };
  }

  // Group terminals by net
  const netMembers = new Map<number, TerminalId[]>();
  const netComponents = new Set<number>();
  for (const t of SCRAMBLED_SEC_TERMINALS) {
    const netId = sol.terminalToNet.get(t)!;
    const list = netMembers.get(netId) ?? [];
    list.push(t);
    netMembers.set(netId, list);
    netComponents.add(sol.netToComponent.get(netId)!);
  }

  const measureNetPair = (netA: number, netB: number) => {
    const tA = netMembers.get(netA)![0];
    const tB = netMembers.get(netB)![0];
    return measureTerminalVoltage(sol, tA, tB).magnitude;
  };

  if (stageId === 'identify-pairs') {
    return {
      ok: true,
      hasLoopFault: false,
      maxLoopEmfV: 0,
      faults: [],
      reason: '',
    };
  }

  if (stageId === 'identify-phases') {
    // Expect 3 separate two-terminal series-aiding joints yielding ~115 V per phase
    const joinedNets = Array.from(netMembers.values()).filter((m) => m.length >= 2);
    if (netComponents.size !== 3 || joinedNets.length !== 3) {
      return {
        ok: false,
        hasLoopFault: false,
        maxLoopEmfV: 0,
        faults: [],
        reason:
          'Connect all three phases in series-aiding pairs (one jumper per phase, 3 separate components) so each phase reads ~115 V across its outer terminals.',
      };
    }
    const { halfWindings } = getScrambledTerminalMap(seed);
    const validPhases = new Set<string>();
    for (const compId of netComponents) {
      const compTerminals = SCRAMBLED_SEC_TERMINALS.filter(
        (t) => sol.netToComponent.get(sol.terminalToNet.get(t)!) === compId,
      );
      if (compTerminals.length !== 4) continue;
      // Open terminals in component have net size 1
      const openTerminals = compTerminals.filter(
        (t) => (netMembers.get(sol.terminalToNet.get(t)!)?.length ?? 0) === 1,
      );
      if (openTerminals.length !== 2) continue;
      const vOuter = measureTerminalVoltage(
        sol,
        openTerminals[0],
        openTerminals[1],
      ).magnitude;
      if (!approxEq(vOuter, 115, 2.0)) continue;
      const matchedPhase = halfWindings.find((hw) =>
        compTerminals.includes(hw.posTerminal),
      )?.phase;
      if (matchedPhase) validPhases.add(matchedPhase);
    }
    const ok = validPhases.size === 3;
    return {
      ok,
      hasLoopFault: false,
      maxLoopEmfV: 0,
      faults: [],
      reason: ok
        ? ''
        : 'Each phase must have its two halves joined in series aiding (~115 V across outer ends, not 0 V opposing or 57.5/99.6 V cross-phase).',
    };
  }

  if (stageId === 'star') {
    // Single galvanic component, 7 nets (1 star neutral of size 3, 3 mid-joints of size 2, 3 line outputs of size 1)
    if (netComponents.size !== 1 || netMembers.size !== 7) {
      return {
        ok: false,
        hasLoopFault: false,
        maxLoopEmfV: 0,
        faults: [],
        reason:
          'Star requires all 12 terminals in one connected circuit with 7 nets: 3 series-aiding mid-joints (2 terminals each), 1 neutral star point (3 terminals), and 3 open line terminals.',
      };
    }
    const starNeutral = Array.from(netMembers.entries()).find(
      ([, m]) => m.length === 3,
    )?.[0];
    const midJoints = Array.from(netMembers.entries()).filter(
      ([, m]) => m.length === 2,
    );
    const lineNets = Array.from(netMembers.entries())
      .filter(([, m]) => m.length === 1)
      .map(([id]) => id);
    if (
      starNeutral === undefined ||
      midJoints.length !== 3 ||
      lineNets.length !== 3
    ) {
      return {
        ok: false,
        hasLoopFault: false,
        maxLoopEmfV: 0,
        faults: [],
        reason:
          'Join the three phases in series aiding (115 V each) and bond one outer terminal of each phase to form the common neutral point.',
      };
    }
    const phaseOk = lineNets.every((ln) => approxEq(measureNetPair(starNeutral, ln), 115, 2.5));
    const linesOk =
      approxEq(measureNetPair(lineNets[0], lineNets[1]), 199.19, 3.0) &&
      approxEq(measureNetPair(lineNets[1], lineNets[2]), 199.19, 3.0) &&
      approxEq(measureNetPair(lineNets[0], lineNets[2]), 199.19, 3.0);

    if (!phaseOk || !linesOk) {
      return {
        ok: false,
        hasLoopFault: false,
        maxLoopEmfV: 0,
        faults: [
          {
            id: 'star-polarity-error',
            description:
              'Asymmetric Star voltages detected — check that all three phases have consistent polarity at the star point and that halves aid (115 V phase, 199.2 V line).',
            match: {},
            effect: 'wrong-reading',
          },
        ],
        reason: 'Phase or line voltages are asymmetric in the Star connection.',
      };
    }
    return { ok: true, hasLoopFault: false, maxLoopEmfV: 0, faults: [], reason: '' };
  }

  if (stageId === 'delta') {
    // Single galvanic component, 6 nets of size 2 each (3 series mid-joints + 3 delta vertices)
    const allSizeTwo = Array.from(netMembers.values()).every((m) => m.length === 2);
    if (netComponents.size !== 1 || netMembers.size !== 6 || !allSizeTwo) {
      return {
        ok: false,
        hasLoopFault: false,
        maxLoopEmfV: 0,
        faults: [],
        reason:
          'Delta requires all 12 terminals in one closed loop of 6 two-terminal joints (3 series-aiding phase joints and 3 delta corner joints).',
      };
    }
    const { terminalToTrue } = getScrambledTerminalMap(seed);
    // Vertex nets connect terminals from DIFFERENT phases
    const vertexNets = Array.from(netMembers.entries())
      .filter(([, members]) => {
        const phases = new Set(members.map((m) => terminalToTrue[m][0]));
        return phases.size === 2;
      })
      .map(([id]) => id);
    if (vertexNets.length !== 3) {
      return {
        ok: false,
        hasLoopFault: false,
        maxLoopEmfV: 0,
        faults: [],
        reason: 'Connect phases head-to-tail (a4-b1, b4-c1, c4-a1) to form 3 delta vertices.',
      };
    }
    const linesOk =
      approxEq(measureNetPair(vertexNets[0], vertexNets[1]), 115, 2.5) &&
      approxEq(measureNetPair(vertexNets[1], vertexNets[2]), 115, 2.5) &&
      approxEq(measureNetPair(vertexNets[0], vertexNets[2]), 115, 2.5);
    return {
      ok: linesOk,
      hasLoopFault: false,
      maxLoopEmfV: 0,
      faults: [],
      reason: linesOk ? '' : 'Delta line voltages do not form a balanced 115 V triangle.',
    };
  }

  if (stageId === 'zigzag') {
    // Single component, 7 nets (1 neutral of size 3, 3 cross-phase leg links of size 2, 3 open lines of size 1)
    if (netComponents.size !== 1 || netMembers.size !== 7) {
      return {
        ok: false,
        hasLoopFault: false,
        maxLoopEmfV: 0,
        faults: [],
        reason:
          'Zig-Zag requires 7 nets: 1 common neutral (3 terminals), 3 cross-phase series links (2 terminals each), and 3 open line terminals.',
      };
    }
    const neutralNet = Array.from(netMembers.entries()).find(
      ([, m]) => m.length === 3,
    )?.[0];
    const legJoints = Array.from(netMembers.entries()).filter(
      ([, m]) => m.length === 2,
    );
    const lineNets = Array.from(netMembers.entries())
      .filter(([, m]) => m.length === 1)
      .map(([id]) => id);
    const { terminalToTrue } = getScrambledTerminalMap(seed);
    const allCrossPhase = legJoints.every(([, members]) => {
      const phases = new Set(members.map((m) => terminalToTrue[m][0]));
      return phases.size === 2;
    });

    if (
      neutralNet === undefined ||
      legJoints.length !== 3 ||
      lineNets.length !== 3 ||
      !allCrossPhase
    ) {
      return {
        ok: false,
        hasLoopFault: false,
        maxLoopEmfV: 0,
        faults: [],
        reason:
          'Connect a1-b1-c1 as neutral and interconnect each leg across two different phases (e.g. a2-b4, b2-c4, c2-a4).',
      };
    }
    const phaseOk = lineNets.every((ln) =>
      approxEq(measureNetPair(neutralNet, ln), 99.59, 2.5),
    );
    const linesOk =
      approxEq(measureNetPair(lineNets[0], lineNets[1]), 172.5, 3.0) &&
      approxEq(measureNetPair(lineNets[1], lineNets[2]), 172.5, 3.0) &&
      approxEq(measureNetPair(lineNets[0], lineNets[2]), 172.5, 3.0);

    if (!phaseOk || !linesOk) {
      return {
        ok: false,
        hasLoopFault: false,
        maxLoopEmfV: 0,
        faults: [
          {
            id: 'zigzag-polarity-error',
            description:
              'Incorrect Zig-Zag leg polarity — phase-to-neutral should be ~99.6 V (57.5*sqrt(3)) and line-to-line ~172.5 V, not 57.5 V.',
            match: {},
            effect: 'wrong-reading',
          },
        ],
        reason:
          'Check polarity of the interconnected second halves: join a2-b4, b2-c4, c2-a4 so each leg subtracts two 120°-displaced halves (~99.6 V phase, ~172.5 V line).',
      };
    }
    return { ok: true, hasLoopFault: false, maxLoopEmfV: 0, faults: [], reason: '' };
  }

  return { ok: true, hasLoopFault: false, maxLoopEmfV: 0, faults: [], reason: '' };
}

export const phasorConnectionsModel: PhysicsModel<PhasorConnectionsState> = {
  id: 'phasor-connections',

  deriveConnectionState(
    nets: NetGraphLike,
    controls,
    stageParams,
    faults = [],
    seed = OBSERVE_FIXED_SEED,
  ): PhasorConnectionsState {
    const supplyOn = Boolean(controls['sup3.switch'] ?? controls['sup.switch']);
    const variacV = Number(controls['va3.knob'] ?? 0);
    const baseLineV = stageParams.primaryLineV ?? DEFAULT_BASE_LINE_V;
    const baseHalfV = stageParams.halfEmfV ?? DEFAULT_HALF_V;
    const stageKindNum = stageParams.stageKind ?? 1;
    const stageKindMap: Record<number, string> = {
      1: 'identify-pairs',
      2: 'identify-phases',
      3: 'star',
      4: 'delta',
      5: 'zigzag',
    };
    const stageKind = stageKindMap[stageKindNum] ?? 'identify-pairs';

    // Reconstruct active wires between the 12 terminals directly from NetGraphLike connectivity
    const activeWires: { a: TerminalId; b: TerminalId }[] = [];
    for (let i = 0; i < SCRAMBLED_SEC_TERMINALS.length; i++) {
      for (let j = i + 1; j < SCRAMBLED_SEC_TERMINALS.length; j++) {
        const ta = SCRAMBLED_SEC_TERMINALS[i];
        const tb = SCRAMBLED_SEC_TERMINALS[j];
        if (nets.areConnected(ta, tb)) {
          activeWires.push({ a: ta, b: tb });
        }
      }
    }

    const { sol } = wiresFromGraphAndInputs(
      activeWires,
      seed,
      variacV,
      baseLineV,
      baseHalfV,
    );

    const probeA = String(controls['probe.a'] ?? '');
    const probeB = String(controls['probe.b'] ?? '');
    const probeConnected =
      Boolean(probeA) &&
      Boolean(probeB) &&
      probeA !== probeB &&
      SCRAMBLED_SEC_TERMINALS.includes(probeA) &&
      SCRAMBLED_SEC_TERMINALS.includes(probeB);

    const probeV =
      supplyOn && variacV > 0 && !sol.hasLoopFault && probeConnected
        ? measureTerminalVoltage(sol, probeA, probeB).magnitude
        : 0;

    // Topology check (at 230V nominal scaling independent of knob)
    const topoCheck = checkThreePhaseStageWires(stageKind, activeWires, seed);

    const scale = variacV / Math.max(1e-6, baseLineV);
    const { trueToTerminal: t } = getScrambledTerminalMap(seed);
    const vFullPhase = baseHalfV * 2 * scale;

    return {
      shorted: sol.hasLoopFault,
      shortFaults: faults.filter((f) => f.effect === 'short'),
      matchedFaultIds: faults.map((f) => f.id),
      energised: supplyOn && variacV > 0 && !sol.hasLoopFault,
      stageKind,
      supplyOn,
      variacV,
      maxLoopEmfV: sol.maxLoopEmfV,
      hasLoopFault: sol.hasLoopFault,
      topologyOk: topoCheck.ok,
      starPhaseV:
        stageKind === 'star' && topoCheck.ok ? vFullPhase : measureTerminalVoltage(sol, t.a1, t.a4).magnitude,
      starLineV: stageKind === 'star' && topoCheck.ok ? vFullPhase * Math.sqrt(3) : 0,
      deltaLineV: stageKind === 'delta' && topoCheck.ok ? vFullPhase : 0,
      zigzagPhaseV: stageKind === 'zigzag' && topoCheck.ok ? baseHalfV * Math.sqrt(3) * scale : 0,
      zigzagLineV: stageKind === 'zigzag' && topoCheck.ok ? baseHalfV * 3 * scale : 0,
      probeV,
      probeConnected,
      probeTermA: probeA,
      probeTermB: probeB,
    };
  },

  solve(input: PhysicsSolveInput<PhasorConnectionsState>): PhysicsSolveOutput {
    const { connectionState, gains, params } = input;
    const events: RuntimeEvent[] = [];

    const mcbTripped =
      connectionState.supplyOn &&
      connectionState.variacV > 0 &&
      connectionState.hasLoopFault;

    if (mcbTripped) {
      events.push({
        id: 'phasor-short-trip',
        severity: 'danger',
        message: `Closed winding loop EMF (${connectionState.maxLoopEmfV.toFixed(1)} V) drove heavy circulating current — 3-phase MCB tripped! Turn off supply and check polarity.`,
      });
    } else if (!connectionState.supplyOn) {
      events.push({
        id: 'supply-off-hint',
        severity: 'info',
        message: 'Three-phase supply switch is OFF. Switch ON sup3 and set the 3-phase variac to 230 V.',
      });
    } else if (connectionState.variacV <= 0) {
      events.push({
        id: 'variac-zero-hint',
        severity: 'info',
        message: 'Set the 3-phase autotransformer knob to 230 V line-to-line before probing terminals.',
      });
    } else if (
      connectionState.probeConnected &&
      connectionState.probeV < 0.25 &&
      connectionState.stageKind === 'identify-pairs'
    ) {
      events.push({
        id: 'probe-open-pair',
        severity: 'info',
        message:
          'Probe reads 0 V — these two terminals belong to different isolated windings (no deflection).',
      });
    }

    const gainErr = gains['probe'] ?? 0;
    const gainFactor = 1 + gainErr;
    const shownProbeV = mcbTripped ? 0 : connectionState.probeV;
    const probeEval = evaluateAnalogMeter(shownProbeV, 300, gainErr);

    const meters: MeterReading[] = [
      {
        id: 'probe',
        label: 'Probe Voltmeter',
        kind: 'voltmeter',
        unit: 'V',
        decimals: 1,
        ...probeEval,
      },
    ];

    const scale = connectionState.variacV / Math.max(1e-6, params.primaryLineV ?? 230);
    const vpShown = mcbTripped ? 0 : (params.halfEmfV ?? 57.5) * 2 * scale * gainFactor;

    const outputs: Record<string, number> = {
      va3V: connectionState.variacV,
      probeV: probeEval.shownValue,
      Vp: Number(vpShown.toFixed(2)),
      starLineV: Number((connectionState.starLineV * gainFactor).toFixed(2)),
      starPhaseV: Number((connectionState.starPhaseV * gainFactor).toFixed(2)),
      deltaLineV: Number((connectionState.deltaLineV * gainFactor).toFixed(2)),
      zigzagPhaseV: Number((connectionState.zigzagPhaseV * gainFactor).toFixed(2)),
      zigzagLineV: Number((connectionState.zigzagLineV * gainFactor).toFixed(2)),
    };

    return {
      meters,
      events,
      mcbTripped,
      runFailed: mcbTripped,
      outputs,
    };
  },

  validateStage(input: StageValidationInput): ValidationResult | null {
    const seed = input.seed ?? OBSERVE_FIXED_SEED;
    const hints = getStageHints({ hints: input.stage.hints ?? [] } as never, input.stage);

    if (input.stage.id === 'identify-pairs') {
      if (input.wires.length > 0) {
        return {
          correct: false,
          matchedNetlistIndex: 0,
          openNets: [],
          shorts: [
            {
              studentNet: [],
              mergedNetIndices: [],
              description:
                'Remove all bench wires in Stage 1 — use only the Probe Voltmeter to identify the 6 isolated half-windings.',
            },
          ],
          extras: [],
          faults: [],
          hintLevelAvailable: hints.length,
        };
      }
      const pairs = input.identification?.pairs ?? [];
      const uniquePairs = new Set(
        pairs.map((p) => canonicalPairKey(p[0], p[1])),
      );
      const validCount = Array.from(uniquePairs).filter((k) => {
        const [a, b] = k.split('|');
        return findTrueWindingForPair(seed, a, b) !== null;
      }).length;
      const correct = validCount === 6 && pairs.length === 6;
      return {
        correct,
        matchedNetlistIndex: 0,
        openNets: correct
          ? []
          : [
              {
                netIndex: 0,
                label: '6 Winding Pairs (W1..W6)',
                category: `${validCount}/6 correct half-winding pairs recorded in the Pairing Panel`,
                missingPairHint: ['tx.T1', 'tx.T2'],
              },
            ],
        shorts: [],
        extras: [],
        faults: [],
        hintLevelAvailable: hints.length,
      };
    }

    const res = checkThreePhaseStageWires(input.stage.id, input.wires, seed);
    let phasePanelIssue: string | null = null;
    if (input.stage.id === 'identify-phases' && input.identification?.phaseGroups !== undefined) {
      const groups = input.identification.phaseGroups.map((pairIds) =>
        pairIds.map((p) => {
          const [a, b] = p.split('|');
          return [a, b] as [TerminalId, TerminalId];
        }),
      );
      if (!arePhaseGroupsValid(seed, groups)) {
        phasePanelIssue =
          'Group the 6 identified winding pairs into 3 matching phases (Phase a, Phase b, Phase c — two same-phase pairs per phase) in the Phase Identification panel.';
      }
    }

    const correct = res.ok && !res.hasLoopFault && phasePanelIssue === null;
    return {
      correct,
      matchedNetlistIndex: 0,
      openNets: correct
        ? []
        : [
            {
              netIndex: 0,
              label: input.stage.title,
              category: phasePanelIssue ?? (res.reason || 'Check your secondary connections'),
              missingPairHint: ['tx.T1', 'tx.T2'],
            },
          ],
      shorts: [],
      extras: [],
      faults: res.faults,
      hintLevelAvailable: hints.length,
    };
  },

  resolveLearnStep(stepId: string, seed: number) {
    const map = getScrambledTerminalMap(seed);
    const t = map.trueToTerminal;
    const allPairs = map.halfWindings.map(
      (hw) => [hw.posTerminal, hw.negTerminal] as [TerminalId, TerminalId],
    );
    const allPhaseGroups = (['a', 'b', 'c'] as const).map((ph) =>
      map.halfWindings
        .filter((hw) => hw.phase === ph)
        .map((hw) => canonicalPairKey(hw.posTerminal, hw.negTerminal)),
    );

    switch (stepId) {
      case 's1-probe-pair':
        return { probeTerminals: [t.a1, t.a2] };
      case 's1-probe-diff':
        return { probeTerminals: [t.a1, t.b1] };
      case 's1-reveal-pairs':
        return { probeTerminals: [t.c3, t.c4], identifiedPairs: allPairs };
      case 's2-series-opp':
        return {
          connectTerminals: [[t.a1, t.a3]],
          probeTerminals: [t.a2, t.a4],
          identifiedPairs: allPairs,
        };
      case 's2-series-aid':
        return {
          disconnectTerminals: [[t.a1, t.a3]],
          connectTerminals: getCanonicalStageWiresForSeed('identify-phases', seed),
          probeTerminals: [t.a1, t.a4],
          identifiedPairs: allPairs,
          identifiedPhases: allPhaseGroups,
        };
      case 's3-wire-star':
        return {
          connectTerminals: getCanonicalStageWiresForSeed('star', seed),
          probeTerminals: [t.a4, t.b4],
          identifiedPairs: allPairs,
          identifiedPhases: allPhaseGroups,
        };
      case 's3-read-star':
        return {
          connectTerminals: getCanonicalStageWiresForSeed('star', seed),
          probeTerminals: [t.a4, t.b4],
          identifiedPairs: allPairs,
          identifiedPhases: allPhaseGroups,
        };
      case 's4-wire-delta':
        return {
          connectTerminals: getCanonicalStageWiresForSeed('delta', seed),
          probeTerminals: [t.a4, t.b4],
          identifiedPairs: allPairs,
          identifiedPhases: allPhaseGroups,
        };
      case 's4-read-delta':
        return {
          connectTerminals: getCanonicalStageWiresForSeed('delta', seed),
          probeTerminals: [t.b4, t.c4],
          identifiedPairs: allPairs,
          identifiedPhases: allPhaseGroups,
        };
      case 's5-wire-zigzag':
        return {
          connectTerminals: getCanonicalStageWiresForSeed('zigzag', seed),
          probeTerminals: [t.b3, t.a1],
          identifiedPairs: allPairs,
          identifiedPhases: allPhaseGroups,
        };
      case 's5-read-zigzag':
        return {
          connectTerminals: getCanonicalStageWiresForSeed('zigzag', seed),
          probeTerminals: [t.b3, t.c3],
          identifiedPairs: allPairs,
          identifiedPhases: allPhaseGroups,
        };
      default:
        return null;
    }
  },
};
