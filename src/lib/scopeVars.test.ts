import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from '../engine/dependencies';
import { collectScopeVars } from './scopeVars';

let id = 0;
function block(kind: MathBlockData['kind'], y: number, patch: Partial<MathBlockData> = {}): MathBlockData {
  return {
    id: `v${id++}`, x: 80, y, rawInput: '', displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null, dependencies: [],
    definedVar: null, isOutput: false, kind, plotPreview: null, ...patch,
  };
}

describe('scope telemetry', () => {
  it('collects defined variables top-down with values', () => {
    const list = [
      block('math', 60, { rawInput: 'x := 5' }),
      block('math', 124, { rawInput: 'y := x + 1 =' }),
    ];
    const rec = recalculateAll(list);
    const vars = collectScopeVars(rec.blocks);
    expect(vars.map((v) => v.name)).toEqual(['x', 'y']);
    expect(vars[1].value).toBe('6');
    expect(vars.every((v) => !v.hasError)).toBe(true);
  });

  it('last definition wins and errors are flagged', () => {
    const list = [
      block('math', 60, { rawInput: 'x := 5' }),
      block('math', 124, { rawInput: 'x := nosuchvar + 1' }),
    ];
    const rec = recalculateAll(list);
    const vars = collectScopeVars(rec.blocks);
    expect(vars.map((v) => v.name)).toEqual(['x']);
    expect(vars[0].hasError).toBe(true);
  });

  it('skips blocks without definitions', () => {
    const list = [
      block('text', 60, { rawInput: '// note' }),
      block('math', 124, { rawInput: '2 + 2 =' }),
    ];
    const rec = recalculateAll(list);
    expect(collectScopeVars(rec.blocks)).toEqual([]);
  });
});
