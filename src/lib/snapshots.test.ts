import { describe, expect, it } from 'vitest';
import {
  pushSnapshot,
  readSnapshots,
  snapshotToRecord,
  takeSnapshot,
  type KeyStorage,
  type Snapshot,
} from './snapshots';
import { blankBlock } from './blocks';

function mem(): KeyStorage & { dump(): Snapshot[] } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    dump: () => JSON.parse(m.get('nyamath-snaps-v1') ?? '[]'),
  };
}

describe('snapshots', () => {
  it('take: счётчики блоков и ошибок', () => {
    const a = { ...blankBlock('a', 0, 0), rawInput: 'x := 1' };
    const snap = takeSnapshot({ [a.id]: a }, true, 1000);
    expect(snap).toMatchObject({ at: 1000, count: 1, errors: 0, manual: true });
    expect(snap.blocks).toHaveLength(1);
  });

  it('кольцо: авто-дедуп одинаковых, ручные всегда пишутся', () => {
    const st = mem();
    const mk = (n: number, manual: boolean) => ({
      at: n,
      count: 1,
      errors: 0,
      manual,
      blocks: [],
    });
    pushSnapshot(mk(1, false), st);
    pushSnapshot(mk(2, false), st);
    expect(readSnapshots(st)).toHaveLength(1);
    pushSnapshot(mk(3, true), st);
    expect(readSnapshots(st)).toHaveLength(2);
  });

  it('snapshotToRecord восстанавливает по id', () => {
    const a = { ...blankBlock('a', 0, 0), rawInput: 'x := 1' };
    const rec = snapshotToRecord(takeSnapshot({ [a.id]: a }, true, 5));
    expect(rec['a']?.rawInput).toBe('x := 1');
  });
});
