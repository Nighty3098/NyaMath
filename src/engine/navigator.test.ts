import { describe, expect, it } from 'vitest';
import { parseUnitScale } from './unitScale';
import { blockDefs, blockDeps, type MathBlockData } from './dependencies';

function block(
  kind: MathBlockData['kind'],
  raw: string,
  patch: Partial<MathBlockData> = {},
): MathBlockData {
  return {
    id: 'nv-t',
    x: 80,
    y: 60,
    rawInput: raw,
    displayLatex: '',
    resultStr: '',
    resultLatex: '',
    resultValue: null,
    error: null,
    dependencies: [],
    definedVar: null,
    isOutput: false,
    kind,
    plotPreview: null,
    ...patch,
  };
}

describe('unit scale on plot axes', () => {
  it('SI prefixes Latin', () => {
    expect(parseUnitScale('Hz').scale).toBe(1);
    expect(parseUnitScale('kHz').scale).toBe(1e3);
    expect(parseUnitScale('MHz').scale).toBe(1e6);
    expect(parseUnitScale('GHz').scale).toBe(1e9);
    expect(parseUnitScale('mm').scale).toBe(1e-3);
    expect(parseUnitScale('uF').scale).toBe(1e-6);
    expect(parseUnitScale('ms').scale).toBe(1e-3);
  });

  it('SI prefixes Cyrillic', () => {
    expect(parseUnitScale('ГГц').scale).toBe(1e9);
    expect(parseUnitScale('МГц').scale).toBe(1e6);
    expect(parseUnitScale('кГц').scale).toBe(1e3);
    expect(parseUnitScale('мм').scale).toBe(1e-3);
    expect(parseUnitScale('мкФ').scale).toBe(1e-6);
    expect(parseUnitScale('нс').scale).toBe(1e-9);
  });

  it('compound RU symbols (Тл) are not split by prefix', () => {
    expect(parseUnitScale('Тл')).toMatchObject({ ok: true, scale: 1, unit: 'Тл' });
    expect(parseUnitScale('мТл').scale).toBe(1e-3);
    expect(parseUnitScale('мТл').unit).toBe('Тл');
  });

  it('fractional units keep scale = 1 and the whole label', () => {
    const r = parseUnitScale('рад/с');
    expect(r).toMatchObject({ ok: true, scale: 1, unit: 'рад/с' });
    expect(parseUnitScale('км/ч')).toMatchObject({ ok: true, scale: 1e3, unit: 'м/ч' });
  });

  it('bare unit like "с" (seconds) is not treated as prefix', () => {
    expect(parseUnitScale('с')).toMatchObject({ ok: true, scale: 1, unit: 'с' });
    expect(parseUnitScale('м')).toMatchObject({ ok: true, scale: 1, unit: 'м' });
  });

  it('invalid input flagged ok=false, scale=1', () => {
    expect(parseUnitScale('123')).toMatchObject({ ok: false, scale: 1 });
    expect(parseUnitScale('12/б')).toMatchObject({ ok: false, scale: 1 });
    expect(parseUnitScale('')).toMatchObject({ ok: true, scale: 1 });
  });
});

describe('variable index helpers (Ctrl+K navigator)', () => {
  it('blockDefs collects every assignment in a math block', () => {
    const b = block('math', 'R1 := 100\nZ := R1 + R2');
    expect(blockDefs(b)).toEqual(['R1', 'Z']);
  });

  it('blockDeps collects used names', () => {
    const b = block('math', 'Z := R1 + R2\nf(t) := t^2');
    const deps = blockDeps(b);
    expect(deps).toContain('R1');
    expect(deps).toContain('R2');
    expect(deps).not.toContain('Z');
  });

  it('program block: def = exportName, deps from analysis', () => {
    const b = block('program', 'x := 1\ny := x^2', { exportName: 'res' });
    expect(blockDefs(b)).toEqual(['res']);
    expect(blockDeps(b)).toEqual([]);
  });

  it('slider and sim export names participate', () => {
    expect(blockDefs(block('slider', '', { sliderVar: 'gain' }))).toEqual(['gain']);
    expect(blockDefs(block('sim', '', { simExport: 'traj' }))).toEqual(['traj']);
  });
});
