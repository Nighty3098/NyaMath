import {
  recalculateAllAsync,
  setLastScope,
  type MathBlockData,
} from '../engine/dependencies';
import type { Scope } from '../engine/mathEngine';
import type { NumFmt } from '../engine/mathEngine';
import {
  collectDefLines,
  deserializeScopeValue,
  rebuildMainScope,
  slimWorkerInput,
  type SerVal,
  type WorkerMsgToMain,
  type WorkerOutBlock,
  type WorkerReq,
} from '../engine/workerProtocol';
import { snapshotDb } from './db';
import { getLang, type Lang } from '../i18n';

/**
 * Пересчёт в Web Worker с отменой и таймаутом.
 *
 * Тяжёлые синхронные куски (один мат-блок с огромным numsum, program-цикл)
 * чанками не прерываются — их вынесли в Worker: зависший джоб убивается
 * terminate() (AbortController/timeout), воркер пересоздаётся, прошлые
 * результаты остаются на экране. Нет Worker (node-тесты, старые браузеры)
 * или создание упало — честный фолбэк на main-thread recalculateAllAsync.
 */

/** Лимит одной джобы: ответ Maple-зависаниям — убить, а не висеть. */
export const RECALC_TIMEOUT_MS = 30000;

export type RecalcJobOutcome =
  | {
    status: 'done';
    blocks: Record<string, MathBlockData>;
    scope: Scope;
    changed: boolean;
    staleIds: string[];
    calcMs: number;
  }
  | { status: 'cancelled' }
  | { status: 'timeout' }
  | { status: 'failed'; error: string };

export interface RecalcJobOpts {
  lang: Lang;
  /** Формат чисел (по умолчанию — из модуля движка). */
  fmt?: NumFmt;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  onSimProgress?: (id: string, done: number, total: number | null) => void;
  /** Calculate Now: только эти + upstream (пусто/нет = полный пересчёт) */
  only?: string[];
}

type WorkerFactory = () => Worker;
/** undefined — обычный Worker; null — принудительный фолбэк; fn — подмена (тесты). */
let factoryOverride: WorkerFactory | null | undefined;
export function _setWorkerFactory(f: WorkerFactory | null | undefined): void {
  factoryOverride = f;
  killWorker();
}

let worker: Worker | null = null;
let jobSeq = 0;

function killWorker(): void {
  try {
    worker?.terminate();
  } catch {
    /* уже мёртв */
  }
  worker = null;
  hydratedWorker = null;
}

function createWorker(): Worker | null {
  if (factoryOverride === null) return null;
  try {
    if (factoryOverride) return factoryOverride();
    if (typeof Worker === 'undefined') return null;
    return new Worker(new URL('../engine/recalc.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    return null;
  }
}

/** WorkerOutBlock → живой блок: serValue назад в resultValue. */
function reviveBlock(wb: WorkerOutBlock): MathBlockData {
  const { serValue, ...rest } = wb;
  let resultValue: unknown = null;
  if (serValue !== null && serValue !== undefined) {
    try {
      const rv = deserializeScopeValue(serValue);
      if (rv !== undefined) resultValue = rv;
    } catch {
      resultValue = null;
    }
  }
  return { ...rest, resultValue };
}

function applyResult(
  blocks: WorkerOutBlock[],
  serScope: Record<string, SerVal | null>,
  defHint: MathBlockData[],
  calcMs: number,
  changed: boolean,
  staleIds: string[],
): Extract<RecalcJobOutcome, { status: 'done' }> {
  const out: Record<string, MathBlockData> = {};
  for (const wb of blocks) out[wb.id] = reviveBlock(wb);
  const scope = rebuildMainScope(serScope, collectDefLines(defHint));
  setLastScope(scope);
  return { status: 'done', blocks: out, scope, changed, staleIds, calcMs };
}

/** Фолбэк без Worker: тот же API поверх main-thread recalculateAllAsync. */
async function fallbackMain(
  blocks: MathBlockData[],
  opts: RecalcJobOpts,
  timeoutMs: number,
): Promise<RecalcJobOutcome> {
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
  }, timeoutMs);
  const t0 = performance.now();
  try {
    const outcome = await recalculateAllAsync(blocks, {
      shouldCancel: () => timedOut || opts.signal?.aborted === true,
      onBlock: opts.onProgress,
      onSimProgress: opts.onSimProgress,
    }, {
      only: opts.only?.length ? new Set(opts.only) : undefined,
    });
    if (outcome.cancelled) {
      return timedOut ? { status: 'timeout' } : { status: 'cancelled' };
    }
    return {
      status: 'done',
      blocks: outcome.result.blocks,
      scope: outcome.result.scope,
      changed: outcome.result.changed,
      staleIds: outcome.result.staleIds,
      calcMs: performance.now() - t0,
    };
  } catch (e) {
    return {
      status: 'failed',
      error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Воркер, уже получивший снапшот БД (init-хендшейк пройден). */
let hydratedWorker: Worker | null = null;

/** Отправить сырые строки БД в свежий реальный воркер и дождаться ready. */
function hydrateRealWorker(w: Worker): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(false);
      }
    }, 10000);
    const prevOnMessage = w.onmessage;
    const prevOnError = w.onerror;
    w.onmessage = (ev: MessageEvent) => {
      const m = ev.data as { type?: string } | null;
      if (m && typeof m === 'object' && m.type === 'ready') {
        if (!done) {
          done = true;
          clearTimeout(timer);
          w.onmessage = prevOnMessage;
          w.onerror = prevOnError;
          resolve(true);
        }
      }
    };
    w.onerror = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(false);
      }
    };
    try {
      w.postMessage({ type: 'init', snapshot: snapshotDb() });
    } catch {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(false);
      }
    }
  });
}

export async function recalcInWorker(
  blocks: MathBlockData[],
  opts: RecalcJobOpts,
): Promise<RecalcJobOutcome> {
  const timeoutMs = opts.timeoutMs ?? RECALC_TIMEOUT_MS;
  if (opts.signal?.aborted) return { status: 'cancelled' };
  if (!worker) worker = createWorker();
  if (!worker) return fallbackMain(blocks, opts, timeoutMs);
  // настоящий воркер (не тестовая подмена): сначала снапшот БД, иначе движок
  // внутри упадёт на первом же getConstant (sql.js в чанк воркера не тянем)
  if (!factoryOverride && worker !== hydratedWorker) {
    const ok = await hydrateRealWorker(worker);
    if (!ok || worker === null) {
      if (worker) killWorker();
      return fallbackMain(blocks, opts, timeoutMs);
    }
    hydratedWorker = worker;
  }

  const w = worker;
  const slim = blocks.map(slimWorkerInput);
  const jobId = ++jobSeq;
  const req: WorkerReq = { jobId, lang: opts.lang, fmt: opts.fmt, blocks: slim, only: opts.only };

  return new Promise<RecalcJobOutcome>((resolve) => {
    let done = false;
    const finish = (o: RecalcJobOutcome) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      // чужой воркер после kill уже не отвечает; синглтон чистим только при убийстве
      resolve(o);
    };
    const timer = setTimeout(() => {
      if (worker === w) killWorker();
      finish({ status: 'timeout' });
    }, timeoutMs);
    const onAbort = () => {
      if (worker === w) killWorker();
      finish({ status: 'cancelled' });
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    w.onmessage = (ev: MessageEvent) => {
      const m = ev.data as WorkerMsgToMain | null;
      if (!m || m.jobId !== jobId) return;
      if (m.type === 'progress') {
        if (m.simId !== null) opts.onSimProgress?.(m.simId, m.simDone, m.simTotal);
        else if (m.done >= 0) opts.onProgress?.(m.done, m.total);
        return;
      }
      if (!m.ok) {
        // движок упал внутри воркера — добиваем и считаем на главном (тот же код)
        if (worker === w) killWorker();
        void fallbackMain(blocks, opts, timeoutMs).then(finish);
        return;
      }
      finish(applyResult(m.blocks, m.scope, blocks, m.calcMs, m.changed, m.staleIds));
    };
    w.onerror = () => {
      // воркер не стартовал (бандл/CSP) — фолбэк вместо красного экрана
      if (worker === w) killWorker();
      void fallbackMain(blocks, opts, timeoutMs).then(finish);
    };
    try {
      w.postMessage(req);
    } catch {
      if (worker === w) killWorker();
      void fallbackMain(blocks, opts, timeoutMs).then(finish);
    }
  });
}

/** Язык стора для воркер-джоб (ошибки движка локализованы). */
export function workerLang(): Lang {
  return getLang();
}
