import type {
  AnalogMeterReading,
  MeterGains,
  MeterKind,
  MeterReading,
  WattmeterReading,
} from '../types';

export const DEFAULT_METER_GAINS: MeterGains = {
  vp: 0,
  vs: 0,
  am: 0,
  wm: 0,
};

/**
 * Deterministic Mulberry32 PRNG for reproducible per-session meter gain errors
 * and seeded hidden apparatus state.
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
 * Combines a numeric session seed with a string key (e.g. 'tx.polarity')
 * into a deterministic 32-bit unsigned sub-seed.
 */
export function hashSeed(seed: number, key: string): number {
  let h = (seed >>> 0) ^ 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Derives a deterministic +/-1 hidden polarity flip from the session seed.
 */
export function deriveHiddenPolarity(seed: number, key: string): 1 | -1 {
  const rand = createSeededRng(hashSeed(seed, key));
  return rand() < 0.5 ? 1 : -1;
}

/**
 * Derives a deterministic hidden terminal scramble permutation from the session seed.
 */
export function deriveHiddenTerminalScramble<T extends string>(
  seed: number,
  key: string,
  terminals: readonly T[],
): T[] {
  const copy = [...terminals];
  const rand = createSeededRng(hashSeed(seed, key));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Draws class 0.5 gain errors (within +/- 0.5%) once per session.
 * Always populates vp, vs, am, wm plus any additional meterIds requested.
 */
export function drawSessionMeterGains(
  seed: number,
  meterIds: string[] = ['vp', 'vs', 'am', 'wm'],
): MeterGains {
  const rand = createSeededRng(seed);
  const drawGain = () => (rand() * 2 - 1) * 0.005;
  const gains: MeterGains = {
    vp: drawGain(),
    vs: drawGain(),
    am: drawGain(),
    wm: drawGain(),
  };
  for (const id of meterIds) {
    if (!(id in gains)) {
      gains[id] = drawGain();
    }
  }
  return gains;
}

export interface AnalogMeterOptions {
  reversed?: boolean;
  allowNegative?: boolean;
}

export function evaluateAnalogMeter(
  trueValue: number,
  range: number,
  gain = 0,
  options: AnalogMeterOptions = {},
): AnalogMeterReading {
  const absTrue = Math.abs(trueValue);
  const damaged = absTrue > range * 1.5;
  const isReversed = Boolean(options.reversed) || (Boolean(options.allowNegative) && trueValue < 0);
  const signedTrue = isReversed ? -absTrue : absTrue;
  const shownValue = damaged ? 0 : signedTrue * (1 + gain);
  const overrange = !damaged && Math.abs(shownValue) > range;
  const ratio = range > 0 ? shownValue / range : 0;

  let pointerRatio = 0;
  if (!damaged) {
    if (isReversed && shownValue < 0) {
      pointerRatio = Math.max(-0.05, Math.min(0, ratio));
    } else {
      pointerRatio = Math.min(1.05, Math.max(0, ratio));
    }
  }

  return {
    trueValue: signedTrue,
    shownValue,
    range,
    ratio,
    pointerRatio,
    overrange,
    damaged,
    reversed: isReversed && !damaged && absTrue > 0,
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
  pf = 1.0,
  reverseSwitch = false,
): WattmeterReading {
  const mf = (vRange * iRange * pf) / divisions;
  const ccOverrange = Math.abs(i1) > iRange;
  const pcOverrange = Math.abs(v1) > vRange;
  const damaged = Math.abs(i1) > iRange * 1.5 || Math.abs(v1) > vRange * 1.5;

  // Electrical sign combined with reverse switch: flipping the reverse switch flips the shown sign
  const baseSignedPower = reversed ? -Math.abs(truePower) : truePower;
  const signedTruePower = reverseSwitch ? -baseSignedPower : baseSignedPower;
  const isNegative = signedTruePower < 0;

  const shownValue = damaged ? 0 : signedTruePower * (1 + gain);
  const dial = mf > 0 ? shownValue / mf : 0;
  const fullScalePower = vRange * iRange * pf;
  const ratio = fullScalePower > 0 ? shownValue / fullScalePower : 0;
  const overrange =
    !damaged &&
    (ccOverrange || pcOverrange || Math.abs(shownValue) > fullScalePower);

  let pointerRatio = 0;
  if (!damaged) {
    if (isNegative && shownValue < 0) {
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
    reversed: isNegative && !damaged && Math.abs(signedTruePower) > 0,
    vRange,
    iRange,
    divisions,
    pf,
    mf,
    dial,
    i1,
    v1,
    ccOverrange,
    pcOverrange,
  };
}

export function toAnalogMeterReading(
  id: string,
  label: string,
  kind: Extract<MeterKind, 'voltmeter' | 'ammeter'>,
  unit: string,
  reading: AnalogMeterReading,
  decimals = kind === 'ammeter' ? 2 : 1,
): MeterReading {
  return {
    id,
    label,
    kind,
    unit,
    decimals,
    ...reading,
  };
}

export function toWattmeterMeterReading(
  id: string,
  label: string,
  reading: WattmeterReading,
  decimals = 1,
): MeterReading {
  return {
    id,
    label,
    kind: 'wattmeter',
    unit: 'W',
    decimals,
    ...reading,
  };
}

export interface WattmeterCcLinkMode {
  short: 'SER' | 'S-P' | 'PAR';
  label: 'Series' | 'All-Series' | 'Series-Parallel' | 'Parallel';
}

/**
 * Maps a wattmeter current-coil range selector value onto its physical
 * Series / Parallel coil-half link arrangement.
 */
export function describeWattmeterCcLinkMode(
  iRange: number,
  options: readonly number[],
): WattmeterCcLinkMode | null {
  if (options.length < 2) return null;
  const sorted = [...options].sort((a, b) => a - b);
  const idx = sorted.indexOf(iRange);
  if (idx < 0) return null;
  if (sorted.length === 2) {
    return idx === 0
      ? { short: 'SER', label: 'Series' }
      : { short: 'PAR', label: 'Parallel' };
  }
  if (idx === 0) return { short: 'SER', label: 'All-Series' };
  if (idx === sorted.length - 1) return { short: 'PAR', label: 'Parallel' };
  return { short: 'S-P', label: 'Series-Parallel' };
}
