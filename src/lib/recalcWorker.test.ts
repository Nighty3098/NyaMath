import { afterEach, describe, expect, it } from 'vitest';
import { getLastScope, recalculateAll, type MathBlockData } from '../engine/dependencies';
import { runWorkerJob } from '../engine/recalc.worker';
import {
  _setWorkerFactory,
  recalcInWorker,
  type RecalcJobOutcome,
} from './recalcWorker';
import type { WorkerReq } from '../engine/workerProtocol';

function block(suffix: string, kind: MathBlockData['kind'], y: number, patch: Partial<MathBlockData> = {}): MathBlockData {
  return {
    id: `rw-${suffix}`, x: 80, y, rawInput: '', displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null, dependencies: [],
    definedVar: null, isOutput: false, kind, plotPreview: null, ...patch,
  };
}

const math = (suffix: string, y: number, raw: string) =>
  block(suffix, 'math', y, { rawInput: raw });

function snapshot(blocks: Record<string, MathBlockData>) {
  const out: Record<string, unknown> = {};
  for (const [id, b] of Object.entries(blocks)) {
    out[id] = {
      resultStr: b.resultStr, substStr: b.substStr ?? null, error: b.error,
      dependencies: b.dependencies, definedVar: b.definedVar,
    };
  }
  return out;
}

function doc(): MathBlockData[] {
  return [
    math('a', 60, 'm := 2'),
    math('b', 124, 'a := 5'),
    math('c', 188, 'F := m*a ='),
    math('d', 252, 'f(t) := t^2'),
    math('e', 316, 'f(3) ='),
  ];
}

/** Фейковый Worker поверх реального runWorkerJob (тот же протокол, без потоков). */
class FakeWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  terminated = false;
  postMessage(req: unknown) {
    void (async () => {
      const res = await runWorkerJob(req as WorkerReq, (m) => this.emit(m));
      this.emit(res);
    })();
  }
  emit(m: unknown) {
    if (this.terminated) return;
    setTimeout(() => this.onmessage?.({ data: m }), 0);
  }
  terminate() {
    this.terminated = true;
  }
}

/** Молчаливый воркер: для timeout/cancel. */
class SilentWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  postMessage() {
    /* висим как permute(55) */
  }
  terminate() {
    /* убит */
  }
}

/** Медленный воркер: отвечает через 300 мс (поздно для лимита 30 мс). */
class SlowWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  postMessage(req: unknown) {
    const jobId = (req as { jobId: number }).jobId;
    setTimeout(() => {
      this.onmessage?.({
        data: {
          type: 'result', jobId, ok: true, blocks: [], scope: {}, changed: false, calcMs: 0,
        },
      });
    }, 300);
  }
  terminate() {
    /* убит, но таймер-двойник всё равно выстрелит — stale-guard его отсечёт */
  }
}

afterEach(() => {
  _setWorkerFactory(undefined);
});

describe('recalcWorker: forced fallback (null factory)', () => {
  it('совпадает с sync на смешанном документе', async () => {
    _setWorkerFactory(null);
    const out = (await recalcInWorker(doc(), { lang: 'ru' })) as Extract<RecalcJobOutcome, { status: 'done' }>;
    expect(out.status).toBe('done');
    const sync = recalculateAll(doc());
    expect(snapshot(out.blocks)).toEqual(snapshot(sync.blocks));
    expect(out.scope['F']).toEqual(sync.scope['F']);
  });

  it('фолбэк считает тяжёлый док до конца (кооперативно)', async () => {
    _setWorkerFactory(null);
    const sim = block('heavy', 'sim', 60, {
      rawInput: 'sim',
      simStates: 'x, v', simDerivs: 'v; -x', simInit: '1, 0',
      simT0: 0, simT1: 5, simDt: 0.02, simSolver: 'rk4',
      simX: 't', simY: 'x',
    });
    const out = await recalcInWorker([sim], { lang: 'ru', timeoutMs: 30000 });
    expect(out.status).toBe('done');
  });

  it('отмена через AbortSignal', async () => {
    _setWorkerFactory(null);
    const ctrl = new AbortController();
    const p = recalcInWorker(doc(), { lang: 'ru', signal: ctrl.signal });
    ctrl.abort();
    // фолбэк проверяет сигнал между блоками: одиночный быстрый док может
    // успеть досчитаться — оба исхода легальны, главное без зависания
    const out = await p;
    expect(['done', 'cancelled']).toContain(out.status);
  });
});

describe('recalcWorker: protocol via FakeWorker', () => {
  it('done: блоки, подстановка и живой scope', async () => {
    _setWorkerFactory(() => new FakeWorker() as unknown as Worker);
    const out = await recalcInWorker(doc(), { lang: 'ru' });
    expect(out.status).toBe('done');
    if (out.status !== 'done') return;
    expect(out.blocks['rw-c'].resultStr).toBe('10');
    expect(out.blocks['rw-c'].substStr?.replace(/\s+/g, '')).toBe('2*5');
    expect(out.blocks['rw-c'].resultValue).toBe(10);
    // scope пересобран: скаляры + функция из def-строк
    expect(out.scope['F']).toBe(10);
    expect(out.scope['m']).toBe(2);
    // lastScope главного потока обновлён — плоты/отладчик видят значения
    expect(getLastScope()['F']).toBe(10);
  });

  it('прогресс симуляции доходит до клиента', async () => {
    _setWorkerFactory(() => new FakeWorker() as unknown as Worker);
    const sim = block('p', 'sim', 60, {
      rawInput: 'sim',
      simStates: 'x, v', simDerivs: 'v; -x', simInit: '1, 0',
      simT0: 0, simT1: 5, simDt: 0.02, simSolver: 'rk4',
      simX: 't', simY: 'x',
    });
    const seen: [number, number | null][] = [];
    const out = await recalcInWorker([sim], {
      lang: 'ru',
      onSimProgress: (_id, done, total) => seen.push([done, total]),
    });
    expect(out.status).toBe('done');
    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1];
    expect(last[0]).toBe(last[1]);
  });

  it('timeout убивает зависший воркер', async () => {
    _setWorkerFactory(() => new SilentWorker() as unknown as Worker);
    const out = await recalcInWorker(doc(), { lang: 'ru', timeoutMs: 30 });
    expect(out.status).toBe('timeout');
  });

  it('опоздавший ответ убитого воркера игнорируется', async () => {
    _setWorkerFactory(() => new SlowWorker() as unknown as Worker);
    const t0 = performance.now();
    const out = await recalcInWorker(doc(), { lang: 'ru', timeoutMs: 30 });
    expect(out.status).toBe('timeout');
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('abort убивает зависший воркер', async () => {
    _setWorkerFactory(() => new SilentWorker() as unknown as Worker);
    const ctrl = new AbortController();
    const p = recalcInWorker(doc(), { lang: 'ru', timeoutMs: 5000, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 10);
    expect((await p).status).toBe('cancelled');
  });
});
