import { recalculateAllAsync, type MathBlockData } from './dependencies';
import { setLangState } from '../i18n';
import {
  serializeScopeValue,
  type SerVal,
  type SlimBlock,
  type WorkerMsgToMain,
  type WorkerOutBlock,
  type WorkerReq,
} from './workerProtocol';

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
      id: '', x: 80, y: 60, rawInput: '', kind: 'math',
      displayLatex: '', resultStr: '', resultLatex: '', resultValue: null,
      error: null, dependencies: [], definedVar: null, isOutput: false,
      plotPreview: null, visualize: null, programTrace: null, simResult: null,
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
    const list = req.blocks.map(toFull);
    const outcome = await recalculateAllAsync(list, {
      onBlock: (done, total) => {
        report({
          type: 'progress', jobId: req.jobId, done, total,
          simId: null, simDone: 0, simTotal: null,
        });
      },
      onSimProgress: (id, done, total) => {
        report({
          type: 'progress', jobId: req.jobId, done: -1, total: -1,
          simId: id, simDone: done, simTotal: total,
        });
      },
    });
    if (outcome.cancelled) {
      return { type: 'result', jobId: req.jobId, ok: false, error: 'cancelled' };
    }
    const { blocks, scope, changed } = outcome.result;
    const out: WorkerOutBlock[] = Object.values(blocks).map((b) => {
      const { resultValue, ...rest } = b;
      return { ...rest, serValue: serializeScopeValue(resultValue) ?? null };
    });
    const serScope: Record<string, SerVal | null> = {};
    for (const [k, v] of Object.entries(scope)) {
      serScope[k] = serializeScopeValue(v) ?? null;
    }
    return {
      type: 'result', jobId: req.jobId, ok: true,
      blocks: out, scope: serScope, changed, calcMs: performance.now() - t0,
    };
  } catch (e) {
    return {
      type: 'result', jobId: req.jobId, ok: false,
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
    const req = ev.data as WorkerReq;
    void runWorkerJob(req, (m) => wself.postMessage(m)).then((res) => {
      wself.postMessage(res);
    });
  };
}
