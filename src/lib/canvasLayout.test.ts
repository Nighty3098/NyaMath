import { describe, expect, it } from 'vitest';
import { GRID_STEP_FINE, GRID_STEP_STANDARD, snapToGrid } from './canvasLayout';

describe('snapToGrid', () => {
  it('snaps to nearest node (standard 22)', () => {
    expect(snapToGrid(80, 60, GRID_STEP_STANDARD)).toEqual({ x: 88, y: 66 });
    expect(snapToGrid(88, 66, GRID_STEP_STANDARD)).toEqual({ x: 88, y: 66 });
    expect(snapToGrid(90, 70, GRID_STEP_STANDARD)).toEqual({ x: 88, y: 66 });
  });

  it('snaps to nearest node (fine 11)', () => {
    expect(snapToGrid(80, 60, GRID_STEP_FINE)).toEqual({ x: 77, y: 55 });
    expect(snapToGrid(77, 55, GRID_STEP_FINE)).toEqual({ x: 77, y: 55 });
  });

  it('handles zero and negatives symmetrically', () => {
    expect(snapToGrid(0, 0, GRID_STEP_STANDARD)).toEqual({ x: 0, y: 0 });
    expect(snapToGrid(-30, -30, GRID_STEP_STANDARD)).toEqual({ x: -22, y: -22 });
    expect(snapToGrid(-12, -12, GRID_STEP_STANDARD)).toEqual({ x: -22, y: -22 });
  });

  it('passes through bad input', () => {
    expect(snapToGrid(80, 60, 0)).toEqual({ x: 80, y: 60 });
    expect(snapToGrid(NaN, 60, GRID_STEP_STANDARD)).toEqual({ x: NaN, y: 60 });
  });
});
