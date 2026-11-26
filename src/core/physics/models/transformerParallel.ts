import type {
  BaseConnectionState,
  ControlValues,
  FaultPattern,
  NetGraphLike,
  PhysicsModel,
  PhysicsSolveInput,
  PhysicsSolveOutput,
  RuntimeEvent,
  TerminalId,
} from '../../types';
import {
  createSeededRng,
  deriveHiddenPolarity,
  evaluateAnalogMeter,
  evaluateWattmeter,
  hashSeed,
  toAnalogMeterReading,
  toWattmeterMeterReading,
} from '../meters';

interface Complex {
  re: number;
  im: number;
}

const cAdd = (a: Complex, b: Complex): Complex => ({
  re: a.re + b.re,
  im: a.im + b.im,
});
const cSub = (a: Complex, b: Complex): Complex => ({
  re: a.re - b.re,
  im: a.im - b.im,
});
const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cDiv = (a: Complex, b: Complex): Complex => {
  const denom = b.re * b.re + b.im * b.im;
  return denom === 0
    ? { re: 0, im: 0 }
    : {
        re: (a.re * b.re + a.im * b.im) / denom,
        im: (a.im * b.re - a.re * b.im) / denom,
      };
};
const cConj = (a: Complex): Complex => ({ re: a.re, im: -a.im });
const cAbs = (a: Complex): number => Math.hypot(a.re, a.im);

export interface ParallelConnectionState extends BaseConnectionState {
  stageMode: 1 | 2;
  txBPolarityFlipped: boolean;
  txAPrimaryEnergised: boolean;
  txBPrimaryEnergised: boolean;
  primaryEnergised: boolean;
  vpConnected: boolean;
  oppositionJoined: boolean;
  aidingJoined: boolean;
  aidingParallel: boolean;
  vpolConnected: boolean;
  secondaryParallelEnergised: boolean;
  amAInSeries: boolean;
  amBInSeries: boolean;
  amLInSeries: boolean;
  wmACcEnergised: boolean;
  wmAPcEnergised: boolean;
  wmAReversed: boolean;
  wmBCcEnergised: boolean;
  wmBPcEnergised: boolean;
  wmBReversed: boolean;
  vLConnected: boolean;
  lampsWired: boolean;
  rheostatWired: boolean;
  loadBeforePolarity: boolean;
  vLInSeries: boolean;
  vpInSeries: boolean;
}

export interface TransformerParallelParams {
  stageMode: 1 | 2;
  V1rated: number;
  V2rated: number;
  SA: number;
  SB: number;
  IArated: number;
  IBrated: number;
  aA: number;
  aB: number;
  RA: number;
  XA: number;
  RB: number;
  XB: number;
  I0A: number;
  I0B: number;
  Rs: number;
  lampR: number;
  vpRange: number;
  vpolRange: number;
  vLRange: number;
  amARange: number;
  amBRange: number;
  amLRange: number;
  wmDivisions: number;
  wmPf: number;
  wmDefaultVRange: number;
  wmADefaultIRange: number;
  wmBDefaultIRange: number;
}

export const DEFAULT_PARALLEL_PARAMS: Omit<TransformerParallelParams, 'stageMode'> = {
  V1rated: 230,
  V2rated: 115,
  SA: 2000,
  SB: 3000,
  IArated: 17.39,
  IBrated: 26.09,
  aA: 2.0,
  aB: 2.0023,
  RA: 0.15,
  XA: 0.22,
  RB: 0.0882,
  XB: 0.1322,
  I0A: 0.35,
  I0B: 0.52,
  Rs: 0.15,
  lampR: 66.125,
  vpRange: 300,
  vpolRange: 300,
  vLRange: 150,
  amARange: 25,
  amBRange: 40,
  amLRange: 60,
  wmDivisions: 150,
  wmPf: 1.0,
  wmDefaultVRange: 150,
  wmADefaultIRange: 20,
  wmBDefaultIRange: 40,
};

export function extractParallelParams(
  raw: Record<string, number>,
): TransformerParallelParams {
  const stageMode: 1 | 2 = raw.stageMode === 2 ? 2 : 1;
  return {
    stageMode,
    V1rated: raw.V1rated ?? DEFAULT_PARALLEL_PARAMS.V1rated,
    V2rated: raw.V2rated ?? DEFAULT_PARALLEL_PARAMS.V2rated,
    SA: raw.SA ?? DEFAULT_PARALLEL_PARAMS.SA,
    SB: raw.SB ?? DEFAULT_PARALLEL_PARAMS.SB,
    IArated: raw.IArated ?? DEFAULT_PARALLEL_PARAMS.IArated,
    IBrated: raw.IBrated ?? DEFAULT_PARALLEL_PARAMS.IBrated,
    aA: raw.aA ?? DEFAULT_PARALLEL_PARAMS.aA,
    aB: raw.aB ?? DEFAULT_PARALLEL_PARAMS.aB,
    RA: raw.RA ?? DEFAULT_PARALLEL_PARAMS.RA,
    XA: raw.XA ?? DEFAULT_PARALLEL_PARAMS.XA,
    RB: raw.RB ?? DEFAULT_PARALLEL_PARAMS.RB,
    XB: raw.XB ?? DEFAULT_PARALLEL_PARAMS.XB,
    I0A: raw.I0A ?? DEFAULT_PARALLEL_PARAMS.I0A,
    I0B: raw.I0B ?? DEFAULT_PARALLEL_PARAMS.I0B,
    Rs: raw.Rs ?? DEFAULT_PARALLEL_PARAMS.Rs,
    lampR: raw.lampR ?? DEFAULT_PARALLEL_PARAMS.lampR,
    vpRange: raw.vpRange ?? DEFAULT_PARALLEL_PARAMS.vpRange,
    vpolRange: raw.vpolRange ?? DEFAULT_PARALLEL_PARAMS.vpolRange,
    vLRange: raw.vLRange ?? DEFAULT_PARALLEL_PARAMS.vLRange,
    amARange: raw.amARange ?? DEFAULT_PARALLEL_PARAMS.amARange,
    amBRange: raw.amBRange ?? DEFAULT_PARALLEL_PARAMS.amBRange,
    amLRange: raw.amLRange ?? DEFAULT_PARALLEL_PARAMS.amLRange,
    wmDivisions: raw.wmDivisions ?? DEFAULT_PARALLEL_PARAMS.wmDivisions,
    wmPf: raw.wmPf ?? DEFAULT_PARALLEL_PARAMS.wmPf,
    wmDefaultVRange: raw.wmDefaultVRange ?? DEFAULT_PARALLEL_PARAMS.wmDefaultVRange,
    wmADefaultIRange: raw.wmADefaultIRange ?? DEFAULT_PARALLEL_PARAMS.wmADefaultIRange,
    wmBDefaultIRange: raw.wmBDefaultIRange ?? DEFAULT_PARALLEL_PARAMS.wmBDefaultIRange,
  };
}

export function resolveTxBPolarityFlipped(
  seed = 202601,
  params: Record<string, number> = {},
): boolean {
  if ('txBPolarityFlipped' in params) {
    return params.txBPolarityFlipped !== 0;
  }
  return deriveHiddenPolarity(seed, 'txB.polarity') === -1;
}

export function resolveParallelResidualV(seed = 202601): number {
  const rand = createSeededRng(hashSeed(seed, 'ex3.4.vpol.residual'));
  // Real mismatch between EA (115 V) and EB (114.87 V) is ~0.13 V plus tiny seeded offset
  return Number((0.13 + rand() * 0.25).toFixed(2));
}

export interface ParallelNodalSolution {
  IA: number;
  IB: number;
  IL: number;
  VL: number;
  WA: number;
  WB: number;
  Po: number;
  I1: number;
}

/**
 * Pure complex nodal solver for two transformers in parallel:
 * VL = (EA/ZA + EB/ZB) / (1/ZA + 1/ZB + GL)
 */
export function solveParallelNodal(
  V1: number,
  GL: number,
  p: TransformerParallelParams,
): ParallelNodalSolution {
  const EA: Complex = { re: V1 / p.aA, im: 0 };
  const EB: Complex = { re: V1 / p.aB, im: 0 };
  const ZA: Complex = { re: p.RA, im: p.XA };
  const ZB: Complex = { re: p.RB, im: p.XB };
  const YA = cDiv({ re: 1, im: 0 }, ZA);
  const YB = cDiv({ re: 1, im: 0 }, ZB);
  const YL: Complex = { re: GL, im: 0 };

  const num = cAdd(cMul(EA, YA), cMul(EB, YB));
  const den = cAdd(cAdd(YA, YB), YL);
  const VL_c = cDiv(num, den);
  const IA_c = cDiv(cSub(EA, VL_c), ZA);
  const IB_c = cDiv(cSub(EB, VL_c), ZB);
  const IL_c = cMul(VL_c, YL);

  const IA = cAbs(IA_c);
  const IB = cAbs(IB_c);
  const IL = cAbs(IL_c);
  const VL = cAbs(VL_c);
  const WA = cMul(VL_c, cConj(IA_c)).re;
  const WB = cMul(VL_c, cConj(IB_c)).re;
  const Po = VL * IL;
  const vRatio = p.V1rated > 0 ? V1 / p.V1rated : 0;
  const I1 = IA / p.aA + IB / p.aB + (p.I0A + p.I0B) * vRatio;

  return { IA, IB, IL, VL, WA, WB, Po, I1 };
}

export interface ParallelMethodTruth {
  circulatingCurrentA: number;
  firstRatedIL: number;
  firstTransformer: 'A' | 'B';
  proportionalShare: 'yes' | 'no';
}

export function computeParallelMethodTruth(
  rawParams: Record<string, number>,
): ParallelMethodTruth {
  const p = extractParallelParams(rawParams);
  const noLoad = solveParallelNodal(p.V1rated, 0, p);

  // Bisect load conductance GL to locate exact IL where first transformer hits 100% rating
  let lo = 0;
  let hi = 1.0;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    const s = solveParallelNodal(p.V1rated, mid, p);
    const maxRatio = Math.max(s.IA / p.IArated, s.IB / p.IBrated);
    if (maxRatio < 1) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const atLimit = solveParallelNodal(p.V1rated, 0.5 * (lo + hi), p);
  const firstTransformer: 'A' | 'B' =
    atLimit.IB / p.IBrated >= atLimit.IA / p.IArated ? 'B' : 'A';

  return {
    circulatingCurrentA: noLoad.IA,
    firstRatedIL: atLimit.IL,
    firstTransformer,
    proportionalShare: 'no',
  };
}

function anyConnectedTo(
  graph: NetGraphLike,
  target: TerminalId,
  candidates: TerminalId[],
): boolean {
  return candidates.some((c) => graph.areConnected(target, c));
}

function pairAcross(
  graph: NetGraphLike,
  t1: TerminalId,
  t2: TerminalId,
  sideA: TerminalId[],
  sideB: TerminalId[],
): boolean {
  const fwd = anyConnectedTo(graph, t1, sideA) && anyConnectedTo(graph, t2, sideB);
  const rev = anyConnectedTo(graph, t2, sideA) && anyConnectedTo(graph, t1, sideB);
  return fwd || rev;
}

export const transformerParallelModel: PhysicsModel<ParallelConnectionState> = {
  id: 'transformerParallel',

  deriveConnectionState(
    nets: NetGraphLike,
    controls: ControlValues,
    stageParams: Record<string, number>,
    faults: FaultPattern[] = [],
    seed = 202601,
  ): ParallelConnectionState {
    const p = extractParallelParams(stageParams);
    const txBPolarityFlipped = resolveTxBPolarityFlipped(seed, stageParams);
    const faultIds = faults.map((f) => f.id);
    const shortFaults = faults.filter((f) => f.effect === 'short');
    let shorted = shortFaults.length > 0;
    const supplyOn = Boolean(controls['sup.switch']);

    const vpInSeries = faultIds.includes('vp-in-series');
    const vLInSeries = faultIds.includes('vL-in-series');

    const supConnectedToVa =
      nets.areConnected('sup.P', 'va.IN_P') &&
      nets.areConnected('sup.N', 'va.IN_N');
    const priNeutral: TerminalId[] = ['sup.N', 'va.IN_N', 'va.OUT_N', 'txA.P2', 'txB.P2'];

    const txAPrimaryEnergised =
      supplyOn &&
      !shorted &&
      !vpInSeries &&
      supConnectedToVa &&
      nets.areConnected('va.OUT_P', 'txA.P1') &&
      nets.areConnected('txA.P2', 'sup.N');
    const txBPrimaryEnergised =
      supplyOn &&
      !shorted &&
      !vpInSeries &&
      supConnectedToVa &&
      nets.areConnected('va.OUT_P', 'txB.P1') &&
      nets.areConnected('txB.P2', 'sup.N');

    const primaryEnergised = txAPrimaryEnergised || txBPrimaryEnergised;
    const vpConnected =
      supplyOn &&
      !shorted &&
      supConnectedToVa &&
      (pairAcross(
        nets,
        'vp.A',
        'vp.B',
        ['va.OUT_P', 'txA.P1', 'txB.P1'],
        priNeutral,
      ) ||
        vpInSeries);

    const s1s2 = nets.areConnected('txA.S1', 'txB.S2');
    const s2s1 = nets.areConnected('txA.S2', 'txB.S1');
    const s1s1 = nets.areConnected('txA.S1', 'txB.S1');
    const s2s2 = nets.areConnected('txA.S2', 'txB.S2');

    const oppPairA = txBPolarityFlipped ? s1s2 : s1s1;
    const oppPairB = txBPolarityFlipped ? s2s1 : s2s2;
    const aidPairA = txBPolarityFlipped ? s1s1 : s1s2;
    const aidPairB = txBPolarityFlipped ? s2s2 : s2s1;

    const oppositionJoined =
      (oppPairA && !oppPairB) || (oppPairB && !oppPairA);
    const aidingJoined = aidPairA || aidPairB;

    let vpolConnected = false;
    if (p.stageMode === 1 && primaryEnergised) {
      if (txBPolarityFlipped) {
        if (s1s2 && !s2s1) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['txA.S2'], ['txB.S1']);
        } else if (s2s1 && !s1s2) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['txA.S1'], ['txB.S2']);
        } else if (s1s1 && !s2s2) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['txA.S2'], ['txB.S2']);
        } else if (s2s2 && !s1s1) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['txA.S1'], ['txB.S1']);
        }
      } else {
        if (s1s1 && !s2s2) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['txA.S2'], ['txB.S2']);
        } else if (s2s2 && !s1s1) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['txA.S1'], ['txB.S1']);
        } else if (s1s2 && !s2s1) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['txA.S2'], ['txB.S1']);
        } else if (s2s1 && !s1s2) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['txA.S1'], ['txB.S2']);
        }
      }
    }

    if (p.stageMode === 1) {
      return {
        stageMode: 1,
        shorted,
        shortFaults,
        matchedFaultIds: faultIds,
        energised: primaryEnergised,
        txBPolarityFlipped,
        txAPrimaryEnergised,
        txBPrimaryEnergised,
        primaryEnergised,
        vpConnected,
        oppositionJoined,
        aidingJoined,
        aidingParallel: false,
        vpolConnected,
        secondaryParallelEnergised: false,
        amAInSeries: false,
        amBInSeries: false,
        amLInSeries: false,
        wmACcEnergised: false,
        wmAPcEnergised: false,
        wmAReversed: false,
        wmBCcEnergised: false,
        wmBPcEnergised: false,
        wmBReversed: false,
        vLConnected: false,
        lampsWired: false,
        rheostatWired: false,
        loadBeforePolarity: false,
        vLInSeries: false,
        vpInSeries,
      };
    }

    // Stage 2: Secondary parallel bus detection (canonical OR mirror orientation)
    const topBus: TerminalId[] = ['amL.IN', 'vL.A', 'wmA.L', 'wmB.L'];
    const botBus: TerminalId[] = ['vL.B', 'wmA.V2', 'wmB.V2'];

    const checkBranch = (
      amId: 'amA' | 'amB',
      wmId: 'wmA' | 'wmB',
      tTop: TerminalId,
      tBot: TerminalId,
    ) => {
      const amFwd =
        nets.areConnected(tTop, `${amId}.IN`) &&
        (nets.areConnected(`${amId}.OUT`, `${wmId}.M`) ||
          nets.areConnected(`${amId}.OUT`, `${wmId}.L`));
      const amRev =
        nets.areConnected(tTop, `${amId}.OUT`) &&
        (nets.areConnected(`${amId}.IN`, `${wmId}.M`) ||
          nets.areConnected(`${amId}.IN`, `${wmId}.L`));
      const amSeries = amFwd || amRev;
      const amExit: TerminalId[] = amSeries ? [`${amId}.OUT`, `${amId}.IN`] : [tTop];

      const ccFwd =
        anyConnectedTo(nets, `${wmId}.M`, amExit) &&
        anyConnectedTo(nets, `${wmId}.L`, topBus);
      const ccRev =
        anyConnectedTo(nets, `${wmId}.L`, amExit) &&
        anyConnectedTo(nets, `${wmId}.M`, topBus);

      const liveNodes: TerminalId[] = [
        tTop,
        `${amId}.IN`,
        `${amId}.OUT`,
        `${wmId}.M`,
        `${wmId}.L`,
        'amL.IN',
        'vL.A',
      ];
      const botNodes: TerminalId[] = [tBot, ...botBus];
      const botReturn = anyConnectedTo(nets, tBot, botBus);

      const pcFwd =
        anyConnectedTo(nets, `${wmId}.V1`, liveNodes) &&
        anyConnectedTo(nets, `${wmId}.V2`, botNodes);
      const pcRev =
        anyConnectedTo(nets, `${wmId}.V1`, botNodes) &&
        anyConnectedTo(nets, `${wmId}.V2`, liveNodes);

      return {
        branchActive: botReturn && (ccFwd || ccRev || anyConnectedTo(nets, tTop, topBus)),
        amSeries,
        ccEnergised: ccFwd || ccRev,
        pcEnergised: pcFwd || pcRev,
        wmReversed: ccRev !== pcRev,
      };
    };

    const brACan = checkBranch('amA', 'wmA', 'txA.S1', 'txA.S2');
    const brBCan = checkBranch('amB', 'wmB', 'txB.S2', 'txB.S1');
    const brAMir = checkBranch('amA', 'wmA', 'txA.S2', 'txA.S1');
    const brBMir = checkBranch('amB', 'wmB', 'txB.S1', 'txB.S2');

    // Detect swapped-polarity aiding parallel connection across branches
    const aidingParallelA =
      (brACan.branchActive && brBMir.branchActive) ||
      (brAMir.branchActive && brBCan.branchActive);
    const aidingParallel = txBPolarityFlipped ? aidingParallelA : (brACan.branchActive && brBCan.branchActive) || (brAMir.branchActive && brBMir.branchActive);

    const anyLoadActive =
      (Boolean(controls['lamps.switch']) && Number(controls['lamps.lamps'] ?? 0) > 0) ||
      Boolean(controls['rheostat.switch']);
    const loadBeforePolarity = (aidingJoined || aidingParallel) && anyLoadActive;
    if (aidingJoined || aidingParallel) {
      shorted = true;
    }

    const useMirror = !brACan.branchActive && !brBCan.branchActive && (brAMir.branchActive || brBMir.branchActive);
    const brA = useMirror ? brAMir : brACan;
    const brB = useMirror ? brBMir : brBCan;

    const secondaryParallelEnergised =
      primaryEnergised && !shorted && brA.branchActive && brB.branchActive;

    const amLInSeries =
      (anyConnectedTo(nets, 'amL.IN', ['wmA.L', 'wmB.L', 'vL.A']) &&
        (nets.areConnected('amL.OUT', 'lamps.A') ||
          nets.areConnected('amL.OUT', 'rheostat.A'))) ||
      (anyConnectedTo(nets, 'amL.OUT', ['wmA.L', 'wmB.L', 'vL.A']) &&
        (nets.areConnected('amL.IN', 'lamps.A') ||
          nets.areConnected('amL.IN', 'rheostat.A')));

    const loadTopCandidates: TerminalId[] = amLInSeries
      ? ['amL.OUT', 'amL.IN']
      : ['wmA.L', 'wmB.L', 'vL.A'];
    const lampsWired =
      anyConnectedTo(nets, 'lamps.A', loadTopCandidates) &&
      anyConnectedTo(nets, 'lamps.B', ['vL.B', 'wmA.V2', 'wmB.V2', 'txA.S2', 'txB.S1']);
    const rheostatWired =
      anyConnectedTo(nets, 'rheostat.A', loadTopCandidates) &&
      anyConnectedTo(nets, 'rheostat.B', ['vL.B', 'wmA.V2', 'wmB.V2', 'txA.S2', 'txB.S1']);

    const vLConnected =
      primaryEnergised &&
      !shorted &&
      (pairAcross(nets, 'vL.A', 'vL.B', ['wmA.L', 'wmB.L', 'amL.IN'], botBus) ||
        vLInSeries);

    const loadConnected =
      secondaryParallelEnergised &&
      ((lampsWired && Boolean(controls['lamps.switch']) && Number(controls['lamps.lamps'] ?? 0) > 0) ||
        (rheostatWired && Boolean(controls['rheostat.switch'])));

    return {
      stageMode: 2,
      shorted,
      shortFaults,
      matchedFaultIds: faultIds,
      energised: primaryEnergised && !shorted,
      loadConnected,
      txBPolarityFlipped,
      txAPrimaryEnergised,
      txBPrimaryEnergised,
      primaryEnergised,
      vpConnected,
      oppositionJoined,
      aidingJoined,
      aidingParallel,
      vpolConnected: false,
      secondaryParallelEnergised,
      amAInSeries: secondaryParallelEnergised && brA.amSeries,
      amBInSeries: secondaryParallelEnergised && brB.amSeries,
      amLInSeries: secondaryParallelEnergised && amLInSeries,
      wmACcEnergised: secondaryParallelEnergised && brA.ccEnergised,
      wmAPcEnergised: primaryEnergised && !shorted && brA.pcEnergised,
      wmAReversed: brA.wmReversed,
      wmBCcEnergised: secondaryParallelEnergised && brB.ccEnergised,
      wmBPcEnergised: primaryEnergised && !shorted && brB.pcEnergised,
      wmBReversed: brB.wmReversed,
      vLConnected,
      lampsWired,
      rheostatWired,
      loadBeforePolarity,
      vLInSeries,
      vpInSeries,
    };
  },

  solve(input: PhysicsSolveInput<ParallelConnectionState>): PhysicsSolveOutput {
    const p = extractParallelParams(input.params);
    const conn = input.connectionState;
    const supplyOn = Boolean(input.controls['sup.switch']);
    const vSet = Number(input.controls['va.knob'] ?? 0);
    const wmAVRange = Number(input.controls['wmA.vRange'] ?? p.wmDefaultVRange);
    const wmAIRange = Number(input.controls['wmA.iRange'] ?? p.wmADefaultIRange);
    const wmAReverse = Boolean(input.controls['wmA.reverse']);
    const wmBVRange = Number(input.controls['wmB.vRange'] ?? p.wmDefaultVRange);
    const wmBIRange = Number(input.controls['wmB.iRange'] ?? p.wmBDefaultIRange);
    const wmBReverse = Boolean(input.controls['wmB.reverse']);

    const lampsSwitch = Boolean(input.controls['lamps.switch']);
    const lampsCount = Math.max(0, Math.round(Number(input.controls['lamps.lamps'] ?? 0)));
    const rheostatSwitch = Boolean(input.controls['rheostat.switch']);
    const rheostatR = Math.max(1, Number(input.controls['rheostat.R'] ?? 100));

    const labelOf = (id: string, fallback: string) =>
      input.components?.find((c) => c.id === id)?.label ?? fallback;

    const events: RuntimeEvent[] = [];

    const buildOutput = (
      V1: number,
      Vpol: number,
      sol: ParallelNodalSolution,
      mcbTripped: boolean,
      runFailed: boolean,
    ): PhysicsSolveOutput => {
      const vpReading = evaluateAnalogMeter(
        conn.vpConnected ? V1 : 0,
        p.vpRange,
        input.gains.vp ?? 0,
      );

      if (p.stageMode === 1) {
        const vpolReading = evaluateAnalogMeter(
          conn.vpolConnected ? Vpol : 0,
          p.vpolRange,
          input.gains.vpol ?? 0,
        );
        return {
          meters: [
            toAnalogMeterReading('vp', labelOf('vp', 'Primary Voltmeter'), 'voltmeter', 'V', vpReading, 1),
            toAnalogMeterReading('vpol', labelOf('vpol', 'Polarity Voltmeter'), 'voltmeter', 'V', vpolReading, 1),
          ],
          events,
          mcbTripped,
          runFailed,
          outputs: { V1, Vpol, V: V1, I: sol.I1, P: 0 },
        };
      }

      const amAReading = evaluateAnalogMeter(
        conn.amAInSeries ? sol.IA : 0,
        p.amARange,
        input.gains.amA ?? 0,
      );
      const amBReading = evaluateAnalogMeter(
        conn.amBInSeries ? sol.IB : 0,
        p.amBRange,
        input.gains.amB ?? 0,
      );
      const amLReading = evaluateAnalogMeter(
        conn.amLInSeries ? sol.IL : 0,
        p.amLRange,
        input.gains.amL ?? 0,
      );
      const vLReading = evaluateAnalogMeter(
        conn.vLConnected ? sol.VL : 0,
        p.vLRange,
        input.gains.vL ?? 0,
      );
      const wmAReading = evaluateWattmeter(
        conn.wmACcEnergised && conn.wmAPcEnergised ? sol.WA : 0,
        conn.wmAPcEnergised ? sol.VL : 0,
        conn.wmACcEnergised ? sol.IA : 0,
        wmAVRange,
        wmAIRange,
        input.gains.wmA ?? 0,
        conn.wmAReversed,
        p.wmDivisions,
        p.wmPf,
        wmAReverse,
      );
      const wmBReading = evaluateWattmeter(
        conn.wmBCcEnergised && conn.wmBPcEnergised ? sol.WB : 0,
        conn.wmBPcEnergised ? sol.VL : 0,
        conn.wmBCcEnergised ? sol.IB : 0,
        wmBVRange,
        wmBIRange,
        input.gains.wmB ?? 0,
        conn.wmBReversed,
        p.wmDivisions,
        p.wmPf,
        wmBReverse,
      );

      if (supplyOn && !mcbTripped) {
        const checkOver = (
          id: string,
          name: string,
          r: ReturnType<typeof evaluateAnalogMeter>,
        ) => {
          if (r.damaged) {
            events.push({
              id: `${id}-damaged`,
              severity: 'danger',
              message: `${name} damaged (>150% range). Reads zero.`,
            });
          } else if (r.overrange) {
            events.push({
              id: `${id}-overrange`,
              severity: 'warning',
              message: `${name} overrange — pointer pegged.`,
            });
          }
        };
        checkOver('vp', 'Primary voltmeter', vpReading);
        checkOver('amA', 'Ammeter A', amAReading);
        checkOver('amB', 'Ammeter B', amBReading);
        checkOver('amL', 'Load ammeter', amLReading);
        checkOver('vL', 'Load voltmeter', vLReading);
      }

      return {
        meters: [
          toAnalogMeterReading('vp', labelOf('vp', 'Primary Voltmeter'), 'voltmeter', 'V', vpReading, 1),
          toAnalogMeterReading('amA', labelOf('amA', 'Ammeter A'), 'ammeter', 'A', amAReading, 2),
          toWattmeterMeterReading('wmA', labelOf('wmA', 'Wattmeter A'), wmAReading, 1),
          toAnalogMeterReading('amB', labelOf('amB', 'Ammeter B'), 'ammeter', 'A', amBReading, 2),
          toWattmeterMeterReading('wmB', labelOf('wmB', 'Wattmeter B'), wmBReading, 1),
          toAnalogMeterReading('amL', labelOf('amL', 'Load Ammeter'), 'ammeter', 'A', amLReading, 2),
          toAnalogMeterReading('vL', labelOf('vL', 'Load Voltmeter'), 'voltmeter', 'V', vLReading, 1),
        ],
        events,
        mcbTripped,
        runFailed,
        outputs: {
          V1,
          IA: sol.IA,
          IB: sol.IB,
          IL: sol.IL,
          VL: sol.VL,
          WA: sol.WA,
          WB: sol.WB,
          Po: sol.Po,
          I1: sol.I1,
          V: sol.VL,
          I: sol.IL,
          P: sol.Po,
        },
      };
    };

    const zeroSol: ParallelNodalSolution = {
      IA: 0,
      IB: 0,
      IL: 0,
      VL: 0,
      WA: 0,
      WB: 0,
      Po: 0,
      I1: 0,
    };

    if (!supplyOn) {
      return buildOutput(0, 0, zeroSol, false, false);
    }

    if (conn.shorted) {
      const shortMsg = conn.loadBeforePolarity
        ? 'Load switched on with secondary polarity reversed (series-aiding). Massive circulating short-circuit current tripped the MCB!'
        : conn.aidingParallel || conn.aidingJoined
          ? 'Secondary windings connected in series-aiding polarity (~230 V loop EMF). Short-circuit current tripped the MCB!'
          : conn.shortFaults[0]?.description ?? 'Short circuit detected. MCB tripped.';
      events.push({
        id: 'mcb-trip',
        severity: 'danger',
        message: `MCB tripped: ${shortMsg}`,
      });
      return buildOutput(0, 0, zeroSol, true, true);
    }

    const rs = input.options?.noSag ? 0 : p.Rs;

    if (p.stageMode === 1) {
      let V1 = 0;
      let I1 = 0;
      if (conn.vpInSeries) {
        V1 = vSet;
      } else if (!conn.primaryEnergised) {
        if (conn.vpConnected) V1 = vSet;
      } else {
        const i0 =
          (conn.txAPrimaryEnergised ? p.I0A : 0) +
          (conn.txBPrimaryEnergised ? p.I0B : 0);
        V1 = vSet;
        const iterations = rs === 0 ? 1 : 6;
        for (let k = 0; k < iterations; k++) {
          I1 = i0 * (V1 / p.V1rated);
          V1 = Math.max(0, vSet - I1 * rs);
        }
        I1 = i0 * (V1 / p.V1rated);
      }

      let Vpol = 0;
      if (conn.vpolConnected && conn.primaryEnergised) {
        if (conn.txAPrimaryEnergised && conn.txBPrimaryEnergised) {
          if (conn.aidingJoined) {
            Vpol = V1 / p.aA + V1 / p.aB;
            if (V1 > 10) {
              events.push({
                id: 'polarity-aiding',
                severity: 'danger',
                message: `Series-aiding polarity detected (vpol = ${Vpol.toFixed(1)} V). Shut off supply and swap one transformer’s secondary leads so vpol reads ~0 V.`,
              });
            }
          } else if (conn.oppositionJoined) {
            Vpol = resolveParallelResidualV(input.seed) * (V1 / p.V1rated);
          }
        } else {
          Vpol = V1 / p.aA;
        }
      }

      return buildOutput(V1, 0, { ...zeroSol, I1 }, false, false).outputs
        ? {
            ...buildOutput(V1, Vpol, { ...zeroSol, I1 }, false, false),
          }
        : buildOutput(V1, Vpol, { ...zeroSol, I1 }, false, false);
    }

    // Stage 2: Parallel load sharing complex nodal solve with primary sag
    let V1 = 0;
    let sol = zeroSol;

    const gLamps =
      conn.lampsWired && lampsSwitch && lampsCount > 0
        ? lampsCount / p.lampR
        : 0;
    const gRheo = conn.rheostatWired && rheostatSwitch ? 1 / rheostatR : 0;
    const GL = gLamps + gRheo;

    if (conn.vpInSeries || conn.vLInSeries) {
      V1 = vSet;
    } else if (!conn.primaryEnergised) {
      if (conn.vpConnected) V1 = vSet;
    } else if (!conn.secondaryParallelEnergised) {
      const i0 =
        (conn.txAPrimaryEnergised ? p.I0A : 0) +
        (conn.txBPrimaryEnergised ? p.I0B : 0);
      V1 = vSet;
      const iterations = rs === 0 ? 1 : 6;
      for (let k = 0; k < iterations; k++) {
        const i1 = i0 * (V1 / p.V1rated);
        V1 = Math.max(0, vSet - i1 * rs);
      }
      sol = { ...zeroSol, I1: i0 * (V1 / p.V1rated) };
    } else {
      V1 = vSet;
      const iterations = rs === 0 ? 1 : 8;
      for (let k = 0; k < iterations; k++) {
        sol = solveParallelNodal(V1, GL, p);
        V1 = Math.max(0, vSet - sol.I1 * rs);
      }
      sol = solveParallelNodal(V1, GL, p);
    }

    let runFailed = false;
    if (V1 > p.V1rated * 1.1) {
      events.push({
        id: 'primary-overvoltage',
        severity: 'warning',
        message: `Primary voltage (${V1.toFixed(1)} V) exceeds 110% of rated 230 V.`,
      });
    }

    if (sol.IB > p.IBrated * 1.25 || sol.IA > p.IArated * 1.25) {
      runFailed = true;
      events.push({
        id: 'transformer-overheating',
        severity: 'danger',
        message: `Transformer overheating: IB=${sol.IB.toFixed(2)} A / IA=${sol.IA.toFixed(2)} A exceeded 125% rated current. Run failed.`,
      });
    } else if (sol.IB > p.IBrated * 1.1 || sol.IA > p.IArated * 1.1) {
      events.push({
        id: 'transformer-overload',
        severity: 'warning',
        message: `Overload warning: ${sol.IB > p.IBrated * 1.1 ? 'Transformer B' : 'Transformer A'} exceeded 110% of rated current.`,
      });
    }

    return buildOutput(V1, 0, sol, false, runFailed);
  },
};
