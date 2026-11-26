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

export interface SumpnerConnectionState extends BaseConnectionState {
  stageMode: 1 | 2;
  tx2PolarityFlipped: boolean;
  tx1PrimaryEnergised: boolean;
  tx2PrimaryEnergised: boolean;
  primaryEnergised: boolean;
  secondaryEnergised: boolean;
  oppositionJoined: boolean;
  aidingJoined: boolean;
  vpConnected: boolean;
  apInSeries: boolean;
  wpCcEnergised: boolean;
  wpPcEnergised: boolean;
  wpReversed: boolean;
  vpolConnected: boolean;
  vsConnected: boolean;
  asInSeries: boolean;
  wsCcEnergised: boolean;
  wsPcEnergised: boolean;
  wsReversed: boolean;
  vpInSeries: boolean;
  vsInSeries: boolean;
}

export interface SumpnerParams {
  stageMode: 1 | 2;
  a: number;
  Srated: number;
  V1rated: number;
  V2rated: number;
  I1rated: number;
  I2rated: number;
  R2eq: number;
  X2eq: number;
  rc_hv: number;
  xm_hv: number;
  Pi_rated: number;
  Rs_primary: number;
  Rs_secondary: number;
  vpRange: number;
  apRange: number;
  vpolRange: number;
  vsRange: number;
  asRange: number;
  wpDivisions: number;
  wpPf: number;
  wpVRange: number;
  wpIRange: number;
  wsDivisions: number;
  wsPf: number;
  wsDefaultVRange: number;
  wsDefaultIRange: number;
}

export const DEFAULT_SUMPNER_PARAMS: Omit<SumpnerParams, 'stageMode'> = {
  a: 2,
  Srated: 2000,
  V1rated: 230,
  V2rated: 115,
  I1rated: 8.7,
  I2rated: 17.39,
  R2eq: 0.15,
  X2eq: 0.22,
  rc_hv: 2645,
  xm_hv: 678.4,
  Pi_rated: 20,
  Rs_primary: 0.3,
  Rs_secondary: 0.02,
  vpRange: 300,
  apRange: 1,
  vpolRange: 300,
  vsRange: 15,
  asRange: 25,
  wpDivisions: 150,
  wpPf: 0.2,
  wpVRange: 300,
  wpIRange: 1,
  wsDivisions: 150,
  wsPf: 1.0,
  wsDefaultVRange: 15,
  wsDefaultIRange: 20,
};

export function extractSumpnerParams(
  raw: Record<string, number>,
): SumpnerParams {
  const stageMode: 1 | 2 = raw.stageMode === 2 ? 2 : 1;
  return {
    stageMode,
    a: raw.a ?? DEFAULT_SUMPNER_PARAMS.a,
    Srated: raw.Srated ?? DEFAULT_SUMPNER_PARAMS.Srated,
    V1rated: raw.V1rated ?? DEFAULT_SUMPNER_PARAMS.V1rated,
    V2rated: raw.V2rated ?? DEFAULT_SUMPNER_PARAMS.V2rated,
    I1rated: raw.I1rated ?? DEFAULT_SUMPNER_PARAMS.I1rated,
    I2rated: raw.I2rated ?? DEFAULT_SUMPNER_PARAMS.I2rated,
    R2eq: raw.R2eq ?? DEFAULT_SUMPNER_PARAMS.R2eq,
    X2eq: raw.X2eq ?? DEFAULT_SUMPNER_PARAMS.X2eq,
    rc_hv: raw.rc_hv ?? DEFAULT_SUMPNER_PARAMS.rc_hv,
    xm_hv: raw.xm_hv ?? DEFAULT_SUMPNER_PARAMS.xm_hv,
    Pi_rated: raw.Pi_rated ?? DEFAULT_SUMPNER_PARAMS.Pi_rated,
    Rs_primary: raw.Rs_primary ?? DEFAULT_SUMPNER_PARAMS.Rs_primary,
    Rs_secondary: raw.Rs_secondary ?? DEFAULT_SUMPNER_PARAMS.Rs_secondary,
    vpRange: raw.vpRange ?? DEFAULT_SUMPNER_PARAMS.vpRange,
    apRange: raw.apRange ?? DEFAULT_SUMPNER_PARAMS.apRange,
    vpolRange: raw.vpolRange ?? DEFAULT_SUMPNER_PARAMS.vpolRange,
    vsRange: raw.vsRange ?? DEFAULT_SUMPNER_PARAMS.vsRange,
    asRange: raw.asRange ?? DEFAULT_SUMPNER_PARAMS.asRange,
    wpDivisions: raw.wpDivisions ?? DEFAULT_SUMPNER_PARAMS.wpDivisions,
    wpPf: raw.wpPf ?? DEFAULT_SUMPNER_PARAMS.wpPf,
    wpVRange: raw.wpVRange ?? DEFAULT_SUMPNER_PARAMS.wpVRange,
    wpIRange: raw.wpIRange ?? DEFAULT_SUMPNER_PARAMS.wpIRange,
    wsDivisions: raw.wsDivisions ?? DEFAULT_SUMPNER_PARAMS.wsDivisions,
    wsPf: raw.wsPf ?? DEFAULT_SUMPNER_PARAMS.wsPf,
    wsDefaultVRange: raw.wsDefaultVRange ?? DEFAULT_SUMPNER_PARAMS.wsDefaultVRange,
    wsDefaultIRange: raw.wsDefaultIRange ?? DEFAULT_SUMPNER_PARAMS.wsDefaultIRange,
  };
}

/**
 * Resolves deterministic tx2 LV polarity inversion from explicit params or session seed.
 */
export function resolveTx2PolarityFlipped(
  seed = 202601,
  params: Record<string, number> = {},
): boolean {
  if ('tx2PolarityFlipped' in params) {
    return params.tx2PolarityFlipped !== 0;
  }
  return deriveHiddenPolarity(seed, 'tx2.polarity') === -1;
}

/**
 * Deterministic tiny residual voltage (0 to 0.35 V) in series-opposition
 * representing slight core mismatch between two identical lab transformers.
 */
export function resolveOppositionResidualV(seed = 202601): number {
  const rand = createSeededRng(hashSeed(seed, 'ex3.3.vpol.residual'));
  return Number((rand() * 0.35).toFixed(2));
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

export interface SumpnerMethodTruth {
  Vp: number;
  Ip: number;
  Wp: number;
  Pi: number;
  R2: number;
  X2: number;
  Pc: number;
  VR_lag08: number;
  VR_lead08: number;
  xMaxEff: number;
}

/**
 * Computes noise-free method truth by applying the manual's Eqs. (3.3.1)-(3.3.7)
 * to noise-free Sumpner primary (230 V) and secondary (17.39 A) model outputs.
 */
export function computeSumpnerMethodTruth(
  rawParams: Record<string, number>,
): SumpnerMethodTruth {
  const p = extractSumpnerParams(rawParams);

  const Vp = p.V1rated;
  const yoSingle = Math.hypot(1 / p.rc_hv, 1 / p.xm_hv);
  const Ip = 2 * Vp * yoSingle;
  const Wp = 2 * ((Vp * Vp) / p.rc_hv);
  const Pi = Wp / 2;

  const Z2eq = Math.hypot(p.R2eq, p.X2eq);
  const Is = p.I2rated;
  const Vs = Is * 2 * Z2eq;
  const Ws = 2 * Is * Is * p.R2eq;

  const Z2 = Vs / 2 / Is;
  const R2 = Ws / 2 / (Is * Is);
  const X2 = Math.sqrt(Math.max(0, Z2 * Z2 - R2 * R2));
  const Pc = (p.I2rated / Is) ** 2 * (Ws / 2);

  const VR_lag08 = (p.I2rated / p.V2rated) * (R2 * 0.8 + X2 * 0.6) * 100;
  const VR_lead08 = (p.I2rated / p.V2rated) * (R2 * 0.8 - X2 * 0.6) * 100;
  const xMaxEff = Math.sqrt(Pi / Pc);

  return {
    Vp,
    Ip,
    Wp,
    Pi,
    R2,
    X2,
    Pc,
    VR_lag08,
    VR_lead08,
    xMaxEff,
  };
}

export const sumpnerModel: PhysicsModel<SumpnerConnectionState> = {
  id: 'sumpner',

  deriveConnectionState(
    nets: NetGraphLike,
    controls: ControlValues,
    stageParams: Record<string, number>,
    faults: FaultPattern[] = [],
    seed = 202601,
  ): SumpnerConnectionState {
    const p = extractSumpnerParams(stageParams);
    const tx2PolarityFlipped = resolveTx2PolarityFlipped(seed, stageParams);
    const faultIds = faults.map((f) => f.id);
    const shortFaults = faults.filter((f) => f.effect === 'short');
    const shorted = shortFaults.length > 0;
    const supplyOn = Boolean(controls['sup.switch']);

    const vpInSeries = faultIds.includes('vp-in-series');
    const vsInSeries = faultIds.includes('vs-in-series');

    // Primary side connectivity
    const supConnectedToVaP =
      nets.areConnected('sup.P', 'vaP.IN_P') &&
      nets.areConnected('sup.N', 'vaP.IN_N');
    const priNeutral: TerminalId[] = ['sup.N', 'vaP.IN_N', 'vaP.OUT_N', 'tx1.P2', 'tx2.P2'];

    const wpCcFwd =
      nets.areConnected('vaP.OUT_P', 'wp.M') &&
      (nets.areConnected('wp.L', 'ap.IN') ||
        nets.areConnected('wp.L', 'ap.OUT') ||
        nets.areConnected('wp.L', 'tx1.P1') ||
        nets.areConnected('wp.L', 'tx2.P1'));
    const wpCcRev =
      nets.areConnected('vaP.OUT_P', 'wp.L') &&
      (nets.areConnected('wp.M', 'ap.IN') ||
        nets.areConnected('wp.M', 'ap.OUT') ||
        nets.areConnected('wp.M', 'tx1.P1') ||
        nets.areConnected('wp.M', 'tx2.P1'));
    const wpExit: TerminalId = wpCcFwd ? 'wp.L' : wpCcRev ? 'wp.M' : 'vaP.OUT_P';

    const apInSeriesTx1 =
      (nets.areConnected(wpExit, 'ap.IN') && nets.areConnected('ap.OUT', 'tx1.P1')) ||
      (nets.areConnected(wpExit, 'ap.OUT') && nets.areConnected('ap.IN', 'tx1.P1'));
    const apInSeriesTx2 =
      (nets.areConnected(wpExit, 'ap.IN') && nets.areConnected('ap.OUT', 'tx2.P1')) ||
      (nets.areConnected(wpExit, 'ap.OUT') && nets.areConnected('ap.IN', 'tx2.P1'));

    const tx1PrimaryEnergised =
      supplyOn &&
      !shorted &&
      !vpInSeries &&
      supConnectedToVaP &&
      nets.areConnected('tx1.P2', 'sup.N') &&
      (apInSeriesTx1 || nets.areConnected(wpExit, 'tx1.P1'));
    const tx2PrimaryEnergised =
      supplyOn &&
      !shorted &&
      !vpInSeries &&
      supConnectedToVaP &&
      nets.areConnected('tx2.P2', 'sup.N') &&
      (apInSeriesTx2 || nets.areConnected(wpExit, 'tx2.P1'));

    const primaryEnergised = tx1PrimaryEnergised || tx2PrimaryEnergised;
    const apInSeries =
      (tx1PrimaryEnergised && apInSeriesTx1) ||
      (tx2PrimaryEnergised && apInSeriesTx2);

    const priLiveTerms: TerminalId[] = [
      'vaP.OUT_P',
      'wp.M',
      'wp.L',
      'ap.IN',
      'ap.OUT',
      'tx1.P1',
      'tx2.P1',
    ];
    const vpConnected =
      supplyOn &&
      !shorted &&
      supConnectedToVaP &&
      (pairAcross(
        nets,
        'vp.A',
        'vp.B',
        ['vaP.OUT_P', 'wp.M', 'wp.L', 'tx1.P1', 'tx2.P1'],
        priNeutral,
      ) ||
        vpInSeries);

    const wpPcFwd =
      anyConnectedTo(nets, 'wp.V1', priLiveTerms) &&
      anyConnectedTo(nets, 'wp.V2', priNeutral);
    const wpPcRev =
      anyConnectedTo(nets, 'wp.V1', priNeutral) &&
      anyConnectedTo(nets, 'wp.V2', priLiveTerms);
    const wpPcEnergised =
      supplyOn && !shorted && supConnectedToVaP && (wpPcFwd || wpPcRev);
    const wpCcEnergised = primaryEnergised && (wpCcFwd || wpCcRev);
    const wpReversed = wpCcRev !== wpPcRev;

    // Secondary polarity join detection
    const s1s2 = nets.areConnected('tx1.S1', 'tx2.S2');
    const s2s1 = nets.areConnected('tx1.S2', 'tx2.S1');
    const s1s1 = nets.areConnected('tx1.S1', 'tx2.S1');
    const s2s2 = nets.areConnected('tx1.S2', 'tx2.S2');

    const oppPairA = tx2PolarityFlipped ? s1s2 : s1s1;
    const oppPairB = tx2PolarityFlipped ? s2s1 : s2s2;
    const aidPairA = tx2PolarityFlipped ? s1s1 : s1s2;
    const aidPairB = tx2PolarityFlipped ? s2s2 : s2s1;

    const oppositionJoined =
      (oppPairA && !oppPairB) || (oppPairB && !oppPairA);
    const aidingJoined = aidPairA || aidPairB;

    // Polarity voltmeter vpol (Stage 1)
    let vpolConnected = false;
    if (p.stageMode === 1 && primaryEnergised) {
      if (tx2PolarityFlipped) {
        if (s1s2 && !s2s1) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['tx1.S2'], ['tx2.S1']);
        } else if (s2s1 && !s1s2) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['tx1.S1'], ['tx2.S2']);
        } else if (s1s1 && !s2s2) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['tx1.S2'], ['tx2.S2']);
        } else if (s2s2 && !s1s1) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['tx1.S1'], ['tx2.S1']);
        }
      } else {
        if (s1s1 && !s2s2) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['tx1.S2'], ['tx2.S2']);
        } else if (s2s2 && !s1s1) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['tx1.S1'], ['tx2.S1']);
        } else if (s1s2 && !s2s1) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['tx1.S2'], ['tx2.S1']);
        } else if (s2s1 && !s1s2) {
          vpolConnected = pairAcross(nets, 'vpol.A', 'vpol.B', ['tx1.S1'], ['tx2.S2']);
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
        tx2PolarityFlipped,
        tx1PrimaryEnergised,
        tx2PrimaryEnergised,
        primaryEnergised,
        secondaryEnergised: false,
        oppositionJoined,
        aidingJoined,
        vpConnected,
        apInSeries,
        wpCcEnergised,
        wpPcEnergised,
        wpReversed,
        vpolConnected,
        vsConnected: false,
        asInSeries: false,
        wsCcEnergised: false,
        wsPcEnergised: false,
        wsReversed: false,
        vpInSeries,
        vsInSeries: false,
      };
    }

    // Stage 2: Secondary loop through vaS, as, ws, vs, and opposing secondaries
    const supConnectedToVaS =
      nets.areConnected('sup.P', 'vaS.IN_P') &&
      nets.areConnected('sup.N', 'vaS.IN_N');
    const secNeutralNodes: TerminalId[] = ['sup.N', 'vaS.IN_N', 'vaS.OUT_N'];

    const asInSeries =
      (nets.areConnected('vaS.OUT_P', 'as.IN') &&
        (nets.areConnected('as.OUT', 'ws.M') ||
          nets.areConnected('as.OUT', 'ws.L') ||
          nets.areConnected('as.OUT', 'tx1.S2') ||
          nets.areConnected('as.OUT', 'tx2.S1'))) ||
      (nets.areConnected('vaS.OUT_P', 'as.OUT') &&
        (nets.areConnected('as.IN', 'ws.M') ||
          nets.areConnected('as.IN', 'ws.L') ||
          nets.areConnected('as.IN', 'tx1.S2') ||
          nets.areConnected('as.IN', 'tx2.S1')));

    const asExitCandidates: TerminalId[] = asInSeries
      ? ['as.OUT', 'as.IN']
      : ['vaS.OUT_P'];

    const wsExitCandidates: TerminalId[] = ['ws.L', 'ws.M', 'vaS.OUT_P'];
    const wsCcFwd =
      anyConnectedTo(nets, 'ws.M', asExitCandidates) &&
      (nets.areConnected('ws.L', 'tx1.S2') || nets.areConnected('ws.L', 'tx2.S1'));
    const wsCcRev =
      anyConnectedTo(nets, 'ws.L', asExitCandidates) &&
      (nets.areConnected('ws.M', 'tx1.S2') || nets.areConnected('ws.M', 'tx2.S1'));

    const secFeedTerminal: TerminalId = wsCcFwd
      ? 'ws.L'
      : wsCcRev
        ? 'ws.M'
        : asInSeries
          ? 'as.OUT'
          : 'vaS.OUT_P';

    const loopOrientationA =
      nets.areConnected(secFeedTerminal, 'tx1.S2') &&
      nets.areConnected('tx2.S1', 'vaS.OUT_N');
    const loopOrientationB =
      nets.areConnected(secFeedTerminal, 'tx2.S1') &&
      nets.areConnected('tx1.S2', 'vaS.OUT_N');

    const secondaryEnergised =
      supplyOn &&
      !shorted &&
      !vsInSeries &&
      supConnectedToVaS &&
      oppositionJoined &&
      (loopOrientationA || loopOrientationB) &&
      (wsCcFwd ||
        wsCcRev ||
        anyConnectedTo(nets, 'tx1.S2', wsExitCandidates) ||
        anyConnectedTo(nets, 'tx2.S1', wsExitCandidates));

    const secLiveTerms: TerminalId[] = [
      'vaS.OUT_P',
      'as.IN',
      'as.OUT',
      'ws.M',
      'ws.L',
      'tx1.S2',
      'tx2.S1',
    ];
    const secNeutralAll: TerminalId[] = [
      ...secNeutralNodes,
      ...(loopOrientationA ? ['tx2.S1' as TerminalId] : []),
      ...(loopOrientationB ? ['tx1.S2' as TerminalId] : []),
    ];

    const vsConnected =
      supplyOn &&
      !shorted &&
      supConnectedToVaS &&
      (pairAcross(
        nets,
        'vs.A',
        'vs.B',
        ['ws.L', 'ws.M', 'vaS.OUT_P', 'tx1.S2', 'tx2.S1'],
        secNeutralAll,
      ) ||
        vsInSeries);

    const wsPcFwd =
      anyConnectedTo(nets, 'ws.V1', secLiveTerms) &&
      anyConnectedTo(nets, 'ws.V2', secNeutralAll);
    const wsPcRev =
      anyConnectedTo(nets, 'ws.V1', secNeutralAll) &&
      anyConnectedTo(nets, 'ws.V2', secLiveTerms);

    const wsPcEnergised =
      supplyOn && !shorted && supConnectedToVaS && (wsPcFwd || wsPcRev);
    const wsCcEnergised = secondaryEnergised && (wsCcFwd || wsCcRev);
    const wsReversed = wsCcRev !== wsPcRev;

    return {
      stageMode: 2,
      shorted,
      shortFaults,
      matchedFaultIds: faultIds,
      energised: primaryEnergised || secondaryEnergised,
      tx2PolarityFlipped,
      tx1PrimaryEnergised,
      tx2PrimaryEnergised,
      primaryEnergised,
      secondaryEnergised,
      oppositionJoined,
      aidingJoined,
      vpConnected,
      apInSeries,
      wpCcEnergised,
      wpPcEnergised,
      wpReversed,
      vpolConnected: false,
      vsConnected,
      asInSeries,
      wsCcEnergised,
      wsPcEnergised,
      wsReversed,
      vpInSeries,
      vsInSeries,
    };
  },

  solve(input: PhysicsSolveInput<SumpnerConnectionState>): PhysicsSolveOutput {
    const p = extractSumpnerParams(input.params);
    const conn = input.connectionState;
    const supplyOn = Boolean(input.controls['sup.switch']);
    const vSetP = Number(input.controls['vaP.knob'] ?? 0);
    const vSetS = Number(input.controls['vaS.knob'] ?? 0);
    const wpReverse = Boolean(input.controls['wp.reverse']);
    const wsVRange = Number(input.controls['ws.vRange'] ?? p.wsDefaultVRange);
    const wsIRange = Number(input.controls['ws.iRange'] ?? p.wsDefaultIRange);
    const wsReverse = Boolean(input.controls['ws.reverse']);

    const labelOf = (id: string, fallback: string) =>
      input.components?.find((c) => c.id === id)?.label ?? fallback;

    const events: RuntimeEvent[] = [];

    const buildOutput = (
      Vp: number,
      Ip: number,
      Wp: number,
      Vpol: number,
      Vs: number,
      Is: number,
      Ws: number,
      mcbTripped: boolean,
      runFailed: boolean,
    ): PhysicsSolveOutput => {
      const vpReading = evaluateAnalogMeter(
        conn.vpConnected ? Vp : 0,
        p.vpRange,
        input.gains.vp ?? 0,
      );
      const apReading = evaluateAnalogMeter(
        conn.apInSeries && conn.primaryEnergised ? Ip : 0,
        p.apRange,
        input.gains.ap ?? 0,
      );
      const wpReading = evaluateWattmeter(
        conn.wpCcEnergised && conn.wpPcEnergised ? Wp : 0,
        conn.wpPcEnergised ? Vp : 0,
        conn.wpCcEnergised ? Ip : 0,
        p.wpVRange,
        p.wpIRange,
        input.gains.wp ?? 0,
        conn.wpReversed,
        p.wpDivisions,
        p.wpPf,
        wpReverse,
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
            toAnalogMeterReading('ap', labelOf('ap', 'Primary Ammeter'), 'ammeter', 'A', apReading, 2),
            toWattmeterMeterReading('wp', labelOf('wp', 'Primary Wattmeter'), wpReading, 1),
            toAnalogMeterReading('vpol', labelOf('vpol', 'Polarity Voltmeter'), 'voltmeter', 'V', vpolReading, 1),
          ],
          events,
          mcbTripped,
          runFailed,
          outputs: { Vp, Ip, Wp, Vpol, Vs: 0, Is: 0, Ws: 0, V: Vp, I: Ip, P: Wp },
        };
      }

      const vsReading = evaluateAnalogMeter(
        conn.vsConnected ? Vs : 0,
        p.vsRange,
        input.gains.vs ?? 0,
      );
      const asReading = evaluateAnalogMeter(
        conn.asInSeries && conn.secondaryEnergised ? Is : 0,
        p.asRange,
        input.gains.as ?? 0,
      );
      const wsReading = evaluateWattmeter(
        conn.wsCcEnergised && conn.wsPcEnergised ? Ws : 0,
        conn.wsPcEnergised ? Vs : 0,
        conn.wsCcEnergised ? Is : 0,
        wsVRange,
        wsIRange,
        input.gains.ws ?? 0,
        conn.wsReversed,
        p.wsDivisions,
        p.wsPf,
        wsReverse,
      );

      if (supplyOn && !mcbTripped) {
        if (vsReading.damaged) {
          events.push({
            id: 'vs-damaged',
            severity: 'danger',
            message: 'Secondary voltmeter damaged (>150% range). Reads zero.',
          });
        } else if (vsReading.overrange) {
          events.push({
            id: 'vs-overrange',
            severity: 'warning',
            message: 'Secondary voltmeter overrange — pointer pegged.',
          });
        }
        if (asReading.damaged) {
          events.push({
            id: 'as-damaged',
            severity: 'danger',
            message: 'Secondary ammeter damaged (>150% range). Reads zero.',
          });
        } else if (asReading.overrange) {
          events.push({
            id: 'as-overrange',
            severity: 'warning',
            message: 'Secondary ammeter overrange — pointer pegged.',
          });
        }
        if (wsReading.damaged) {
          events.push({
            id: 'ws-damaged',
            severity: 'danger',
            message: 'Secondary wattmeter damaged (>150% coil rating). Reads zero.',
          });
        } else if (wsReading.overrange) {
          events.push({
            id: 'ws-overrange',
            severity: 'warning',
            message: wsReading.ccOverrange
              ? `Secondary wattmeter current coil overrange (${wsReading.i1.toFixed(2)} A > ${wsIRange} A) — pointer pegged.`
              : wsReading.pcOverrange
                ? `Secondary wattmeter pressure coil overrange (${wsReading.v1.toFixed(1)} V > ${wsVRange} V) — pointer pegged.`
                : 'Secondary wattmeter overrange — pointer pegged.',
          });
        }
      }

      return {
        meters: [
          toAnalogMeterReading('vp', labelOf('vp', 'Primary Voltmeter'), 'voltmeter', 'V', vpReading, 1),
          toAnalogMeterReading('ap', labelOf('ap', 'Primary Ammeter'), 'ammeter', 'A', apReading, 2),
          toWattmeterMeterReading('wp', labelOf('wp', 'Primary Wattmeter'), wpReading, 1),
          toAnalogMeterReading('vs', labelOf('vs', 'Secondary Voltmeter'), 'voltmeter', 'V', vsReading, 2),
          toAnalogMeterReading('as', labelOf('as', 'Secondary Ammeter'), 'ammeter', 'A', asReading, 2),
          toWattmeterMeterReading('ws', labelOf('ws', 'Secondary Wattmeter'), wsReading, 1),
        ],
        events,
        mcbTripped,
        runFailed,
        outputs: { Vp, Ip, Wp, Vpol: 0, Vs, Is, Ws, V: Vs, I: Is, P: Ws },
      };
    };

    if (!supplyOn) {
      return buildOutput(0, 0, 0, 0, 0, 0, 0, false, false);
    }

    if (conn.shorted) {
      const shortMsg =
        conn.shortFaults[0]?.description ??
        'Short circuit detected. MCB tripped.';
      events.push({
        id: 'mcb-trip',
        severity: 'danger',
        message: `MCB tripped: ${shortMsg}`,
      });
      return buildOutput(0, 0, 0, 0, 0, 0, 0, true, true);
    }

    // Solve primary circuit (independent of secondary current in series-opposition)
    const txCount =
      (conn.tx1PrimaryEnergised ? 1 : 0) + (conn.tx2PrimaryEnergised ? 1 : 0);
    const rsP = input.options?.noSag ? 0 : p.Rs_primary;
    const yoSingle = Math.hypot(1 / p.rc_hv, 1 / p.xm_hv);

    let Vp = 0;
    let Ip = 0;
    let Wp = 0;

    if (conn.vpInSeries) {
      Vp = vSetP;
    } else if (!conn.primaryEnergised) {
      if (conn.vpConnected) Vp = vSetP;
    } else {
      Vp = vSetP;
      const iterations = rsP === 0 ? 1 : 6;
      for (let k = 0; k < iterations; k++) {
        Ip = txCount * Vp * yoSingle;
        Vp = Math.max(0, vSetP - Ip * rsP);
      }
      Ip = txCount * Vp * yoSingle;
      Wp = txCount * ((Vp * Vp) / p.rc_hv);
    }

    if (Vp > p.V1rated * 1.1) {
      events.push({
        id: 'primary-overvoltage',
        severity: 'warning',
        message: `Primary voltage (${Vp.toFixed(1)} V) exceeds 110% of rated 230 V.`,
      });
    }

    // Solve Stage 1 polarity voltmeter reading
    let Vpol = 0;
    if (p.stageMode === 1 && conn.vpolConnected && conn.primaryEnergised) {
      if (txCount === 2) {
        if (conn.aidingJoined) {
          Vpol = 2 * p.V2rated * (Vp / p.V1rated);
          if (Vp > 10) {
            events.push({
              id: 'polarity-aiding',
              severity: 'danger',
              message: `Series-aiding polarity detected (vpol = ${Vpol.toFixed(1)} V). Shut off supply and join tx1.S1 to tx2.S2 for series-opposition (~0 V).`,
            });
          }
        } else if (conn.oppositionJoined) {
          const resScale = Vp / p.V1rated;
          Vpol = resolveOppositionResidualV(input.seed) * resScale;
        }
      } else if (txCount === 1) {
        Vpol = p.V2rated * (Vp / p.V1rated);
      }
    }

    if (p.stageMode === 1) {
      return buildOutput(Vp, Ip, Wp, Vpol, 0, 0, 0, false, false);
    }

    // Solve Stage 2 secondary circulating loop
    let Vs = 0;
    let Is = 0;
    let Ws = 0;

    if (conn.vsInSeries) {
      Vs = vSetS;
    } else if (!conn.secondaryEnergised) {
      if (conn.vsConnected) Vs = vSetS;
    } else {
      const Z2eq = Math.hypot(p.R2eq, p.X2eq);
      const loopZ = 2 * Z2eq;
      const rsS = input.options?.noSag ? 0 : p.Rs_secondary;
      Vs = vSetS;
      const iterations = rsS === 0 ? 1 : 6;
      for (let k = 0; k < iterations; k++) {
        Is = Vs / loopZ;
        Vs = Math.max(0, vSetS - Is * rsS);
      }
      Is = Vs / loopZ;
      Ws = 2 * Is * Is * p.R2eq;
    }

    let runFailed = false;
    if (Is > p.I2rated * 1.25) {
      runFailed = true;
      events.push({
        id: 'transformer-overheating',
        severity: 'danger',
        message: `Transformer overheating: Is (${Is.toFixed(2)} A) exceeds 125% rated LV current (${(p.I2rated * 1.25).toFixed(1)} A). Run failed.`,
      });
    } else if (Is > p.I2rated * 1.1) {
      events.push({
        id: 'transformer-overload',
        severity: 'warning',
        message: `Transformer overload warning: Is (${Is.toFixed(2)} A) exceeds 110% rated LV current (${(p.I2rated * 1.1).toFixed(1)} A).`,
      });
    }

    return buildOutput(Vp, Ip, Wp, 0, Vs, Is, Ws, false, runFailed);
  },
};
