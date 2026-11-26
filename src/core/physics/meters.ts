import type {
  AnalogMeterReading,
  MeterGains,
  WattmeterReading,
} from '../types';

export const DEFAULT_METER_GAINS: MeterGains = {
  vp: 0,
  vs: 0,
  am: 0,
  wm: 0,
};

/**
 * Deterministic Mulberry32 PRNG for reproducible per-session meter gain errors.
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draws class 0.5 gain errors (within +/- 0.5%) once per session.
 */
export function drawSessionMeterGains(seed: number): MeterGains {
  const rand = createSeededRng(seed);
  const drawGain = () => (rand() * 2 - 1) * 0.005;
  return {
    vp: drawGain(),
    vs: drawGain(),
    am: drawGain(),
    wm: drawGain(),
  };
}

export function evaluateAnalogMeter(
  trueValue: number,
  range: number,
  gain = 0,
): AnalogMeterReading {
  const absTrue = Math.abs(trueValue);
  const damaged = absTrue > range * 1.5;
  const shownValue = damaged ? 0 : absTrue * (1 + gain);
  const overrange = !damaged && shownValue > range;
  const ratio = range > 0 ? shownValue / range : 0;
  const pointerRatio = damaged ? 0 : Math.min(1.05, Math.max(0, ratio));

  return {
    trueValue: absTrue,
    shownValue,
    range,
    ratio,
    pointerRatio,
    overrange,
    damaged,
    reversed: false,
  };
}

export function evaluateWattmeter(
  truePower: number,
  v1: number,
  i1: number,
  vRange: number,
  iRange: number,
  gain = 0,
  reversed = false,
  divisions = 150,
): WattmeterReading {
  const mf = (vRange * iRange) / divisions;
  const ccOverrange = i1 > iRange;
  const pcOverrange = v1 > vRange;
  const damaged = i1 > iRange * 1.5 || v1 > vRange * 1.5;

  const signedTruePower = reversed ? -Math.abs(truePower) : Math.abs(truePower);
  const shownValue = damaged ? 0 : signedTruePower * (1 + gain);
  const dial = mf > 0 ? shownValue / mf : 0;
  const fullScalePower = vRange * iRange;
  const ratio = fullScalePower > 0 ? shownValue / fullScalePower : 0;
  const overrange =
    !damaged &&
    (ccOverrange || pcOverrange || Math.abs(shownValue) > fullScalePower);

  let pointerRatio = 0;
  if (!damaged) {
    if (reversed && shownValue < 0) {
      pointerRatio = Math.max(-0.05, Math.min(0, ratio));
    } else if (ccOverrange || pcOverrange) {
      pointerRatio = 1.05;
    } else {
      pointerRatio = Math.min(1.05, Math.max(0, ratio));
    }
  }

  return {
    trueValue: signedTruePower,
    shownValue,
    range: fullScalePower,
    ratio,
    pointerRatio,
    overrange,
    damaged,
    reversed: reversed && !damaged && Math.abs(truePower) > 0,
    vRange,
    iRange,
    divisions,
    mf,
    dial,
    i1,
    v1,
    ccOverrange,
    pcOverrange,
  };
}
