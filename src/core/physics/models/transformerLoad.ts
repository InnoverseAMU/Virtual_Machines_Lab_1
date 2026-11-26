import {
  DEFAULT_METER_GAINS,
  evaluateAnalogMeter,
  evaluateWattmeter,
} from '../meters';
import type {
  ConnectionState,
  MeterGains,
  RuntimeEvent,
  TransformerLoadControls,
  TransformerLoadOutput,
} from '../../types';

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
    // High-impedance voltmeter in series with primary blocks load current
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
