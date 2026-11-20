import { describe, expect, it } from 'vitest';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { parseCpd, parseSmXml, parseXmcd } from './importDoc';
import { parseMathcadFile } from './mathcadFile';

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

  it('RPN-функция Mathcad ln импортируется как log', () => {
    const xml = `<regions><region left="80" top="60"><math><input>
      <e type="operand">y</e><e type="operand">x</e>
      <e type="function" args="1">ln</e><e type="operator" args="2">:</e>
    </input></math></region></regions>`;
    expect(parseSmXml(xml).blocks[0]?.body).toBe('y := ln(x)');
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
      kind: 'contour',
      plotXmin: -5,
      plotXmax: 5,
      plotYmin: -5,
      plotYmax: 5,
    });
    expect(r.blocks[0]?.body).toContain('sin(x, y)');
  });
});

const XMCD_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet version="3.0.3" xmlns="http://schemas.mathsoft.com/worksheet30"
  xmlns:ml="http://schemas.mathsoft.com/math30">
  <regions>
    <region left="36" top="136"><text><p>Beam parameters</p></text></region>
    <region left="36" top="200"><math>
      <ml:define>
        <ml:id>L</ml:id>
        <ml:apply><ml:mult/><ml:real>3</ml:real><ml:unitReference unit="meter"/></ml:apply>
      </ml:define>
    </math></region>
    <region left="36" top="264"><math>
      <ml:eval><ml:apply><ml:div/><ml:id>x</ml:id><ml:real>2</ml:real></ml:apply></ml:eval>
    </math></region>
    <region left="36" top="328"><math>
      <ml:define><ml:id>S</ml:id>
        <ml:apply>
          <ml:summation>
            <ml:bounds><ml:real>1</ml:real><ml:real>4</ml:real></ml:bounds>
            <ml:lambda><ml:id>k</ml:id><ml:id>k</ml:id></ml:lambda>
          </ml:summation>
        </ml:apply>
      </ml:define>
    </math></region>
    <region left="36" top="392"><math>
      <ml:define><ml:id>M</ml:id>
        <ml:matrix rows="2" cols="2">
          <ml:real>1</ml:real><ml:real>2</ml:real><ml:real>3</ml:real><ml:real>4</ml:real>
        </ml:matrix>
      </ml:define>
    </math></region>
  </regions>
</worksheet>`;

describe('importDoc: Mathcad .xmcd', () => {
  it('текст, define с единицей, eval, сумма и матрица', () => {
    const r = parseXmcd(XMCD_SAMPLE);
    expect(r.format).toBe('xmcd');
    expect(r.blocks.map((b) => b.body)).toEqual([
      'Beam parameters',
      'L := 3 * m',
      'x / 2 =',
      'S := numsum("k", "k", 1, 4)',
      'M := [1, 3; 2, 4]',
    ]);
    expect(r.blocks[0]).toMatchObject({ kind: 'text', x: 36, y: 136 });
  });

  it('скобки и правоассоциативная степень', () => {
    const xml = `<regions><region left="0" top="0"><math>
      <ml:define><ml:id>y</ml:id>
        <ml:apply><ml:plus/><ml:id>a</ml:id>
          <ml:apply><ml:mult/><ml:apply><ml:pow/><ml:id>b</ml:id><ml:real>2</ml:real></ml:apply><ml:id>c</ml:id></ml:apply>
        </ml:apply>
      </ml:define>
    </math></region></regions>`;
    expect(parseXmcd(xml).blocks[0]?.body).toBe('y := a + b ^ 2 * c');
  });

  it('gzip-контейнер .xmcdz читается как обычный лист', async () => {
    const gz = gzipSync(Buffer.from(XMCD_SAMPLE, 'utf-8'));
    const r = await parseMathcadFile(new Uint8Array(gz), 'sample.xmcdz');
    expect(r.format).toBe('xmcd');
    expect(r.blocks).toHaveLength(5);
    expect(r.notes.some((n) => n.includes('gzip'))).toBe(true);
  });

  it('вызов функции по имени (<id>log</id>) не превращается в id(...)', () => {
    const xml = `<regions>
      <region left="0" top="0"><math><ml:define><ml:id>k</ml:id>
        <ml:apply><ml:id>log</ml:id><ml:id>K</ml:id><ml:real>2</ml:real></ml:apply>
      </ml:define></math></region>
      <region left="0" top="64"><math><ml:eval>
        <ml:apply><ml:id>last</ml:id><ml:id>X</ml:id></ml:apply>
      </ml:eval></math></region>
    </regions>`;
    expect(parseXmcd(xml).blocks.map((b) => b.body)).toEqual([
      'k := log(K, 2)',
      'last(X) =',
    ]);
  });

  it('функции Mathcad переименовываются в equivalents NyaMath', () => {
    const xml = `<regions>
      <region left="0" top="0"><math><ml:eval>
        <ml:apply><ml:id>ln</ml:id><ml:id>x</ml:id></ml:apply>
      </ml:eval></math></region>
      <region left="0" top="64"><math><ml:eval>
        <ml:apply><ml:id>eigenvals</ml:id><ml:id>A</ml:id></ml:apply>
      </ml:eval></math></region>
      <region left="0" top="128"><math><ml:eval>
        <ml:apply><ml:id>Stdev</ml:id><ml:id>v</ml:id></ml:apply>
      </ml:eval></math></region>
    </regions>`;
    expect(parseXmcd(xml).blocks.map((b) => b.body)).toEqual([
      'ln(x) =',
      'eigen(A) =',
      'mcStdevSample(v) =',
    ]);
  });

  it('программа: localDefine / for / if / else / вложенный program', () => {
    const xml = `<regions><region left="0" top="0"><math>
      <ml:define>
        <ml:function><ml:id>DecBin</ml:id><ml:boundVars><ml:id>X</ml:id></ml:boundVars></ml:function>
        <ml:program>
          <ml:localDefine><ml:id>S</ml:id><ml:real>0</ml:real></ml:localDefine>
          <ml:for><ml:id>i</ml:id><ml:range><ml:real>0</ml:real><ml:real>3</ml:real></ml:range>
            <ml:program>
              <ml:ifThen>
                <ml:apply><ml:equal/><ml:id>X</ml:id><ml:real>1</ml:real></ml:apply>
                <ml:program><ml:localDefine><ml:id>S</ml:id>
                  <ml:apply><ml:plus/><ml:id>S</ml:id><ml:real>1</ml:real></ml:apply>
                </ml:localDefine></ml:program>
              </ml:ifThen>
              <ml:otherwise><ml:program><ml:localDefine><ml:id>S</ml:id>
                <ml:apply><ml:minus/><ml:id>S</ml:id><ml:real>1</ml:real></ml:apply>
              </ml:localDefine></ml:program></ml:otherwise>
            </ml:program>
          </ml:for>
          <ml:id>S</ml:id>
        </ml:program>
      </ml:define>
    </math></region></regions>`;
    const r = parseXmcd(xml);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0]).toMatchObject({ kind: 'program', exportName: 'DecBin(X)' });
    expect(r.blocks[0]?.body).toBe(
      [
        'S := 0',
        'for i in 0..3',
        '  if X == 1',
        '    S := S + 1',
        '  else',
        '    S := S - 1',
        '  end',
        'end',
        'S',
      ].join('\n'),
    );
  });

  it('неподдерживаемая функция Mathcad остаётся в блоке и попадает в notes', () => {
    const xml = `<regions><region left="0" top="0"><math><ml:eval>
      <ml:apply><ml:id>READPRN</ml:id><ml:str>data.prn</ml:str></ml:apply>
    </ml:eval></math></region></regions>`;
    const r = parseXmcd(xml);
    expect(r.blocks[0]?.body).toBe('READPRN("data.prn") =');
    expect(r.notes.some((n) => n.includes('READPRN() has no NyaMath equivalent'))).toBe(true);
  });

  it('не-лист даёт честную пометку', () => {
    expect(parseXmcd('<html><body>hi</body></html>').notes.length).toBeGreaterThan(0);
  });
});

/** Минимальный ZIP с одним deflate-членом — фикстура Prime .mcdx. */
function zipOne(name: string, content: string): Uint8Array {
  const raw = Buffer.from(content, 'utf-8');
  const def = deflateRawSync(raw);
  const nb = Buffer.from(name, 'utf-8');
  const local = Buffer.alloc(30 + nb.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(def.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nb.length, 26);
  nb.copy(local, 30);
  const central = Buffer.alloc(46 + nb.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(def.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nb.length, 28);
  nb.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + def.length, 16);
  return new Uint8Array(Buffer.concat([local, def, central, eocd]));
}

describe('importDoc: Prime .mcdx', () => {
  it('читает mathcad/worksheet.xml из ZIP и честно помечает XAML-текст', async () => {
    const zip = zipOne(
      'mathcad/worksheet.xml',
      `<worksheet xmlns="http://schemas.mathsoft.com/worksheet50" xmlns:ml="http://schemas.mathsoft.com/math50">
        <regions><region left="20" top="40"><math>
          <ml:define><ml:id>a</ml:id><ml:real>7</ml:real></ml:define>
        </math></region></regions>
      </worksheet>`,
    );
    const r = await parseMathcadFile(zip, 'test.mcdx');
    expect(r.format).toBe('xmcd');
    expect(r.blocks.map((b) => b.body)).toEqual(['a := 7']);
    expect(r.notes.some((n) => n.includes('XAML'))).toBe(true);
  });
});
