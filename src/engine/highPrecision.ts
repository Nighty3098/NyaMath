import type { BigNumber } from 'mathjs';

export type BigNumberFactory = (value: string | number) => BigNumber;

const piCache = new Map<number, BigNumber>();
const catalanCache = new Map<number, BigNumber>();
const ln10Cache = new Map<number, BigNumber>();

export function calculatePi(make: BigNumberFactory, digits: number): BigNumber {
  const cached = piCache.get(digits);
  if (cached) return cached;

  const terms = Math.ceil(digits / 14.181647462725477) + 1;
  let multiplier = 1n;
  let linear = 13_591_409n;
  let power = 1n;
  let sum = make(linear.toString());

  for (let k = 1; k < terms; k += 1) {
    const index = BigInt(k);
    multiplier =
      (24n * multiplier * (6n * index - 5n) * (2n * index - 1n) * (6n * index - 1n)) /
      (index * index * index);
    linear += 545_140_134n;
    power *= -262_537_412_640_768_000n;
    sum = sum.plus(make((multiplier * linear).toString()).div(make(power.toString())));
  }

  const pi = make(426_880).times(make(10_005).sqrt()).div(sum);
  piCache.set(digits, pi);
  return pi;
}

export function calculateExp(make: BigNumberFactory, value: BigNumber, digits: number): BigNumber {
  let reduced = value;
  let squarings = 0;
  const threshold = make('0.01');
  while (reduced.abs().gt(threshold) && squarings < 10_000) {
    reduced = reduced.div(2);
    squarings += 1;
  }
  if (reduced.abs().gt(threshold)) throw new Error('Exponent is outside the supported range');

  let term = make(1);
  let result = term;
  const epsilon = make(10).pow(-digits - 5);
  for (let index = 1; index < digits * 2 + 20; index += 1) {
    term = term.times(reduced).div(index);
    result = result.plus(term);
    if (term.abs().lt(epsilon)) break;
  }
  for (let index = 0; index < squarings; index += 1) result = result.pow(2);
  return result;
}

export function calculateLn(make: BigNumberFactory, value: BigNumber, digits: number): BigNumber {
  if (value.lte(0)) throw new Error('Natural logarithm requires a positive argument');

  let reduced = value;
  let squareRoots = 0;
  const lower = make('0.9');
  const upper = make('1.1');
  while ((reduced.lt(lower) || reduced.gt(upper)) && squareRoots < 10_000) {
    reduced = reduced.sqrt();
    squareRoots += 1;
  }
  if (reduced.lt(lower) || reduced.gt(upper)) {
    throw new Error('Logarithm argument is outside the supported range');
  }

  const ratio = reduced.minus(1).div(reduced.plus(1));
  const ratioSquared = ratio.pow(2);
  let term = ratio;
  let sum = term;
  const epsilon = make(10).pow(-digits - 5);
  for (let index = 1; index < digits * 2 + 20; index += 1) {
    term = term.times(ratioSquared);
    const contribution = term.div(2 * index + 1);
    sum = sum.plus(contribution);
    if (contribution.abs().lt(epsilon)) break;
  }

  return sum.times(2).times(make(2).pow(squareRoots));
}

export function calculateLog10(
  make: BigNumberFactory,
  value: BigNumber,
  digits: number,
): BigNumber {
  let ln10 = ln10Cache.get(digits);
  if (!ln10) {
    ln10 = calculateLn(make, make(10), digits);
    ln10Cache.set(digits, ln10);
  }
  return calculateLn(make, value, digits).div(ln10);
}

function eulerTransform(
  make: BigNumberFactory,
  sequence: (index: number) => BigNumber,
  digits: number,
): BigNumber {
  const terms = Math.ceil((digits + 12) * Math.LOG2E * Math.LN10) + 2;
  const differences = Array.from({ length: terms }, (_, index) => sequence(index));
  let result = make(0);
  let weight = make(0.5);

  for (let order = 0; order < terms; order += 1) {
    result = result.plus(differences[0].times(weight));
    for (let index = 0; index < terms - order - 1; index += 1) {
      differences[index] = differences[index].minus(differences[index + 1]);
    }
    weight = weight.div(2);
  }

  return result;
}

export function calculateZeta(
  make: BigNumberFactory,
  exponent: BigNumber,
  digits: number,
): BigNumber {
  if (!exponent.isInteger() || exponent.lt(2)) {
    throw new Error(
      'High-precision zeta currently supports integer arguments greater than or equal to 2',
    );
  }
  if (exponent.eq(2)) {
    return calculatePi(make, digits).pow(2).div(6);
  }

  const eta = eulerTransform(make, (index) => make(index + 1).pow(exponent.negated()), digits);
  return eta.div(make(1).minus(make(2).pow(make(1).minus(exponent))));
}

export function calculateCatalan(make: BigNumberFactory, digits: number): BigNumber {
  const cached = catalanCache.get(digits);
  if (cached) return cached;

  const result = eulerTransform(make, (index) => make(2 * index + 1).pow(-2), digits);
  catalanCache.set(digits, result);
  return result;
}

export function calculateGamma(make: BigNumberFactory, value: BigNumber, pi: BigNumber): BigNumber {
  if (value.lte(0)) throw new Error('High-precision gamma currently supports positive arguments');
  if (value.isInteger()) {
    const integer = Number(value.toFixed(0));
    if (!Number.isSafeInteger(integer) || integer > 10_000) {
      throw new Error('High-precision gamma supports integer arguments up to 10000');
    }
    let result = make(1);
    for (let factor = 2; factor < integer; factor += 1) {
      result = result.times(factor);
    }
    return result;
  }

  if (value.gt(10_000)) {
    throw new Error('High-precision gamma supports half-integer arguments up to 10000');
  }
  const twice = value.times(2);
  if (!twice.isInteger() || !twice.mod(2).eq(1)) {
    throw new Error('High-precision gamma currently supports integer and half-integer arguments');
  }

  let result = pi.sqrt();
  for (let factor = make('0.5'); factor.lt(value); factor = factor.plus(1)) {
    result = result.times(factor);
  }
  return result;
}

function atanUnit(make: BigNumberFactory, value: BigNumber, digits: number): BigNumber {
  if (value.isZero()) return make(0);
  const sign = value.isNegative() ? -1 : 1;
  let reduced = value.abs();
  let multiplier = 1;
  const threshold = make('0.01');
  while (reduced.gt(threshold)) {
    reduced = reduced.div(make(1).plus(make(1).plus(reduced.pow(2)).sqrt()));
    multiplier *= 2;
  }

  const square = reduced.pow(2).negated();
  let power = reduced;
  let result = power;
  const epsilon = make(10).pow(-digits - 5);
  for (let index = 1; index < digits * 2 + 20; index += 1) {
    power = power.times(square);
    const term = power.div(2 * index + 1);
    result = result.plus(term);
    if (term.abs().lt(epsilon)) break;
  }

  result = result.times(multiplier);
  if (sign < 0) result = result.negated();
  return result;
}

export function calculateAtan(
  make: BigNumberFactory,
  value: BigNumber,
  pi: BigNumber,
  digits: number,
): BigNumber {
  if (value.abs().gt(1)) {
    const halfPi = pi.div(2);
    const result = atanUnit(make, make(1).div(value), digits);
    return value.isNegative() ? halfPi.neg().minus(result) : halfPi.minus(result);
  }
  return atanUnit(make, value, digits);
}

export function calculateAsin(
  make: BigNumberFactory,
  value: BigNumber,
  pi: BigNumber,
  digits: number,
): BigNumber {
  if (value.eq(1)) return pi.div(2);
  if (value.eq(-1)) return pi.div(-2);
  return calculateAtan(make, value.div(make(1).minus(value.pow(2)).sqrt()), pi, digits);
}

export function calculateAcos(
  make: BigNumberFactory,
  value: BigNumber,
  pi: BigNumber,
  digits: number,
): BigNumber {
  return pi.div(2).minus(calculateAsin(make, value, pi, digits));
}

export function calculateSinCos(
  make: BigNumberFactory,
  value: BigNumber,
  pi: BigNumber,
  digits: number,
): [BigNumber, BigNumber] {
  const twoPi = pi.times(2);
  let reduced = value.mod(twoPi);
  if (reduced.gt(pi)) reduced = reduced.minus(twoPi);
  if (reduced.lt(pi.neg())) reduced = reduced.plus(twoPi);

  let negateCos = false;
  const halfPi = pi.div(2);
  if (reduced.gt(halfPi)) {
    reduced = pi.minus(reduced);
    negateCos = true;
  } else if (reduced.lt(halfPi.neg())) {
    reduced = pi.neg().minus(reduced);
    negateCos = true;
  }

  for (let index = 0; index < 8; index += 1) reduced = reduced.div(2);

  const square = reduced.pow(2).negated();
  let sinTerm = reduced;
  let cosTerm = make(1);
  let sin = sinTerm;
  let cos = cosTerm;
  const epsilon = make(10).pow(-digits - 5);
  for (let index = 1; index < digits * 2 + 20; index += 1) {
    sinTerm = sinTerm.times(square).div(2 * index * (2 * index + 1));
    cosTerm = cosTerm.times(square).div((2 * index - 1) * (2 * index));
    sin = sin.plus(sinTerm);
    cos = cos.plus(cosTerm);
    if (sinTerm.abs().lt(epsilon) && cosTerm.abs().lt(epsilon)) break;
  }

  for (let index = 0; index < 8; index += 1) {
    const previousSin = sin;
    sin = sin.times(cos).times(2);
    cos = cos.pow(2).minus(previousSin.pow(2));
  }
  if (negateCos) cos = cos.negated();
  return [sin, cos];
}
