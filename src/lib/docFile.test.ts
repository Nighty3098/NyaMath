import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../engine/version';
import { engineMismatch, parseDocFile, serializeDocFile } from './docFile';

describe('docFile: header with engine pin', () => {
  it('roundtrip нового формата', () => {
    const blocks = [{ id: 'a', rawInput: 'x := 5' }];
    const file = serializeDocFile(blocks, '2026-09-19T00:00:00.000Z');
    expect(file.engine).toBe(ENGINE_VERSION);
    expect(file.savedAt).toBe('2026-09-19T00:00:00.000Z');
    const back = parseDocFile(JSON.parse(JSON.stringify(file)));
    expect(back).toEqual({ engine: ENGINE_VERSION, legacy: false, blocks });
  });

  it('legacy-массив читается без версии', () => {
    const back = parseDocFile([{ id: 'a' }]);
    expect(back.engine).toBeNull();
    expect(back.legacy).toBe(true);
    expect(back.blocks).toHaveLength(1);
  });

  it('мусор отвергается', () => {
    expect(() => parseDocFile(42)).toThrow();
    expect(() => parseDocFile({ blocks: 'nope' })).toThrow();
    expect(() => parseDocFile(null)).toThrow();
  });

  it('mismatch только по major', () => {
    expect(engineMismatch(null)).toBeNull();
    expect(engineMismatch(ENGINE_VERSION)).toBeNull();
    const [maj, min] = ENGINE_VERSION.split('.');
    expect(engineMismatch(`${maj}.${Number(min) + 1}.0`)).toBeNull();
    expect(engineMismatch(`${Number(maj) + 1}.0.0`)).toContain('≠');
  });
});
