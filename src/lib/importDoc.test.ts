import { describe, expect, it } from 'vitest';
import { parseCpd, parseSmXml } from './importDoc';

const SM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<regions>
  <region id="1" left="80" top="60">
    <text lang="eng"><p>Beam input</p></text>
  </region>
  <region id="2" left="80" top="124">
    <math>
      <input>
        <e type="operand">L</e>
        <e type="operand">3</e>
        <e type="operand" style="unit">m</e>
        <e type="operator" args="2">*</e>
        <e type="operator" args="2">:</e>
      </input>
    </math>
  </region>
  <region id="3" left="80" top="188">
    <math>
      <input>
        <e type="operand">R</e>
        <e type="operand">x</e>
        <e type="function" args="1">sin</e>
        <e type="operator" args="2">:</e>
      </input>
      <result action="numeric"><e type="operand">0</e></result>
    </math>
  </region>
  <region id="4" left="80" top="252">
    <plot>
      <input>
        <e type="operand">x</e>
        <e type="operand">2</e>
        <e type="operator" args="2">^</e>
      </input>
    </plot>
  </region>
</regions>`;

describe('importDoc: SMath .sm', () => {
  it('текст, присваивание с единицей, sin + результат, плот', () => {
    const r = parseSmXml(SM_SAMPLE);
    expect(r.format).toBe('sm');
    expect(r.blocks).toHaveLength(4);
    expect(r.blocks[0]).toMatchObject({ kind: 'text', body: 'Beam input', x: 80, y: 60 });
    expect(r.blocks[1]).toMatchObject({ kind: 'math', body: 'L := 3 * m' });
    // R := sin(x), show_result через <result>
    expect(r.blocks[2]?.body).toBe('R := sin(x)');
    expect(r.blocks[3]).toMatchObject({ kind: 'plot' });
    expect(r.blocks[3]?.body).toContain('^');
  });

  it('contract-юнит и show_result', () => {
    const xml = `<regions><region left="80" top="60"><math>
      <input><e type="operand">R</e></input>
      <contract><e type="operand" style="unit">kN</e></contract>
    </math></region></regions>`;
    const r = parseSmXml(xml);
    expect(r.blocks[0]?.body).toBe('R = kN');
  });

  it('присваивание суммы без лишних скобок', () => {
    // RPN для c := a+b: c a b + :
    const xml = `<regions><region left="80" top="60"><math><input>
      <e type="operand">c</e><e type="operand">a</e><e type="operand">b</e>
      <e type="operator" args="2">+</e><e type="operator" args="2">:</e>
    </input></math></region></regions>`;
    const r = parseSmXml(xml);
    expect(r.blocks[0]?.body).toBe('c := a + b');
  });

  it('степень правоассоциативна: x^2^3 без скобок', () => {
    const xml = `<regions><region left="80" top="60"><math><input>
      <e type="operand">x</e><e type="operand">2</e><e type="operand">3</e>
      <e type="operator" args="2">^</e><e type="operator" args="2">^</e>
    </input></math></region></regions>`;
    const r = parseSmXml(xml);
    // консервативно, но верно: x^(2^3)
    expect(r.blocks[0]?.body).toBe('x ^ (2 ^ 3)');
  });

  it('битый RPN пропускается с пометкой, а не роняет всё', () => {
    const xml = `<regions>
      <region left="80" top="60"><math><input><e type="operator" args="2">+</e></input></math></region>
      <region left="80" top="124"><math><input><e type="operand">x</e></input></math></region>
    </regions>`;
    const r = parseSmXml(xml);
    expect(r.blocks).toHaveLength(1);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('не .sm и .smz обрабатываются честно', () => {
    expect(parseSmXml('<html></html>').notes.length).toBeGreaterThan(0);
    expect(parseSmXml('PK\x03\x04...').notes[0]).toContain('.smz');
  });
});

const CPD_SAMPLE = `"Beam calculation"
'input data'
L = 3*m
q = 4*kN/m ?
F = q*L/2|kN
$Plot { sin(x) & cos(x) @ x = 0 : 6.28 }
#if debug
`;

describe('importDoc: Calcpad .cpd', () => {
  it('комменты, формулы, input, единицы, плот, директивы', () => {
    const r = parseCpd(CPD_SAMPLE);
    expect(r.format).toBe('cpd');
    const kinds = r.blocks.map((b) => b.kind);
    expect(kinds).toEqual(['text', 'text', 'math', 'math', 'math', 'plot', 'text']);
    expect(r.blocks[0]?.body).toBe('Beam calculation');
    expect(r.blocks[2]?.body).toBe('L := 3*m');
    expect(r.blocks[3]?.body).toBe('q := 4*kN/m');
    expect(r.blocks[4]?.body).toBe('F := q*L/2 = kN');
    expect(r.blocks[5]).toMatchObject({ kind: 'plot', plotXmin: 0, plotXmax: 6.28 });
    expect(r.blocks[5]?.body).toBe('sin(x); cos(x)');
    expect(r.blocks[6]?.body).toBe('#if debug');
    expect(r.notes.some((n) => n.includes('input-форма'))).toBe(true);
  });

  it('f(x; y) → запятые только в скобках', () => {
    const r = parseCpd('A = f(x; y) + [1; 2]');
    expect(r.blocks[0]?.body).toBe('A := f(x, y) + [1; 2]');
  });

  it('$Map → contour с диапазонами', () => {
    const r = parseCpd('$Map { sin(x; y) @ x = -5 : 5 & y = -5 : 5 }');
    expect(r.blocks[0]).toMatchObject({
      kind: 'contour', plotXmin: -5, plotXmax: 5, plotYmin: -5, plotYmax: 5,
    });
    expect(r.blocks[0]?.body).toContain('sin(x, y)');
  });
});
