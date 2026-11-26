import { matchFaultPatterns } from '../../circuit/faults';
import type {
  ConnectionState,
  ControlValues,
  FaultPattern,
  MeterGains,
  NetGraphLike,
  PhysicsModel,
  PhysicsSolveInput,
  PhysicsSolveOutput,
  RuntimeEvent,
  TerminalId,
  TransformerLoadControls,
  TransformerLoadOutput,
} from '../../types';
import {
  DEFAULT_METER_GAINS,
  evaluateAnalogMeter,
  evaluateWattmeter,
  toAnalogMeterReading,
  toWattmeterMeterReading,
} from '../meters';

export interface TransformerLoadParams {
  a: number;
  R2eq: number;
  X2eq: number;
  Pi: number;
  Io: number;
  Rs: number;
  lampR: number;
  V1rated: number;
  V2rated: number;
  I2rated: number;
  vpRange: number;
  vsRange: number;
  amRange: number;
  wmDivisions: number;
}

export interface SolveOptions {
  noSag?: boolean;
}

export const DEFAULT_TRANSFORMER_PARAMS: TransformerLoadParams = {
  a: 2,
  R2eq: 0.15,
  X2eq: 0.22,
  Pi: 20,
  Io: 0.35,
  Rs: 0.3,
  lampR: 66.125,
  V1rated: 230,
  V2rated: 115,
  I2rated: 17.39,
  vpRange: 300,
  vsRange: 150,
  amRange: 25,
  wmDivisions: 150,
};

export function extractTransformerParams(
  raw: Record<string, number>,
): TransformerLoadParams {
  return {
    a: raw.a ?? DEFAULT_TRANSFORMER_PARAMS.a,
    R2eq: raw.R2eq ?? DEFAULT_TRANSFORMER_PARAMS.R2eq,
    X2eq: raw.X2eq ?? DEFAULT_TRANSFORMER_PARAMS.X2eq,
    Pi: raw.Pi ?? DEFAULT_TRANSFORMER_PARAMS.Pi,
    Io: raw.Io ?? DEFAULT_TRANSFORMER_PARAMS.Io,
    Rs: raw.Rs ?? DEFAULT_TRANSFORMER_PARAMS.Rs,
    lampR: raw.lampR ?? DEFAULT_TRANSFORMER_PARAMS.lampR,
    V1rated: raw.V1rated ?? DEFAULT_TRANSFORMER_PARAMS.V1rated,
    V2rated: raw.V2rated ?? DEFAULT_TRANSFORMER_PARAMS.V2rated,
    I2rated: raw.I2rated ?? DEFAULT_TRANSFORMER_PARAMS.I2rated,
    vpRange: raw.vpRange ?? DEFAULT_TRANSFORMER_PARAMS.vpRange,
    vsRange: raw.vsRange ?? DEFAULT_TRANSFORMER_PARAMS.vsRange,
    amRange: raw.amRange ?? DEFAULT_TRANSFORMER_PARAMS.amRange,
    wmDivisions: raw.wmDivisions ?? DEFAULT_TRANSFORMER_PARAMS.wmDivisions,
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

/**
 * Derives the electrical ConnectionState from student nets and matched faults
 * so the transformerLoad model behaves like a real bench for both correct and faulty wirings.
 */
export function deriveTransformerLoadConnectionState(
  graph: NetGraphLike,
  faults: FaultPattern[],
  supplyOn: boolean,
): ConnectionState {
  const faultIds = faults.map((f) => f.id);
  const shortFaults = faults.filter((f) => f.effect === 'short');
  const shorted = shortFaults.length > 0;

  const variacBypassed =
    graph.areConnected('sup.P', 'va.OUT_P') ||
    graph.areConnected('sup.P', 'wm.M') ||
    graph.areConnected('sup.P', 'wm.L');

  const supConnectedToVariac =
    graph.areConnected('sup.P', 'va.IN_P') &&
    graph.areConnected('sup.N', 'va.IN_N');

  const liveSourceTerminals: TerminalId[] = variacBypassed
    ? ['sup.P']
    : ['va.OUT_P'];

  const ccForward =
    anyConnectedTo(graph, 'wm.M', liveSourceTerminals) &&
    graph.areConnected('wm.L', 'tx.P1');

  const ccReversed =
    anyConnectedTo(graph, 'wm.L', liveSourceTerminals) &&
    graph.areConnected('wm.M', 'tx.P1');

  const primaryDirectToTx = anyConnectedTo(graph, 'tx.P1', liveSourceTerminals);
  const primaryNeutralReturn = graph.areConnected('tx.P2', 'sup.N');

  const voltmeterInSeriesPrimary = faultIds.includes('voltmeter-in-series-primary');
  const voltmeterInSeriesLoad = faultIds.includes('voltmeter-in-series-load');

  const primaryPathClosed =
    (supConnectedToVariac || variacBypassed) &&
    primaryNeutralReturn &&
    (ccForward || ccReversed || primaryDirectToTx) &&
    !voltmeterInSeriesPrimary;

  const primaryEnergised = supplyOn && !shorted && primaryPathClosed;

  const neutralSide: TerminalId[] = ['sup.N', 'va.IN_N', 'va.OUT_N', 'tx.P2'];
  const primaryLiveSide: TerminalId[] = [
    'va.OUT_P',
    'wm.M',
    'wm.L',
    'tx.P1',
    ...(variacBypassed ? ['sup.P'] : []),
  ];

  const pcForward =
    anyConnectedTo(graph, 'wm.V1', primaryLiveSide) &&
    anyConnectedTo(graph, 'wm.V2', neutralSide);
  const pcReversed =
    anyConnectedTo(graph, 'wm.V1', neutralSide) &&
    anyConnectedTo(graph, 'wm.V2', primaryLiveSide);

  const wmPcEnergised =
    supplyOn &&
    !shorted &&
    (supConnectedToVariac || variacBypassed) &&
    (pcForward || pcReversed);

  const wmCcEnergised = primaryEnergised && (ccForward || ccReversed);
  const wmReversed = ccReversed !== pcReversed;

  const vpAcrossPrimary = pairAcross(
    graph,
    'vp.A',
    'vp.B',
    primaryLiveSide,
    neutralSide,
  );
  const vpConnected =
    supplyOn &&
    !shorted &&
    (supConnectedToVariac || variacBypassed) &&
    (vpAcrossPrimary || (voltmeterInSeriesPrimary && primaryNeutralReturn));

  const amForwardSide1 =
    graph.areConnected('tx.S1', 'am.IN') && graph.areConnected('am.OUT', 'ld.A');
  const amReverseSide1 =
    graph.areConnected('tx.S1', 'am.OUT') && graph.areConnected('am.IN', 'ld.A');
  const amSide2Forward =
    graph.areConnected('tx.S2', 'am.IN') && graph.areConnected('am.OUT', 'ld.B');
  const amSide2Reverse =
    graph.areConnected('tx.S2', 'am.OUT') && graph.areConnected('am.IN', 'ld.B');

  const ammeterInSeries =
    ((amForwardSide1 || amReverseSide1) && graph.areConnected('tx.S2', 'ld.B')) ||
    ((amSide2Forward || amSide2Reverse) && graph.areConnected('tx.S1', 'ld.A'));

  const directLoad =
    graph.areConnected('tx.S1', 'ld.A') && graph.areConnected('tx.S2', 'ld.B');

  const loadConnected =
    primaryEnergised &&
    !voltmeterInSeriesLoad &&
    (ammeterInSeries || directLoad);

  const secondarySide1: TerminalId[] = ['tx.S1'];
  const secondarySide2: TerminalId[] = ['tx.S2'];
  const vsAcrossTx = pairAcross(
    graph,
    'vs.A',
    'vs.B',
    secondarySide1,
    secondarySide2,
  );
  const vsAcrossLoad =
    loadConnected &&
    pairAcross(graph, 'vs.A', 'vs.B', ['ld.A', 'am.OUT'], ['ld.B']);
  const vsConnected =
    primaryEnergised && (vsAcrossTx || vsAcrossLoad || voltmeterInSeriesLoad);

  return {
    shorted,
    shortFaults,
    matchedFaultIds: faultIds,
    energised: primaryEnergised,
    variacBypassed,
    primaryEnergised,
    vpConnected,
    vsConnected,
    wmCcEnergised,
    wmPcEnergised,
    wmReversed,
    loadConnected,
    ammeterInSeries,
    voltmeterInSeriesLoad,
    voltmeterInSeriesPrimary,
  };
}

/**
 * Solves Exp 3.1 (load test of single-phase transformer) referred to the
 * secondary side with fixed-point supply sag and ConnectionState fault effects.
 */
export function solveTransformerLoad(
  params: TransformerLoadParams,
  controls: TransformerLoadControls,
  conn: ConnectionState,
  gains: MeterGains = DEFAULT_METER_GAINS,
  options: SolveOptions = {},
  wmPf = 1.0,
  wmReverseSwitch = false,
): TransformerLoadOutput {
  const events: RuntimeEvent[] = [];

  if (!controls.supplyOn) {
    return {
      V1: 0,
      I1: 0,
      V2: 0,
      I2: 0,
      Pout: 0,
      Pin: 0,
      Pcu: 0,
      Pi: 0,
      eta: 0,
      mcbTripped: false,
      runFailed: false,
      meters: {
        vp: evaluateAnalogMeter(0, params.vpRange, gains.vp),
        vs: evaluateAnalogMeter(0, params.vsRange, gains.vs),
        am: evaluateAnalogMeter(0, params.amRange, gains.am),
        wm: evaluateWattmeter(
          0,
          0,
          0,
          controls.wmVRange,
          controls.wmIRange,
          gains.wm,
          false,
          params.wmDivisions,
          wmPf,
          wmReverseSwitch,
        ),
      },
      events,
    };
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
    return {
      V1: 0,
      I1: 0,
      V2: 0,
      I2: 0,
      Pout: 0,
      Pin: 0,
      Pcu: 0,
      Pi: 0,
      eta: 0,
      mcbTripped: true,
      runFailed: true,
      meters: {
        vp: evaluateAnalogMeter(0, params.vpRange, gains.vp),
        vs: evaluateAnalogMeter(0, params.vsRange, gains.vs),
        am: evaluateAnalogMeter(0, params.amRange, gains.am),
        wm: evaluateWattmeter(
          0,
          0,
          0,
          controls.wmVRange,
          controls.wmIRange,
          gains.wm,
          false,
          params.wmDivisions,
          wmPf,
          wmReverseSwitch,
        ),
      },
      events,
    };
  }

  const effectiveVset = conn.variacBypassed
    ? params.V1rated
    : controls.variacV;
  const rs = options.noSag ? 0 : params.Rs;

  let V1 = 0;
  let I1 = 0;
  let V2 = 0;
  let I2 = 0;
  let Pout = 0;
  let Pcu = 0;
  let Pi = 0;
  let Pin = 0;
  let eta = 0;

  if (conn.voltmeterInSeriesPrimary) {
    V1 = effectiveVset;
  } else if (!conn.primaryEnergised) {
    if (conn.vpConnected) {
      V1 = effectiveVset;
    }
  } else {
    const activeLamps = conn.loadConnected
      ? Math.max(0, Math.round(controls.lamps))
      : 0;
    const RL = activeLamps === 0 ? Infinity : params.lampR / activeLamps;

    I1 = params.Io * (effectiveVset / params.V1rated);
    V1 = effectiveVset;
    let V1s = V1 / params.a;

    const iterations = rs === 0 ? 1 : 8;
    for (let k = 0; k < iterations; k++) {
      V1 = Math.max(0, effectiveVset - I1 * rs);
      V1s = V1 / params.a;
      I2 =
        activeLamps === 0
          ? 0
          : V1s / Math.hypot(params.R2eq + RL, params.X2eq);
      I1 = Math.hypot(I2 / params.a, params.Io * (V1 / params.V1rated));
    }

    V2 = activeLamps === 0 ? V1s : I2 * RL;
    Pout = activeLamps === 0 ? 0 : I2 * I2 * RL;
    Pcu = I2 * I2 * params.R2eq;
    Pi = params.Pi * (V1 / params.V1rated) ** 2;
    Pin = Pout + Pcu + Pi;
    eta = Pin > 0 ? Pout / Pin : 0;
  }

  const vp = evaluateAnalogMeter(
    conn.vpConnected ? V1 : 0,
    params.vpRange,
    gains.vp,
  );
  const vs = evaluateAnalogMeter(
    conn.vsConnected ? V2 : 0,
    params.vsRange,
    gains.vs,
  );
  const am = evaluateAnalogMeter(
    conn.ammeterInSeries && conn.loadConnected ? I2 : 0,
    params.amRange,
    gains.am,
  );
  const wm = evaluateWattmeter(
    conn.wmCcEnergised && conn.wmPcEnergised ? Pin : 0,
    conn.wmPcEnergised ? V1 : 0,
    conn.wmCcEnergised ? I1 : 0,
    controls.wmVRange,
    controls.wmIRange,
    gains.wm,
    conn.wmReversed,
    params.wmDivisions,
    wmPf,
    wmReverseSwitch,
  );

  let runFailed = false;

  if (V1 > 253) {
    events.push({
      id: 'primary-overvoltage',
      severity: 'warning',
      message: `Primary voltage (${V1.toFixed(1)} V) exceeds 110% of rated 230 V.`,
    });
  }

  if (I2 > 21.7) {
    runFailed = true;
    events.push({
      id: 'transformer-overheating',
      severity: 'danger',
      message: `Transformer overheating: I2 (${I2.toFixed(2)} A) exceeds 125% rated current (21.7 A). Run failed.`,
    });
  } else if (I2 > 19.1) {
    events.push({
      id: 'transformer-overload',
      severity: 'warning',
      message: `Transformer overload warning: I2 (${I2.toFixed(2)} A) exceeds 110% rated current (19.1 A).`,
    });
  }

  if (vp.damaged) {
    events.push({
      id: 'vp-damaged',
      severity: 'danger',
      message: 'Primary voltmeter damaged (>150% range). Reads zero.',
    });
  } else if (vp.overrange) {
    events.push({
      id: 'vp-overrange',
      severity: 'warning',
      message: 'Primary voltmeter overrange — pointer pegged.',
    });
  }

  if (vs.damaged) {
    events.push({
      id: 'vs-damaged',
      severity: 'danger',
      message: 'Secondary voltmeter damaged (>150% range). Reads zero.',
    });
  } else if (vs.overrange) {
    events.push({
      id: 'vs-overrange',
      severity: 'warning',
      message: 'Secondary voltmeter overrange — pointer pegged.',
    });
  }

  if (am.damaged) {
    events.push({
      id: 'am-damaged',
      severity: 'danger',
      message: 'Secondary ammeter damaged (>150% range). Reads zero.',
    });
  } else if (am.overrange) {
    events.push({
      id: 'am-overrange',
      severity: 'warning',
      message: 'Secondary ammeter overrange — pointer pegged.',
    });
  }

  if (wm.damaged) {
    events.push({
      id: 'wm-damaged',
      severity: 'danger',
      message: 'Wattmeter damaged (>150% coil rating). Reads zero.',
    });
  } else if (wm.overrange) {
    events.push({
      id: 'wm-overrange',
      severity: 'warning',
      message:
        wm.ccOverrange && wm.pcOverrange
          ? 'Wattmeter current and voltage coils overrange — pointer pegged.'
          : wm.ccOverrange
            ? `Wattmeter current coil overrange (${I1.toFixed(2)} A > ${controls.wmIRange} A) — pointer pegged.`
            : wm.pcOverrange
              ? `Wattmeter pressure coil overrange (${V1.toFixed(1)} V > ${controls.wmVRange} V) — pointer pegged.`
              : 'Wattmeter overrange — pointer pegged.',
    });
  }

  return {
    V1,
    I1,
    V2,
    I2,
    Pout,
    Pin,
    Pcu,
    Pi,
    eta,
    mcbTripped: false,
    runFailed,
    meters: { vp, vs, am, wm },
    events,
  };
}

function readTransformerLoadControls(
  controls: ControlValues,
): { mapped: TransformerLoadControls; wmReverseSwitch: boolean } {
  const vRangeNum = Number(controls['wm.vRange'] ?? 300);
  const iRangeNum = Number(controls['wm.iRange'] ?? 10);
  const wmVRange: 150 | 300 = vRangeNum === 150 ? 150 : 300;
  const wmIRange: 2.5 | 5 | 10 =
    iRangeNum === 2.5 ? 2.5 : iRangeNum === 5 ? 5 : 10;

  return {
    mapped: {
      supplyOn: Boolean(controls['sup.switch']),
      variacV: Number(controls['va.knob'] ?? 0),
      wmVRange,
      wmIRange,
      lamps: Number(controls['ld.lamps'] ?? 0),
    },
    wmReverseSwitch: Boolean(controls['wm.reverse']),
  };
}

/**
 * PhysicsModel implementation registered under 'transformerLoad'.
 */
export const transformerLoadModel: PhysicsModel<ConnectionState> = {
  id: 'transformerLoad',

  deriveConnectionState(
    nets: NetGraphLike,
    controls: ControlValues,
    _stageParams: Record<string, number>,
    faults: FaultPattern[] = [],
  ): ConnectionState {
    // Callers passing NetGraph directly without pre-matched faults still get valid connection state;
    // when evaluateExperimentPhysics runs, it passes matched stage faults.
    const supplyOn = Boolean(controls['sup.switch']);
    return deriveTransformerLoadConnectionState(nets, faults, supplyOn);
  },

  solve(input: PhysicsSolveInput<ConnectionState>): PhysicsSolveOutput {
    const params = extractTransformerParams(input.params);
    const { mapped, wmReverseSwitch } = readTransformerLoadControls(input.controls);
    const gains: MeterGains = {
      vp: input.gains.vp ?? 0,
      vs: input.gains.vs ?? 0,
      am: input.gains.am ?? 0,
      wm: input.gains.wm ?? 0,
    };

    const wmComp = input.components?.find((c) => c.id === 'wm');
    const wmPf = Number(wmComp?.params.pf ?? 1.0);
    const out = solveTransformerLoad(
      params,
      mapped,
      input.connectionState,
      gains,
      { noSag: Boolean(input.options?.noSag) },
      wmPf,
      wmReverseSwitch,
    );

    const labelOf = (id: string, fallback: string) =>
      input.components?.find((c) => c.id === id)?.label ?? fallback;

    return {
      meters: [
        toAnalogMeterReading('vp', labelOf('vp', 'V primary'), 'voltmeter', 'V', out.meters.vp, 1),
        toAnalogMeterReading('vs', labelOf('vs', 'V secondary'), 'voltmeter', 'V', out.meters.vs, 1),
        toAnalogMeterReading('am', labelOf('am', 'A secondary'), 'ammeter', 'A', out.meters.am, 2),
        toWattmeterMeterReading('wm', labelOf('wm', 'Wattmeter'), out.meters.wm, 1),
      ],
      events: out.events,
      mcbTripped: out.mcbTripped,
      runFailed: out.runFailed,
      outputs: {
        V1: out.V1,
        I1: out.I1,
        V2: out.V2,
        I2: out.I2,
        Pout: out.Pout,
        Pin: out.Pin,
        Pcu: out.Pcu,
        Pi: out.Pi,
        eta: out.eta,
      },
    };
  },
};

export { matchFaultPatterns };
