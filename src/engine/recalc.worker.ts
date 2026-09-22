import { setLangState } from '../i18n';
import type { MathBlockData } from './dependencies';
import type {
  SerVal,
  SlimBlock,
  WorkerMsgToMain,
  WorkerOutBlock,
  WorkerReq,
} from './workerProtocol';
import { hydrateDb, type DbSnapshot } from '../lib/db';

/**
 * Движок грузим ЛЕНИВО, уже после hydrateDb: статический
 * import './dependencies' выполнял бы createBaseScope()
 * на старте воркера, когда драйвера БД ещё нет, и воркер падал
 * до первого сообщения (ошибка "NyaMath.db not initialized" в консоли).
 */
type Engine = {
  recalculateAllAsync: typeof import('./dependencies').recalculateAllAsync;
  serializeScopeValue: typeof import('./workerProtocol').serializeScopeValue;
  setNumFmt: typeof import('./mathEngine').setNumFmt;
  setUnitSys: typeof import('./mathEngine').setUnitSys;
  setComplexFmt: typeof import('./mathEngine').setComplexFmt;
  setAngleMode: typeof import('./mathEngine').setAngleMode;
};
let enginePromise: Promise<Engine> | null = null;
function ensureEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = Promise.all([
      import('./dependencies'),
      import('./workerProtocol'),
      import('./mathEngine'),
    ]).then(([deps, wp, me]) => ({
      recalculateAllAsync: deps.recalculateAllAsync,
      serializeScopeValue: wp.serializeScopeValue,
      setNumFmt: me.setNumFmt,
      setUnitSys: me.setUnitSys,
      setComplexFmt: me.setComplexFmt,
      setAngleMode: me.setAngleMode,
    }));
  }
  return enginePromise;
}

/**
 * Пересчёт в Web Worker: mathjs крутится вне UI-потока, зависший джоб
 * убивается terminate() со стороны клиента (AbortController/timeout) —
 * ответ Maple-зависаниям вида permute(55). Прогресс симуляций и блоков
 * стриммится сообщениями, итог — одним result (structured clone: только
 * строки/числа/массивы, resultValue едет как serValue).
 */

function toFull(s: SlimBlock): MathBlockData {
  return Object.assign(
    {
      id: '',
      x: 80,
      y: 60,
      rawInput: '',
      kind: 'math',
      displayLatex: '',
      resultStr: '',
      resultLatex: '',
      resultValue: null,
      error: null,
      dependencies: [],
      definedVar: null,
      isOutput: false,
      plotPreview: null,
      visualize: null,
      programTrace: null,
      simResult: null,
    },
    s,
  );
}

/** Джоба целиком (импортируемо в node-тестах через фейковый report). */
export async function runWorkerJob(
  req: WorkerReq,
  report: (m: WorkerMsgToMain) => void,
): Promise<Extract<WorkerMsgToMain, { type: 'result' }>> {
  setLangState(req.lang);
  const t0 = performance.now();
  try {
    // порядок сообщений гарантирует: init+hydrateDb уже отработал, БД готова
    const {
      recalculateAllAsync,
      serializeScopeValue,
      setNumFmt,
      setUnitSys,
      setComplexFmt,
      setAngleMode,
    } = await ensureEngine();
    setNumFmt(req.fmt ?? { mode: 'auto', digits: 6 });
    setUnitSys(req.unitSys ?? 'none');
    setComplexFmt(req.complexFmt ?? 'rect');
    setAngleMode(req.angleMode ?? 'rad');
    const list = req.blocks.map(toFull);
    const outcome = await recalculateAllAsync(
      list,
      {
        onBlock: (done, total) => {
          report({
            type: 'progress',
            jobId: req.jobId,
            done,
            total,
            simId: null,
            simDone: 0,
            simTotal: null,
          });
        },
        onSimProgress: (id, done, total) => {
          report({
            type: 'progress',
            jobId: req.jobId,
            done: -1,
            total: -1,
            simId: id,
            simDone: done,
            simTotal: total,
          });
        },
      },
      {
        only: req.only?.length ? new Set(req.only) : undefined,
      },
    );
    if (outcome.cancelled) {
      return { type: 'result', jobId: req.jobId, ok: false, error: 'cancelled' };
    }
    const { blocks, scope, changed, staleIds } = outcome.result;
    const out: WorkerOutBlock[] = Object.values(blocks).map((b) => {
      const { resultValue, ...rest } = b;
      return { ...rest, serValue: serializeScopeValue(resultValue) ?? null };
    });
    const serScope: Record<string, SerVal | null> = {};
    for (const [k, v] of Object.entries(scope)) {
      serScope[k] = serializeScopeValue(v) ?? null;
    }
    return {
      type: 'result',
      jobId: req.jobId,
      ok: true,
      blocks: out,
      scope: serScope,
      changed,
      staleIds,
      calcMs: performance.now() - t0,
    };
  } catch (e) {
    return {
      type: 'result',
      jobId: req.jobId,
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
    };
  }
}

interface WorkerGlobal {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage: (m: unknown) => void;
}

/* Регистрация только в реальном воркере (в окне и в node — молча пропускаем). */
const wself: WorkerGlobal | null =
  typeof self !== 'undefined' && typeof window === 'undefined'
    ? (self as unknown as WorkerGlobal)
    : null;

if (wself) {
  wself.onmessage = (ev: MessageEvent) => {
    const msg = ev.data as { snapshot?: DbSnapshot; jobId?: number } & Partial<WorkerReq>;
    // init: сырые строки NyaMath.db (sql.js в чанк воркера не тянем)
    if (msg && typeof msg === 'object' && 'snapshot' in msg) {
      hydrateDb(msg.snapshot as DbSnapshot);
      wself.postMessage({ type: 'ready', jobId: msg.jobId ?? -1 });
      return;
    }
    const req = ev.data as WorkerReq;
    void runWorkerJob(req, (m) => wself.postMessage(m)).then((res) => {
      wself.postMessage(res);
    });
  };
}
