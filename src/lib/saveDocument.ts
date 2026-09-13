import type { MathBlockData } from '../engine/dependencies';

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
        suggestedName: 'wengineering-doc.json',
        types: [{ description: 'Wengineering document', accept: { 'application/json': ['.json'] } }],
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
      if (!localStorage.getItem('weng-save-hint-shown')) {
        localStorage.setItem('weng-save-hint-shown', '1');
        alert(
          'Ваш браузер не даёт сайтам выбирать папку (например, Firefox).\n' +
            'Чтобы выбирать путь и имя при сохранении, включите в настройках браузера:\n' +
            '«Всегда спрашивать, куда сохранять файлы» (Настройки → Основные → Файлы и приложения).',
        );
      }
    } catch { /* localStorage недоступен — просто скачиваем */ }
  }
  const blob = new Blob([payload], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'wengineering-doc.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
