/**
 * Realtime-шина NyaMath: MCP-сервер — источник правды, веб-приложение —
 * подписанный клиент. Транспорт — plain node:http, без зависимостей:
 *
 * - GET  /events   — SSE-поток, сервер шлёт `snapshot` при каждом изменении;
 * - POST /push     — клиент присылает свой документ (валидация — на вызывающем);
 * - GET  /snapshot — текущее состояние (первичная загрузка);
 * - GET  /status   — ревизия и число блоков.
 *
 * Конфликты: last-writer-wins по ревизии (rev монотонно растёт на сервере).
 * Клиент подавляет эхо сравнением содержимого (см. src/lib/liveSync.ts).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export interface BlockMeta {
  clock: number;
  actor: string;
}

export interface SyncSnapshot {
  rev: number;
  blocks: unknown[];
  /** Per-block LWW-метки (CRDT-лайт); нет — legacy-клиент. */
  meta?: Record<string, BlockMeta>;
  /** Tombstones удалённых блоков. */
  deleted?: Record<string, BlockMeta>;
}

export interface PushResult {
  rev: number;
  /** Итог мёржа (только когда сервер сливал, а не принимал как есть). */
  merged?: SyncSnapshot;
}

interface SyncHandlers {
  getSnapshot: () => SyncSnapshot;
  /** Принять документ от клиента; вернуть ревизию (+мёрж при конфликте с meta).
   *  baseRev — optimistic concurrency: stale baseRev БЕЗ meta — 409 как раньше;
   *  stale baseRev С meta — three-way merge (CRDT-лайт). Бросает Error при битых данных. */
  applyPush: (blocks: unknown[], baseRev?: number, meta?: unknown, deleted?: unknown) => PushResult;
  getStatus: () => Record<string, unknown>;
}

const MAX_BODY = 12 * 1024 * 1024;

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Слишком большое тело запроса'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export function startSyncServer(
  port: number,
  handlers: SyncHandlers,
): { port: number; broadcast: () => void; close: () => void } {
  const clients = new Set<ServerResponse>();

  const sendSnapshot = (res: ServerResponse): void => {
    try {
      const snap = handlers.getSnapshot();
      res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
    } catch {
      /* клиент мог отключиться между проверками */
    }
  };

  const broadcast = (): void => {
    for (const res of [...clients]) {
      if (res.writableEnded || res.destroyed) {
        clients.delete(res);
        continue;
      }
      sendSnapshot(res);
    }
  };

  const server = createServer((req, res) => {
    void (async () => {
      cors(res);
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        clients.add(res);
        // первичное состояние сразу, переподключение EventSource тоже его получит
        sendSnapshot(res);
        const keepAlive = setInterval(() => {
          try {
            res.write(': ping\n\n');
          } catch {
            /* ignore */
          }
        }, 25000);
        req.on('close', () => {
          clearInterval(keepAlive);
          clients.delete(res);
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/snapshot') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(handlers.getSnapshot()));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(handlers.getStatus()));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/push') {
        try {
          const body = await readBody(req);
          const data: unknown = JSON.parse(body);
          if (
            !data ||
            typeof data !== 'object' ||
            !Array.isArray((data as { blocks?: unknown }).blocks)
          ) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Ожидается {blocks: [...]}' }));
            return;
          }
          const rawBaseRev = (data as { baseRev?: unknown }).baseRev;
          const baseRev =
            typeof rawBaseRev === 'number' && Number.isFinite(rawBaseRev) ? rawBaseRev : undefined;
          const inBlocks = (data as { blocks: unknown[] }).blocks;
          const inMeta = (data as { meta?: unknown }).meta;
          const inDeleted = (data as { deleted?: unknown }).deleted;
          const out = handlers.applyPush(inBlocks, baseRev, inMeta, inDeleted);
          broadcast();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify(
              out.merged
                ? {
                    ok: true,
                    rev: out.rev,
                    blocks: out.merged.blocks,
                    meta: out.merged.meta,
                    deleted: out.merged.deleted,
                  }
                : { ok: true, rev: out.rev },
            ),
          );
        } catch (e) {
          const status =
            typeof (e as { status?: unknown })?.status === 'number'
              ? (e as { status: number }).status
              : 400;
          const current = handlers.getStatus() as { rev?: unknown };
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
              rev: current.rev,
            }),
          );
        }
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Неизвестный путь' }));
    })();
  });

  server.on('error', (err: unknown) => {
    // Занятый порт и т.п. не должны ронять stdio-агента: sync просто не стартует.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[nyamath] sync disabled: ${msg}`);
  });
  server.listen(port);
  return {
    port: (server.address() as { port: number } | null)?.port ?? port,
    broadcast,
    close: () => {
      for (const res of clients) {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
      clients.clear();
      server.close();
    },
  };
}
