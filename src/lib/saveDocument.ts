import type { MathBlockData } from '../engine/dependencies';
import { t } from '../i18n';

/**
 * Сохранение документа в файл.
 * Где поддерживается File System Access API (Chrome/Edge) — системный диалог
 * с выбором пути и имени; иначе — обычное скачивание в папку загрузок
 * (с разовой подсказкой про настройку браузера «всегда спрашивать»).
 */
export async function saveDocument(blocks: Record<string, MathBlockData>): Promise<void> {
  const payload = JSON.stringify(Object.values(blocks), null, 2);
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'nyamath-doc.json',
        types: [{ description: 'NyaMath document', accept: { 'application/json': ['.json'] } }],
      });
      const stream = await handle.createWritable();
      await stream.write(payload);
      await stream.close();
      return;
    } catch (e) {
      // Отмена диалога пользователем — молча выходим
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // Остальные ошибки — падаем в обычное скачивание ниже
    }
  } else {
    // Firefox/Safari: сайты не могут открыть системный диалог (API не поддерживается).
    // Диалог появится, если в браузере включено «всегда спрашивать, куда сохранять».
    try {
      if (!localStorage.getItem('nya-save-hint-shown') && !localStorage.getItem('weng-save-hint-shown')) {
        localStorage.setItem('nya-save-hint-shown', '1');
        alert(t('save.hint'));
      }
    } catch { /* localStorage недоступен — просто скачиваем */ }
  }
  const blob = new Blob([payload], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nyamath-doc.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
