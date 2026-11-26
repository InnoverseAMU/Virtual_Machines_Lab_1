import { getStageHints } from '../../circuit/stages';
import { cAbs, cPolar, cSub, type Complex } from '../../phasor/complex';

const cScale = (c: Complex, k: number): Complex => ({ re: c.re * k, im: c.im * k });
import {
  measureTerminalVoltage,
  solvePhasorNetwork,
  type PhasorEdge,
} from '../../phasor/network';
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
  WireEndpointPair,
} from '../../types';
import { evaluateAnalogMeter } from '../meters';

const STAGE1_ALL_TERMINALS: readonly TerminalId[] = [
  'sup3.A',
  'sup3.B',
  'sup3.C',
  'sup3.N',
  'va3.IN_A',
  'va3.IN_B',
  'va3.IN_C',
  'va3.OUT_A',
  'va3.OUT_B',
  'va3.OUT_C',
  'tx.A',
  'tx.B',
  'tx.C',
  'tx.a1',
  'tx.a2',
  'tx.a3',
  'tx.a4',
  'tx.b1',
  'tx.b2',
  'tx.b3',
  'tx.b4',
  'tx.c1',
  'tx.c2',
  'tx.c3',
  'tx.c4',
];

const STAGE3_ALL_TERMINALS: readonly TerminalId[] = [
  'sup3.A',
  'sup3.B',
  'sup3.C',
  'sup3.N',
  'va3.IN_A',
  'va3.IN_B',
  'va3.IN_C',
  'va3.OUT_A',
  'va3.OUT_B',
  'va3.OUT_C',
  'txM.B1',
  'txM.M',
  'txM.B2',
  'txM.b1',
  'txM.b2',
  'txT.A1',
  'txT.A2',
  'txT.a1',
  'txT.a2',
];

export interface PhaseTransformationState extends BaseConnectionState {
  stageKind: 1 | 2 | 3;
  supplyOn: boolean;
  variacV: number;
  hasLoopFault: boolean;
  maxLoopEmfV: number;
  primaryEnergised: boolean;
  scottCenterTapOk: boolean;
  scottCenterTapMiss: boolean;
  teaserReversed: boolean;
  probeV: number;
  probeConnected: boolean;
  // Computed live phasor magnitudes
  Va1a4: number;
  Vb1b4: number;
  Vc1c4: number;
  Va1c1: number;
  VdoubleStarPhase: number;
  VdoubleStarAdj: number;
  VdoubleStarOpp: number;
  VAB: number;
  VBC: number;
  VCA: number;
  VB1B2: number;
  VA1A2: number;
  Va1a2: number;
  Vb1b2: number;
  Va1b1: number;
  scottPhaseAngleDiffDeg: number;
}

function reconstructWires(
  terminals: readonly TerminalId[],
  nets: NetGraphLike,
): WireEndpointPair[] {
  const wires: WireEndpointPair[] = [];
  for (let i = 0; i < terminals.length; i++) {
    for (let j = i + 1; j < terminals.length; j++) {
      if (nets.areConnected(terminals[i], terminals[j])) {
        wires.push([terminals[i], terminals[j]]);
      }
    }
  }
  return wires;
}

function buildSupplyAndVariacEdges(variacV: number, supplyLineV = 230): PhasorEdge[] {
  // Positive sequence potentials such that V(B) - V(C) = V_L ∠ 180°, V(A) - M = (sqrt(3)/2)V_L ∠ 90°
  // => V_A = Vph ∠ 90°, V_B = Vph ∠ -150°, V_C = Vph ∠ -30° where Vph = V_L / sqrt(3)
  const vL = variacV;
  const eS_AB = cSub(
    cPolar(supplyLineV / Math.sqrt(3), 90),
    cPolar(supplyLineV / Math.sqrt(3), -150),
  );
  const eS_BC = cSub(
    cPolar(supplyLineV / Math.sqrt(3), -150),
    cPolar(supplyLineV / Math.sqrt(3), -30),
  );
  const eV_AB = cSub(
    cPolar(vL / Math.sqrt(3), 90),
    cPolar(vL / Math.sqrt(3), -150),
  );
  const eV_BC = cSub(
    cPolar(vL / Math.sqrt(3), -150),
    cPolar(vL / Math.sqrt(3), -30),
  );
  return [
    { id: 'sup-ab', a: 'sup3.A', b: 'sup3.B', emf: eS_AB },
    { id: 'sup-bc', a: 'sup3.B', b: 'sup3.C', emf: eS_BC },
    { id: 'va-ab', a: 'va3.OUT_A', b: 'va3.OUT_B', emf: eV_AB },
    { id: 'va-bc', a: 'va3.OUT_B', b: 'va3.OUT_C', emf: eV_BC },
  ];
}

function areAllThreePhasesSupplied(
  wires: WireEndpointPair[],
  targetA: TerminalId,
  targetB: TerminalId,
  targetC: TerminalId,
  allTerms: readonly TerminalId[],
): { supToVariacOk: boolean; variacToLoadOk: boolean; variacBypassed: boolean } {
  const netOnly = solvePhasorNetwork(allTerms, [], wires, [], 0.5);
  const same = (x: TerminalId, y: TerminalId) =>
    netOnly.terminalToNet.get(x) !== undefined &&
    netOnly.terminalToNet.get(x) === netOnly.terminalToNet.get(y);

  const supToVariacOk =
    same('sup3.A', 'va3.IN_A') &&
    same('sup3.B', 'va3.IN_B') &&
    same('sup3.C', 'va3.IN_C');

  const variacToLoadOk =
    same('va3.OUT_A', targetA) &&
    (same('va3.OUT_B', targetB) || same('va3.OUT_B', targetC)) &&
    (same('va3.OUT_C', targetC) || same('va3.OUT_C', targetB)) &&
    netOnly.terminalToNet.get(targetB) !== netOnly.terminalToNet.get(targetC);

  const variacBypassed =
    same('sup3.A', targetA) ||
    same('sup3.B', targetB) ||
    same('sup3.C', targetC);

  return { supToVariacOk, variacToLoadOk, variacBypassed };
}

export function solveStage1Or2(
  wires: WireEndpointPair[],
  variacV: number,
  baseLineV: number,
  baseHalfV: number,
) {
  const baseEdges = buildSupplyAndVariacEdges(variacV, baseLineV);
  const { supToVariacOk, variacToLoadOk } = areAllThreePhasesSupplied(
    wires,
    'tx.A',
    'tx.B',
    'tx.C',
    STAGE1_ALL_TERMINALS,
  );
  const primaryEnergised = supToVariacOk && variacToLoadOk;

  const edges: PhasorEdge[] = [...baseEdges];
  if (primaryEnergised) {
    const halfMag = baseHalfV * (variacV / Math.max(1e-6, baseLineV));
    const phases: Array<[TerminalId, TerminalId, TerminalId, TerminalId, number]> = [
      ['tx.a1', 'tx.a2', 'tx.a3', 'tx.a4', 0],
      ['tx.b1', 'tx.b2', 'tx.b3', 'tx.b4', -120],
      ['tx.c1', 'tx.c2', 'tx.c3', 'tx.c4', 120],
    ];
    phases.forEach(([p1, p2, p3, p4, ang], idx) => {
      const emf = cPolar(halfMag, ang);
      edges.push({ id: `sec-h1-${idx}`, a: p1, b: p2, emf });
      edges.push({ id: `sec-h2-${idx}`, a: p3, b: p4, emf });
    });
  }

  const sol = solvePhasorNetwork(STAGE1_ALL_TERMINALS, edges, wires, [], 0.5);
  return { sol, primaryEnergised };
}

export function solveStage3Scott(
  wires: WireEndpointPair[],
  variacV: number,
  baseLineV: number,
  ratioMain = 2.0,
  ratioTeaser = Math.sqrt(3),
) {
  const priCheck = areAllThreePhasesSupplied(
    wires,
    'txT.A1',
    'txM.B1',
    'txM.B2',
    STAGE3_ALL_TERMINALS,
  );
  const netOnly = solvePhasorNetwork(STAGE3_ALL_TERMINALS, [], wires, [], 0.5);
  const same = (x: TerminalId, y: TerminalId) =>
    netOnly.terminalToNet.get(x) !== undefined &&
    netOnly.terminalToNet.get(x) === netOnly.terminalToNet.get(y);

  const primaryEdges = buildSupplyAndVariacEdges(variacV, baseLineV);
  const pass1 = solvePhasorNetwork(STAGE3_ALL_TERMINALS, primaryEdges, wires, [], 0.5);

  const primaryEnergised =
    priCheck.supToVariacOk &&
    priCheck.variacToLoadOk &&
    !pass1.hasLoopFault;

  const edgesWithMain: PhasorEdge[] = [...primaryEdges];
  if (priCheck.supToVariacOk) {
    const vPriM = measureTerminalVoltage(pass1, 'txM.B1', 'txM.B2');
    const vB1M = measureTerminalVoltage(pass1, 'txM.B1', 'txM.M');
    const vMB2 = measureTerminalVoltage(pass1, 'txM.M', 'txM.B2');
    if (vPriM.connected && cAbs(vPriM.phasor) > 1e-3) {
      const halfMain = cScale(vPriM.phasor, 0.5);
      edgesWithMain.push({ id: 'txM-p1', a: 'txM.B1', b: 'txM.M', emf: halfMain });
      edgesWithMain.push({ id: 'txM-p2', a: 'txM.M', b: 'txM.B2', emf: halfMain });
      edgesWithMain.push({
        id: 'txM-sec',
        a: 'txM.b1',
        b: 'txM.b2',
        emf: cScale(vPriM.phasor, 1 / ratioMain),
      });
    } else if (vB1M.connected && cAbs(vB1M.phasor) > 1e-3) {
      // Fault: full supply across B1-M half-winding only -> 2x flux/V!
      edgesWithMain.push({ id: 'txM-p1', a: 'txM.B1', b: 'txM.M', emf: vB1M.phasor });
      edgesWithMain.push({ id: 'txM-p2', a: 'txM.M', b: 'txM.B2', emf: vB1M.phasor });
      edgesWithMain.push({
        id: 'txM-sec',
        a: 'txM.b1',
        b: 'txM.b2',
        emf: cScale(vB1M.phasor, 2 / ratioMain),
      });
    } else if (vMB2.connected && cAbs(vMB2.phasor) > 1e-3) {
      // Fault: full supply across M-B2 half-winding only -> 2x flux/V!
      edgesWithMain.push({ id: 'txM-p1', a: 'txM.B1', b: 'txM.M', emf: vMB2.phasor });
      edgesWithMain.push({ id: 'txM-p2', a: 'txM.M', b: 'txM.B2', emf: vMB2.phasor });
      edgesWithMain.push({
        id: 'txM-sec',
        a: 'txM.b1',
        b: 'txM.b2',
        emf: cScale(vMB2.phasor, 2 / ratioMain),
      });
    }
  }

  const pass2 = solvePhasorNetwork(STAGE3_ALL_TERMINALS, edgesWithMain, wires, [], 0.5);
  const edgesFull: PhasorEdge[] = [...edgesWithMain];
  let scottAngleDiffDeg = 0;

  if (priCheck.supToVariacOk && !pass2.hasLoopFault) {
    const vPriT = measureTerminalVoltage(pass2, 'txT.A1', 'txT.A2');
    const vPriM = measureTerminalVoltage(pass2, 'txM.B1', 'txM.B2');
    if (vPriT.connected && cAbs(vPriT.phasor) > 1e-3) {
      edgesFull.push({
        id: 'txT-sec',
        a: 'txT.a1',
        b: 'txT.a2',
        emf: cScale(vPriT.phasor, 1 / ratioTeaser),
      });
      if (vPriM.connected && cAbs(vPriM.phasor) > 1e-3) {
        const angT = Math.atan2(vPriT.phasor.im, vPriT.phasor.re) * (180 / Math.PI);
        const angM = Math.atan2(vPriM.phasor.im, vPriM.phasor.re) * (180 / Math.PI);
        let diff = Math.abs(angT - angM) % 360;
        if (diff > 180) diff = 360 - diff;
        scottAngleDiffDeg = diff;
      }
    }
  }

  const sol = solvePhasorNetwork(STAGE3_ALL_TERMINALS, edgesFull, wires, [], 0.5);
  const scottCenterTapOk = same('txT.A2', 'txM.M') && primaryEnergised;
  const teaserReversed = same('txT.a1', 'txM.b2') || same('txT.a2', 'txM.b1');
  const scottCenterTapMiss =
    primaryEnergised && !same('txT.A2', 'txM.M') &&
    (same('txT.A2', 'txM.B1') || same('txT.A2', 'txM.B2'));

  return {
    sol,
    primaryEnergised,
    scottCenterTapOk,
    scottCenterTapMiss,
    teaserReversed,
    scottAngleDiffDeg,
  };
}

export const phaseTransformationModel: PhysicsModel<PhaseTransformationState> = {
  id: 'phase-transformation',

  deriveConnectionState(
    nets: NetGraphLike,
    controls,
    stageParams,
    faults = [],
  ): PhaseTransformationState {
    const supplyOn = Boolean(controls['sup3.switch'] ?? controls['sup.switch']);
    const variacV = Number(controls['va3.knob'] ?? 0);
    const stageKind = (stageParams.stageKind ?? 1) as 1 | 2 | 3;
    const baseLineV = stageParams.primaryLineV ?? 230;
    const baseHalfV = stageParams.halfEmfV ?? 57.5;
    const ratioMain = stageParams.ratioMain ?? 2.0;
    const ratioTeaser = stageParams.ratioTeaser ?? Math.sqrt(3);

    const effectiveV = supplyOn ? variacV : 0;
    const probeA = String(controls['probe.a'] ?? '');
    const probeB = String(controls['probe.b'] ?? '');
    const termPool = stageKind === 3 ? STAGE3_ALL_TERMINALS : STAGE1_ALL_TERMINALS;
    const wires = reconstructWires(termPool, nets);
    const probeConnected =
      Boolean(probeA) &&
      Boolean(probeB) &&
      probeA !== probeB &&
      termPool.includes(probeA) &&
      termPool.includes(probeB);

    if (stageKind === 3) {
      const scott = solveStage3Scott(
        wires,
        effectiveV,
        baseLineV,
        ratioMain,
        ratioTeaser,
      );
      const m = (a: TerminalId, b: TerminalId) =>
        supplyOn && variacV > 0 && !scott.sol.hasLoopFault
          ? measureTerminalVoltage(scott.sol, a, b).magnitude
          : 0;
      return {
        shorted: scott.sol.hasLoopFault,
        shortFaults: faults.filter((f) => f.effect === 'short'),
        matchedFaultIds: faults.map((f) => f.id),
        energised: supplyOn && variacV > 0 && !scott.sol.hasLoopFault && scott.primaryEnergised,
        stageKind,
        supplyOn,
        variacV,
        hasLoopFault: scott.sol.hasLoopFault,
        maxLoopEmfV: scott.sol.maxLoopEmfV,
        primaryEnergised: scott.primaryEnergised,
        scottCenterTapOk: scott.scottCenterTapOk,
        scottCenterTapMiss: scott.scottCenterTapMiss,
        teaserReversed: scott.teaserReversed,
        probeV: probeConnected ? m(probeA, probeB) : 0,
        probeConnected,
        Va1a4: 0,
        Vb1b4: 0,
        Vc1c4: 0,
        Va1c1: 0,
        VdoubleStarPhase: 0,
        VdoubleStarAdj: 0,
        VdoubleStarOpp: 0,
        VAB: m('va3.OUT_A', 'va3.OUT_B'),
        VBC: m('va3.OUT_B', 'va3.OUT_C'),
        VCA: m('va3.OUT_C', 'va3.OUT_A'),
        VB1B2: m('txM.B1', 'txM.B2'),
        VA1A2: m('txT.A1', 'txT.A2'),
        Va1a2: m('txT.a1', 'txT.a2'),
        Vb1b2: m('txM.b1', 'txM.b2'),
        Va1b1: m('txT.a1', 'txM.b1'),
        scottPhaseAngleDiffDeg: scott.scottAngleDiffDeg,
      };
    }

    const { sol, primaryEnergised } = solveStage1Or2(
      wires,
      effectiveV,
      baseLineV,
      baseHalfV,
    );
    const m = (a: TerminalId, b: TerminalId) =>
      supplyOn && variacV > 0 && !sol.hasLoopFault
        ? measureTerminalVoltage(sol, a, b).magnitude
        : 0;

    return {
      shorted: sol.hasLoopFault,
      shortFaults: faults.filter((f) => f.effect === 'short'),
      matchedFaultIds: faults.map((f) => f.id),
      energised: supplyOn && variacV > 0 && !sol.hasLoopFault && primaryEnergised,
      stageKind,
      supplyOn,
      variacV,
      hasLoopFault: sol.hasLoopFault,
      maxLoopEmfV: sol.maxLoopEmfV,
      primaryEnergised,
      scottCenterTapOk: false,
      scottCenterTapMiss: false,
      teaserReversed: false,
      probeV: probeConnected ? m(probeA, probeB) : 0,
      probeConnected,
      Va1a4: m('tx.a1', 'tx.a4'),
      Vb1b4: m('tx.b1', 'tx.b4'),
      Vc1c4: m('tx.c1', 'tx.c4'),
      Va1c1: m('tx.a1', 'tx.c1'),
      VdoubleStarPhase: m('tx.a2', 'tx.a1'),
      VdoubleStarAdj: m('tx.a1', 'tx.b4'),
      VdoubleStarOpp: m('tx.a1', 'tx.a4'),
      VAB: m('va3.OUT_A', 'va3.OUT_B'),
      VBC: m('va3.OUT_B', 'va3.OUT_C'),
      VCA: m('va3.OUT_C', 'va3.OUT_A'),
      VB1B2: 0,
      VA1A2: 0,
      Va1a2: 0,
      Vb1b2: 0,
      Va1b1: 0,
      scottPhaseAngleDiffDeg: 0,
    };
  },

  solve(input: PhysicsSolveInput<PhaseTransformationState>): PhysicsSolveOutput {
    const { connectionState: cs, gains } = input;
    const events: RuntimeEvent[] = [];

    const mcbTripped = cs.supplyOn && cs.variacV > 0 && cs.hasLoopFault;

    if (mcbTripped) {
      events.push({
        id: 'phasor-short-trip',
        severity: 'danger',
        message: `Closed winding or supply loop EMF (~${cs.maxLoopEmfV.toFixed(1)} V) drove heavy circulating current — 3φ MCB tripped! Shut off power and inspect connections.`,
      });
    } else if (!cs.supplyOn) {
      events.push({
        id: 'supply-off-hint',
        severity: 'info',
        message: 'Three-phase supply switch is OFF. Switch ON sup3 and adjust va3 to 230 V.',
      });
    } else if (cs.variacV <= 0) {
      events.push({
        id: 'variac-zero-hint',
        severity: 'info',
        message: 'Increase 3φ autotransformer va3 to 230 V line-to-line.',
      });
    } else if (!cs.primaryEnergised) {
      events.push({
        id: 'primary-open-hint',
        severity: 'warning',
        message: 'Check primary connections from sup3 -> va3 -> transformer primary terminals.',
      });
    } else if (cs.stageKind === 3 && cs.scottCenterTapMiss) {
      events.push({
        id: 'scott-wrong-tap',
        severity: 'warning',
        message:
          'Teaser A2 is not on main center tap M! VAM rises to ~230 V and is no longer 90° to VBC, unbalancing the 2-phase output.',
      });
    } else if (cs.stageKind === 3 && cs.teaserReversed) {
      events.push({
        id: 'scott-teaser-reversed',
        severity: 'warning',
        message:
          'Teaser secondary is reversed (a1 joined to b2 instead of a2 to b2): phase sequence flips by 180°, so V(a1,b1) drops to Vb1b2 (115 V) while V(a2,b1) reads 162.6 V.',
      });
    }

    const gainErr = gains['probe'] ?? 0;
    const gf = 1 + gainErr;
    const shownProbe = mcbTripped ? 0 : cs.probeV;
    const probeEval = evaluateAnalogMeter(shownProbe, 300, gainErr);

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

    const z = (v: number) => (mcbTripped ? 0 : Number((v * gf).toFixed(2)));
    const outputs: Record<string, number> = {
      va3V: cs.variacV,
      probeV: probeEval.shownValue,
      Va1a4: z(cs.Va1a4),
      Vb1b4: z(cs.Vb1b4),
      Vc1c4: z(cs.Vc1c4),
      Va1c1: z(cs.Va1c1),
      VdoubleStarPhase: z(cs.VdoubleStarPhase),
      VdoubleStarAdj: z(cs.VdoubleStarAdj),
      VdoubleStarOpp: z(cs.VdoubleStarOpp),
      VAB: z(cs.VAB),
      VBC: z(cs.VBC),
      VCA: z(cs.VCA),
      VB1B2: z(cs.VB1B2),
      VA1A2: z(cs.VA1A2),
      Va1a2: z(cs.Va1a2),
      Vb1b2: z(cs.Vb1b2),
      Va1b1: z(cs.Va1b1),
      scottAngleDiffDeg: Number(cs.scottPhaseAngleDiffDeg.toFixed(1)),
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
    const hints = getStageHints({ hints: input.stage.hints ?? [] } as never, input.stage);
    const stageKind = (input.stage.physicsParams.stageKind ?? 1) as 1 | 2 | 3;
    const pairs: WireEndpointPair[] = input.wires.map((w) => [w.a, w.b]);

    // Check acceptedNetlists equivalence cleanly
    const termPool = stageKind === 3 ? STAGE3_ALL_TERMINALS : STAGE1_ALL_TERMINALS;
    const studentSol = solvePhasorNetwork(termPool, [], pairs, [], 0.5);
    let netMatchIdx = -1;

    for (let i = 0; i < input.stage.acceptedNetlists.length; i++) {
      const reqList = input.stage.acceptedNetlists[i];
      const reqPairs: WireEndpointPair[] = [];
      for (const net of reqList) {
        for (let k = 1; k < net.length; k++) reqPairs.push([net[0], net[k]]);
      }
      const reqSol = solvePhasorNetwork(termPool, [], reqPairs, [], 0.5);
      // Compare equivalence of partitions on all stage terminals
      const sig = (s: ReturnType<typeof solvePhasorNetwork>) => {
        const groups = new Map<number, TerminalId[]>();
        for (const t of termPool) {
          const nid = s.terminalToNet.get(t)!;
          const list = groups.get(nid) ?? [];
          list.push(t);
          groups.set(nid, list);
        }
        return Array.from(groups.values())
          .filter((g) => g.length > 1)
          .map((g) => g.sort().join(','))
          .sort()
          .join('|');
      };
      if (sig(studentSol) === sig(reqSol)) {
        netMatchIdx = i;
        break;
      }
    }

    // Also run solver verification at rated 230 V
    const extraFaults: FaultPattern[] = [...input.faults];
    if (stageKind === 3) {
      const scott = solveStage3Scott(pairs, 230, 230);
      if (scott.sol.hasLoopFault) {
        extraFaults.push({
          id: 'scott-loop-fault',
          description: `Short/circulating loop (~${scott.sol.maxLoopEmfV.toFixed(1)} V) in Scott primary/secondary connections.`,
          match: {},
          effect: 'short',
        });
      }
      if (scott.scottCenterTapMiss) {
        extraFaults.push({
          id: 'scott-center-tap-miss',
          description:
            'Balance condition failed: teaser A2 must connect to main center tap M so VAM = 199.2 V (0.866·VL) at 90° to VBC, not full 230 V line B1/B2.',
          match: {},
          effect: 'wrong-reading',
        });
      }
      if (scott.teaserReversed) {
        extraFaults.push({
          id: 'scott-teaser-reversed',
          description:
            'Teaser secondary reversed (a1 joined to b2 instead of a2 to b2). Join a2 to b2 so V(a1, b1) reads 162.6 V with forward two-phase sequence.',
          match: {},
          effect: 'wrong-reading',
        });
      }
      const correct = netMatchIdx >= 0 && !scott.sol.hasLoopFault && extraFaults.length === 0;
      return {
        correct,
        matchedNetlistIndex: netMatchIdx >= 0 ? netMatchIdx : 0,
        openNets: correct
          ? []
          : [
              {
                netIndex: 0,
                label: input.stage.title,
                category:
                  extraFaults[0]?.description ??
                  'Check sup3 -> va3 -> txT (A1, A2->M) and txM (B1, B2) Scott wiring.',
                missingPairHint: ['txT.A2', 'txM.M'],
              },
            ],
        shorts: [],
        extras: [],
        faults: extraFaults,
        hintLevelAvailable: hints.length,
      };
    }

    const s12 = solveStage1Or2(pairs, 230, 230, 57.5);
    if (s12.sol.hasLoopFault) {
      extraFaults.push({
        id: 'ex36-loop-fault',
        description: `Closed winding/supply loop EMF (~${s12.sol.maxLoopEmfV.toFixed(1)} V) — short-circuit fault!`,
        match: {},
        effect: 'short',
      });
    }
    const solverOk =
      stageKind === 1
        ? !s12.sol.hasLoopFault &&
          s12.primaryEnergised &&
          Math.abs(measureTerminalVoltage(s12.sol, 'tx.a1', 'tx.c1').magnitude - 230) < 2.5
        : !s12.sol.hasLoopFault &&
          s12.primaryEnergised &&
          Math.abs(measureTerminalVoltage(s12.sol, 'tx.a1', 'tx.b4').magnitude - 57.5) < 1.5 &&
          Math.abs(measureTerminalVoltage(s12.sol, 'tx.a1', 'tx.a4').magnitude - 115) < 2.0;

    const correct = netMatchIdx >= 0 && solverOk && extraFaults.length === 0;
    return {
      correct,
      matchedNetlistIndex: netMatchIdx >= 0 ? netMatchIdx : 0,
      openNets: correct
        ? []
        : [
            {
              netIndex: 0,
              label: input.stage.title,
              category:
                extraFaults[0]?.description ??
                (stageKind === 1
                  ? 'Wire primary sup3 -> va3 -> tx (A,B,C), series phases a2-a3/b2-b3/c2-c3, plus c4-b4 and b1-a4 for 230 V at a1–c1.'
                  : 'Wire primary sup3 -> va3 -> tx (A,B,C) and join a2-b2-c2-a3-b3-c3 into double-star point n.'),
              missingPairHint:
                stageKind === 1 ? ['tx.c4', 'tx.b4'] : ['tx.a2', 'tx.b2'],
            },
          ],
      shorts: [],
      extras: [],
      faults: extraFaults,
      hintLevelAvailable: hints.length,
    };
  },

  resolveLearnStep(stepId: string) {
    switch (stepId) {
      case 's1-measure':
        return { probeTerminals: ['tx.a1', 'tx.c1'] };
      case 's2-phase':
        return { probeTerminals: ['tx.a1', 'tx.b4'] };
      case 's2-opp':
        return { probeTerminals: ['tx.a1', 'tx.a4'] };
      case 's3-quad':
        return { probeTerminals: ['txM.b1', 'txM.b2'] };
      case 's3-read-diag':
        return { probeTerminals: ['txT.a1', 'txM.b1'] };
      default:
        return null;
    }
  },
};
