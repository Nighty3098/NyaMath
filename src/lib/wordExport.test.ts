import { describe, expect, it } from 'vitest';
import type { MathBlockData } from '../engine/dependencies';
import { blocksToWordHtml } from './wordExport';

let n = 0;
function blk(patch: Partial<MathBlockData>): MathBlockData {
  return {
    id: `wd${n++}`,
    x: 80,
    y: 60 + n * 64,
    rawInput: '',
    displayLatex: '',
    resultStr: '',
    resultLatex: '',
    resultValue: null,
    error: null,
    dependencies: [],
    definedVar: null,
    isOutput: false,
    kind: 'math',
    plotPreview: null,
    ...patch,
  };
}

/** Word-экспорт: заголовки, формулы с результатами, экранирование, фигуры. */
describe('wordExport', () => {
  it('шапка Word-HTML + секции + формулы', () => {
    const html = blocksToWordHtml({
      a: blk({ kind: 'text', rawInput: '// Балка', y: 10 }),
      b: blk({ kind: 'math', rawInput: 'R = q*L', resultStr: '6 kN', y: 60 }),
      c: blk({ kind: 'program', rawInput: 's := 1\ns', resultStr: '1', y: 120 }),
      d: blk({ kind: 'plot', plotFn: 'sin(x)', y: 200 }),
    });
    expect(html).toContain('xmlns:w=');
    expect(html).toContain('<h2>Балка</h2>');
    expect(html).toContain('R = q*L = 6 kN');
    expect(html).toContain('<pre>s := 1');
    expect(html).toContain('[Рисунок: sin(x)]');
  });

  it('ошибки видны, HTML экранируется', () => {
    const html = blocksToWordHtml({
      a: blk({ kind: 'math', rawInput: 'x <y> & "z"', error: 'bad <thing>', y: 10 }),
      b: blk({ kind: 'slider', sliderVar: 'k', resultStr: '3', y: 60 }),
    });
    expect(html).toContain('x &lt;y&gt; &amp; &quot;z&quot;');
    expect(html).toContain('bad &lt;thing&gt;');
    expect(html).toContain('k = 3');
  });

  it('en-подписи фигур', () => {
    const html = blocksToWordHtml({ a: blk({ kind: 'sim', simStates: 'x,v', y: 10 }) }, 'en');
    expect(html).toContain('[Simulation: x,v]');
  });

  it('пустой лист — только шапка', () => {
    const html = blocksToWordHtml({});
    expect(html).toContain('<h1>NyaMath report</h1>');
    expect(html).toContain('</html>');
  });
});
