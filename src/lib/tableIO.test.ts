import { describe, expect, it } from 'vitest';
import {
  detectDelimiter,
  headerRow,
  numericTableToMatrix,
  parseCell,
  parseTable,
  rowsToCsv,
  rowsToXlsHtml,
  scopeRows,
} from './tableIO';
import type { MathBlockData } from '../engine/dependencies';

describe('tableIO: delimiter', () => {
  it('RU-Excel с точкой с запятой', () => {
    expect(detectDelimiter('1;2;3')).toBe(';');
  });
  it('таб из copy-paste', () => {
    expect(detectDelimiter('1\t2\t3')).toBe('\t');
  });
  it('кавычки не путают счётчик', () => {
    expect(detectDelimiter('"a;b",c')).toBe(',');
  });
});

describe('tableIO: parseCell', () => {
  it('десятичная запятая', () => {
    expect(parseCell('1,5')).toBe(1.5);
    expect(parseCell('1 234,5')).toBe(1234.5);
  });
  it('пусто → null, текст → текст', () => {
    expect(parseCell('')).toBeNull();
    expect(parseCell('abc')).toBe('abc');
  });
});

describe('tableIO: parseTable', () => {
  it('прямоугольная таблица из Excel copy-paste', () => {
    const rows = parseTable('a\tb\n1\t2\n3\t');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([1, 2]);
    expect(rows[2]).toEqual([3, null]);
  });
  it('пустой ввод → пусто', () => {
    expect(parseTable('   \n ')).toEqual([]);
  });
});

describe('tableIO: matrix literal', () => {
  it('числа → [a, b; c, d]', () => {
    expect(
      numericTableToMatrix([
        [1, 2],
        [3, 4],
      ]),
    ).toBe('[1, 2; 3, 4]');
  });
  it('шапка-текст обнуляется, но матрица строится', () => {
    expect(
      numericTableToMatrix([
        ['x', 'y'],
        [1, 2],
      ]),
    ).toBe('[0, 0; 1, 2]');
  });
  it('без чисел → null', () => {
    expect(numericTableToMatrix([['a', 'b']])).toBeNull();
  });
  it('headerRow находит текстовую шапку', () => {
    expect(headerRow([['x', 'y'], [1, 2]])).toEqual(['x', 'y']);
    expect(headerRow([[1, 2]])).toBeNull();
  });
});

describe('tableIO: scope export', () => {
  function mathBlock(y: number, definedVar: string, resultStr: string): MathBlockData {
    return {
      id: `s${y}`,
      x: 80,
      y,
      rawInput: `${definedVar} := 1`,
      displayLatex: '',
      resultStr,
      resultLatex: resultStr,
      resultValue: 1,
      error: null,
      dependencies: [],
      definedVar,
      isOutput: false,
      kind: 'math',
      plotPreview: null,
    };
  }
  it('только именованные без ошибок, по порядку y', () => {
    const b = mathBlock(20, 'a', '5');
    const bad = { ...mathBlock(10, 'z', ''), error: 'boom' };
    const rows = scopeRows({ [b.id]: b, [bad.id]: bad });
    expect(rows).toEqual([['a', '5']]);
    expect(rowsToCsv(['variable', 'value'], rows)).toBe('variable,value\na,5');
    expect(rowsToXlsHtml(rows, 'en')).toContain('<table>');
  });
});
