export interface Complex {
  re: number;
  im: number;
}

export const cZero: Complex = { re: 0, im: 0 };

export function cPolar(magnitude: number, angleDeg: number): Complex {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    re: magnitude * Math.cos(rad),
    im: magnitude * Math.sin(rad),
  };
}

export function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function cMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

export function cDiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) return cZero;
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

export function cAbs(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

export function cAngleDeg(a: Complex): number {
  return (Math.atan2(a.im, a.re) * 180) / Math.PI;
}
