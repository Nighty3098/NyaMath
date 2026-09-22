/**
 * HTTP-клиент realtime-шины NyaMath (для nya_sync_pull / nya_sync_push).
 * Тонкий ре-экспорт единого протокола из src/lib/syncProtocol.ts —
 * раньше здесь была копия pull/push/resolve (~100 строк дрейфа с liveSync).
 */
export {
  pullSnapshot,
  pushSnapshot,
  resolveSyncUrl,
  DEFAULT_SYNC_URL,
  type SyncSnapshot,
  type PushBody,
  type PushResult,
  type BlockMeta,
  type MetaMap,
  type WireBlock,
} from '../../src/lib/syncProtocol.js';
