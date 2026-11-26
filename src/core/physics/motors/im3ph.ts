/**
 * Shared 3-phase squirrel-cage induction motor nameplate and steady-state
 * equivalent-circuit solver (imported by Exp 4.1 & Exp 4.2).
 */
export interface IM3PHParams {
  Prated: number;
  VLrated: number;
  f: number;
  poles: number;
  ILrated: number;
  r1: number;
  x1: number;
  r2: number;
  x2: number;
  xm: number;
  rc: number;
  Pfw: number;
  pulleyRadiusM: number;
  ctRatio: number;
}

export const DEFAULT_IM3PH_PARAMS: IM3PHParams = {
  Prated: 1500,
  VLrated: 230,
  f: 50,
  poles: 4,
  ILrated: 5.93,
  r1: 4.0,
  x1: 5.5,
  r2: 4.2,
  x2: 5.5,
  xm: 120,
  rc: 1100,
  Pfw: 60,
  pulleyRadiusM: 0.1,
  ctRatio: 2,
};

export interface IMCircuitPoint {
  s: number;
  rpm: number;
  ns: number;
  omegaM: number;
  Vphase: number;
  I2phase: number;
  I0phase: number;
  I1phase: number;
  IL: number;
  Pin: number;
  Pag: number;
  Pshaft: number;
  Tdev: number;
  Tshaft: number;
  pf: number;
  phiDeg: number;
  etaPct: number;
  stalled: boolean;
}

export function computeSynchronousSpeedRpm(f: number, poles: number): number {
  return (120 * f) / Math.max(2, poles);
}

/**
 * Evaluates approximate delta-connected per-phase equivalent circuit (shunt
 * magnetising branch at input terminals, Vphase = Vline) at slip s.
 */
export function solveIMCircuitAtSlip(
  Vline: number,
  slip: number,
  p: IM3PHParams = DEFAULT_IM3PH_PARAMS,
): IMCircuitPoint {
  const ns = computeSynchronousSpeedRpm(p.f, p.poles);
  const omegaS = (2 * Math.PI * ns) / 60;
  const s = Math.max(1e-5, Math.min(1.0, slip));
  const V = Math.max(0, Vline);

  const req = p.r1 + p.r2 / s;
  const xeq = p.x1 + p.x2;
  const z2Sq = req * req + xeq * xeq;
  const I2re = z2Sq > 0 ? (V * req) / z2Sq : 0;
  const I2im = z2Sq > 0 ? -(V * xeq) / z2Sq : 0;
  const I2phase = Math.hypot(I2re, I2im);

  const I0re = p.rc > 0 ? V / p.rc : 0;
  const I0im = p.xm > 0 ? -V / p.xm : 0;
  const I0phase = Math.hypot(I0re, I0im);

  const I1re = I2re + I0re;
  const I1im = I2im + I0im;
  const I1phase = Math.hypot(I1re, I1im);
  const IL = Math.sqrt(3) * I1phase;

  const Pin = 3 * ((p.rc > 0 ? (V * V) / p.rc : 0) + I2phase * I2phase * req);
  const Pag = 3 * I2phase * I2phase * (p.r2 / s);
  const Pmech = Pag * (1 - s);
  const Pshaft = s >= 0.9999 ? 0 : Math.max(0, Pmech - p.Pfw);

  const rpm = ns * (1 - s);
  const omegaM = (2 * Math.PI * rpm) / 60;
  const Tdev = omegaS > 0 ? Pag / omegaS : 0;
  const Tshaft = omegaM > 1e-4 ? Pshaft / omegaM : 0;

  const pf = I1phase > 1e-9 ? Math.max(0, Math.min(1, I1re / I1phase)) : 0;
  const phiDeg = (Math.acos(pf) * 180) / Math.PI;
  const etaPct = Pin > 1e-4 ? Math.max(0, (Pshaft / Pin) * 100) : 0;

  return {
    s,
    rpm,
    ns,
    omegaM,
    Vphase: V,
    I2phase,
    I0phase,
    I1phase,
    IL,
    Pin,
    Pag,
    Pshaft,
    Tdev,
    Tshaft,
    pf,
    phiDeg,
    etaPct,
    stalled: s >= 0.9999,
  };
}

/**
 * Slip at pullout torque for the approximate equivalent circuit:
 * s_max = r2 / sqrt(r1^2 + (x1 + x2)^2).
 */
export function computePulloutSlip(p: IM3PHParams = DEFAULT_IM3PH_PARAMS): number {
  const denom = Math.hypot(p.r1, p.x1 + p.x2);
  return denom > 1e-6 ? Math.min(0.99, p.r2 / denom) : 0.36;
}

export function computeBlockedRotorCurrent(
  Vline: number,
  p: IM3PHParams = DEFAULT_IM3PH_PARAMS,
): IMCircuitPoint {
  const pt = solveIMCircuitAtSlip(Vline, 1.0, p);
  return { ...pt, rpm: 0, omegaM: 0, Pshaft: 0, Tshaft: 0, stalled: true };
}

/**
 * Finds steady-state operating slip by bisection against external brake torque
 * Tload (N·m). Stays stalled at s = 1 when starting torque cannot overcome
 * static breakaway friction or when Tload exceeds pullout torque Tmax(V).
 */
export function solveSlipByBisection(
  Vline: number,
  Tload: number,
  p: IM3PHParams = DEFAULT_IM3PH_PARAMS,
): IMCircuitPoint {
  if (Vline <= 0.1) {
    return {
      s: 1,
      rpm: 0,
      ns: computeSynchronousSpeedRpm(p.f, p.poles),
      omegaM: 0,
      Vphase: 0,
      I2phase: 0,
      I0phase: 0,
      I1phase: 0,
      IL: 0,
      Pin: 0,
      Pag: 0,
      Pshaft: 0,
      Tdev: 0,
      Tshaft: 0,
      pf: 0,
      phiDeg: 0,
      etaPct: 0,
      stalled: true,
    };
  }

  const ns = computeSynchronousSpeedRpm(p.f, p.poles);
  const omegaS = (2 * Math.PI * ns) / 60;
  // Breakaway static friction torque ~ Pfw / omega_s (~0.382 N·m -> ~30.6 V breakaway)
  const breakawayT = omegaS > 0 ? p.Pfw / omegaS : 0.4;
  const startPt = solveIMCircuitAtSlip(Vline, 1.0, p);
  if (startPt.Tdev <= breakawayT + Math.max(0, Tload) * 0.05 && Tload === 0) {
    return { ...startPt, rpm: 0, omegaM: 0, Pshaft: 0, Tshaft: 0, stalled: true };
  }
  if (startPt.Tdev <= breakawayT + Math.max(0, Tload) && startPt.Tdev < breakawayT + 0.01) {
    return { ...startPt, rpm: 0, omegaM: 0, Pshaft: 0, Tshaft: 0, stalled: true };
  }

  const sMax = computePulloutSlip(p);
  const maxPt = solveIMCircuitAtSlip(Vline, sMax, p);
  if (Tload > maxPt.Tshaft || startPt.Tdev <= breakawayT) {
    return { ...startPt, rpm: 0, omegaM: 0, Pshaft: 0, Tshaft: 0, stalled: true };
  }

  const targetT = Math.max(0, Tload);
  const signedTshaftAtSlip = (slip: number): number => {
    const pt = solveIMCircuitAtSlip(Vline, slip, p);
    const omegaM = Math.max(1e-4, pt.omegaM);
    const rawPshaft = pt.Pag * (1 - pt.s) - p.Pfw;
    return rawPshaft / omegaM;
  };
  let lo = 1e-5;
  let hi = sMax;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (signedTshaftAtSlip(mid) < targetT) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return solveIMCircuitAtSlip(Vline, 0.5 * (lo + hi), p);
}
