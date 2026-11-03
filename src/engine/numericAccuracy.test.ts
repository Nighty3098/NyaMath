import { describe, expect, it } from 'vitest';
import { brent, solveLinear } from './numeric';

describe('numerical robustness', () => {
  it('solves a consistently scaled small linear system', () => {
    expect(solveLinear([[1e-20]], [1e-20])).toEqual([1]);
  });

  it('rejects singular systems', () => {
    expect(() =>
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [3, 6],
      ),
    ).toThrow('Singular Jacobian');
  });

  it('returns exact endpoint roots and brackets tiny function values by sign', () => {
    expect(brent((x) => x, 0, 1)).toBe(0);
    expect(brent((x) => (x - 0.25) * 1e-200, 0, 1)).toBeCloseTo(0.25, 12);
  });

  it('does not treat underflowed same-sign products as a valid bracket', () => {
    expect(() => brent(() => 1e-200, -1, 1)).toThrow('Root not bracketed');
  });
});
