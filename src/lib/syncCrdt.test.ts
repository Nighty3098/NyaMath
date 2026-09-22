import { describe, expect, it } from 'vitest';
import {
  canon,
  getActor,
  isNewer,
  mergeBlockMaps,
  stampOutgoing,
  type WireBlock,
} from './syncCrdt';

const b = (id: string, raw: string, extra: Record<string, unknown> = {}): WireBlock => ({
  id,
  x: 80,
  y: 60,
  rawInput: raw,
  kind: 'math',
  ...extra,
});

const byId = (blocks: WireBlock[]): Record<string, WireBlock> =>
  Object.fromEntries(blocks.map((x) => [x.id, x]));

/**
 * CRDT-лайт: правки разных блоков сливаются, конфликт одного блока — LWW,
 * удаление — tombstone, каноникализация не зависит от порядка ключей.
 */
describe('syncCrdt', () => {
  it('canon не зависит от порядка ключей', () => {
    expect(canon({ a: 1, b: 2 })).toBe(canon({ b: 2, a: 1 }));
    expect(canon({ a: 1 })).not.toBe(canon({ a: 2 }));
  });

  it('isNewer: часы, затем actor; без метки — старейшее', () => {
    expect(isNewer({ clock: 2, actor: 'a' }, { clock: 1, actor: 'z' })).toBe(true);
    expect(isNewer({ clock: 1, actor: 'z' }, { clock: 1, actor: 'a' })).toBe(true);
    expect(isNewer(undefined, { clock: 0, actor: '' })).toBe(false);
    expect(isNewer({ clock: 0, actor: '' }, undefined)).toBe(true);
  });

  it('разные блоки: обе правки выживают', () => {
    const base = [b('1', 'x := 1'), b('2', 'y := 2')];
    const local = [b('1', 'x := 10'), b('2', 'y := 2')];
    const remote = [b('1', 'x := 1'), b('2', 'y := 20')];
    const m = mergeBlockMaps(base, {}, local, {}, remote, {}, {}, {});
    const got = byId(m.blocks);
    expect(got['1'].rawInput).toBe('x := 10');
    expect(got['2'].rawInput).toBe('y := 20');
  });

  it('один блок: побеждают большие часы, tie — remote', () => {
    const base = [b('1', 'x := 1')];
    const local = [b('1', 'x := 10')];
    const remote = [b('1', 'x := 20')];
    const lm = { '1': { clock: 5, actor: 'a' } };
    const rm = { '1': { clock: 9, actor: 'b' } };
    expect(byId(mergeBlockMaps(base, {}, local, lm, remote, rm, {}, {}).blocks)['1'].rawInput).toBe(
      'x := 20',
    );
    expect(byId(mergeBlockMaps(base, {}, local, rm, remote, lm, {}, {}).blocks)['1'].rawInput).toBe(
      'x := 10',
    );
    // tie по часам — детерминированно remote
    const t = { '1': { clock: 7, actor: 'a' } };
    const t2 = { '1': { clock: 7, actor: 'b' } };
    expect(byId(mergeBlockMaps(base, {}, local, t, remote, t2, {}, {}).blocks)['1'].rawInput).toBe(
      'x := 20',
    );
  });

  it('удаление без concurrent-правки уважается', () => {
    const base = [b('1', 'x := 1'), b('2', 'y := 2')];
    const local = [b('1', 'x := 1')]; // удалили 2
    const remote = [b('1', 'x := 1'), b('2', 'y := 2')];
    const m = mergeBlockMaps(base, {}, local, {}, remote, {}, {}, {});
    expect(m.blocks.map((x) => x.id).sort()).toEqual(['1']);
    expect(m.deleted['2']).toBeTruthy();
  });

  it('concurrent-правка новее tombstone — воскрешение', () => {
    const base = [b('1', 'x := 1')];
    const local: WireBlock[] = []; // удалили в clock 5
    const remote = [b('1', 'x := 99')]; // правили в clock 9
    const m = mergeBlockMaps(
      base,
      {},
      local,
      {},
      remote,
      { '1': { clock: 9, actor: 'b' } },
      { '1': { clock: 5, actor: 'a' } },
      {},
    );
    expect(byId(m.blocks)['1'].rawInput).toBe('x := 99');
    expect(m.deleted['1']).toBeUndefined();
  });

  it('tombstone новее правки — удаление держится', () => {
    const base = [b('1', 'x := 1')];
    const local: WireBlock[] = [];
    const remote = [b('1', 'x := 99')];
    const m = mergeBlockMaps(
      base,
      {},
      local,
      {},
      remote,
      { '1': { clock: 5, actor: 'b' } },
      { '1': { clock: 9, actor: 'a' } },
      {},
    );
    expect(m.blocks.map((x) => x.id)).toEqual([]);
    expect(m.deleted['1']).toBeTruthy();
  });

  it('новые блоки с обеих сторон объединяются', () => {
    const base: WireBlock[] = [];
    const local = [b('a', 'p := 1')];
    const remote = [cblk('z')];
    const m = mergeBlockMaps(base, {}, local, {}, remote, {}, {}, {});
    expect(m.blocks.map((x) => x.id).sort()).toEqual(['a', 'z']);
  });

  it('без изменений — как было', () => {
    const base = [b('1', 'x := 1')];
    const m = mergeBlockMaps(base, {}, [...base], {}, [...base], {}, {}, {});
    expect(m.blocks).toHaveLength(1);
    expect(m.blocks[0].rawInput).toBe('x := 1');
  });

  it('stampOutgoing: часы changed, tombstones removed', () => {
    const base = [b('1', 'x := 1'), b('2', 'y := 2')];
    const cur = [b('1', 'x := 10'), b('3', 'z := 3')];
    const { meta, deleted } = stampOutgoing(base, {}, cur, {}, {}, 'web-x', 1000);
    expect(meta['1']).toEqual({ clock: 1000, actor: 'web-x' });
    expect(meta['3']).toEqual({ clock: 1000, actor: 'web-x' });
    expect(meta['2']).toBeUndefined();
    expect(deleted['2']).toEqual({ clock: 1000, actor: 'web-x' });
    // воскресший id чистит tombstone
    const back = stampOutgoing(base, {}, [...cur, b('2', 'y := 2')], meta, deleted, 'web-x', 2000);
    expect(back.deleted['2']).toBeUndefined();
  });

  it('getActor стабилен в сессии', () => {
    expect(getActor()).toBe(getActor());
    expect(getActor().length).toBeGreaterThan(0);
  });
});

function cblk(id: string): WireBlock {
  return b(id, 'q := 0');
}
