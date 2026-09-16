import { describe, expect, it } from 'vitest';
import {
  buildShareUrl,
  buildTemplateUrl,
  decodeShareParam,
  encodeShare,
  normalizeLang,
  phrasePack,
  phraseUnpack,
} from './share';
import { TEST_SCENARIO_LINES } from '../data/testScenario';
import type { MathBlockData } from '../engine/dependencies';

function block(id: string, kind: MathBlockData['kind'], y: number, patch: Partial<MathBlockData> = {}): MathBlockData {
  return {
    id, x: 80, y, rawInput: '', displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null, dependencies: [],
    definedVar: null, isOutput: false, kind, plotPreview: null, ...patch,
  };
}

describe('phrase codec', () => {
  it('round-trips JSON bytes incl. cyrillic and escapes', () => {
    const json = JSON.stringify([1, [[60, 0, 'f := 10*10^9 ='], [64, 1, '// Исходные данные "кавычки"'], [128, 4, 's := "a\\nb"']]]);
    const bytes = new TextEncoder().encode(json);
    expect(new TextDecoder().decode(phraseUnpack(phrasePack(bytes)))).toBe(json);
  });

  it('rejects truncated refs', () => {
    expect(() => phraseUnpack(new Uint8Array([65, 0]))).toThrow();
    expect(() => phraseUnpack(new Uint8Array([0, 250]))).toThrow();
  });
});

describe('encode/decode', () => {
  it('round-trips all block kinds with extras', async () => {
    const blocks: Record<string, MathBlockData> = {};
    const list = [
      block('a', 'text', 60, { rawInput: '// Заголовок' }),
      block('b', 'math', 124, { rawInput: 'f := 10*10^9 =' }),
      block('c', 'plot', 188, { rawInput: 'plot', plotFn: 'sin(x)', plotXmin: 0, plotXmax: 1 }),
      block('d', 'plot3d', 500, { rawInput: 'plot3d', plotFn: 'x+y', plotXmin: 0, plotXmax: 1, plotYmin: 0, plotYmax: 2, plotMode: 'points' }),
      block('e', 'program', 800, { rawInput: 's := 1\ns', exportName: 'res' }),
      block('f', 'slider', 1000, { rawInput: 'slider', sliderVar: 'eps_r', sliderMin: 1, sliderMax: 10, sliderStep: 0.1, sliderVal: 3.3 }),
    ];
    for (const b of list) blocks[b.id] = b;
    const enc = await encodeShare(blocks);
    expect(enc.param?.[0]).toBe('4');
    expect(enc.count).toBe(6);
    const back = await decodeShareParam(enc.param as string);
    expect(back).toHaveLength(6);
    const byKind = Object.fromEntries(back.map((b) => [b.kind, b]));
    expect(byKind['slider'].sliderVar).toBe('eps_r');
    expect(byKind['slider'].sliderVal).toBe(3.3);
    expect(byKind['plot'].plotXmax).toBe(1);
    expect(byKind['plot3d'].plotMode).toBe('points');
    expect(byKind['program'].exportName).toBe('res');
    expect(byKind['math'].rawInput).toBe('f := 10*10^9 =');
  });

  it('detects a pristine example as template', async () => {
    const blocks: Record<string, MathBlockData> = {};
    let y = 60;
    let n = 0;
    for (const line of TEST_SCENARIO_LINES) {
      const id = `t${n++}`;
      blocks[id] = block(id, line.startsWith('//') ? 'text' : 'math', y, { rawInput: line });
      y += 64;
    }
    const pid = `t${n++}`;
    blocks[pid] = block(pid, 'plot', 120, { x: 560, rawInput: 'plot', plotFn: 'sin(x)', plotXmin: -10, plotXmax: 10 });
    const enc = await encodeShare(blocks);
    expect(enc.template).toBe('ex20');
    expect(enc.param).toBeNull();
  });

  it('rejects empty docs and garbage', async () => {
    await expect(encodeShare({})).rejects.toThrow();
    for (const bad of ['', 'x', '1!!!!', '9abc', '4', '40w']) {
      await expect(decodeShareParam(bad)).rejects.toThrow();
    }
  });

  it('still decodes legacy v1 (param built by real zlib)', async () => {
    // '1' + deflateRaw('[[1,[[60,0,"x := 5 ="]]] compact JSON'), base64url
    const param = '1izbUiY42M9Ax0FGqULCyVTBVsFWKjY0FAA';
    const back = await decodeShareParam(param);
    expect(back).toHaveLength(1);
    expect(back[0].rawInput).toBe('x := 5 =');
  });
});

describe('urls and lang', () => {
  it('appends valid lang only', () => {
    expect(buildShareUrl('4abc', 'ru').endsWith('#d=4abc&lang=ru')).toBe(true);
    expect(buildShareUrl('4abc', 'de').endsWith('#d=4abc')).toBe(true);
    expect(buildShareUrl('4abc').endsWith('#d=4abc')).toBe(true);
    expect(buildTemplateUrl('ex20', 'en').endsWith('#t=ex20&lang=en')).toBe(true);
  });

  it('normalizes lang strictly', () => {
    expect(normalizeLang('ru')).toBe('ru');
    expect(normalizeLang('en')).toBe('en');
    expect(normalizeLang('RU')).toBeNull();
    expect(normalizeLang('fr')).toBeNull();
    expect(normalizeLang(null)).toBeNull();
  });
});
