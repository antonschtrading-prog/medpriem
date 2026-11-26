// Deliberately creates TEXT, not fake DOCX. Word can open TXT; DOCX is planned.
export function cleanFilename(filename) {
  return String(filename || 'приём').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 70) || 'приём';
}

export function exportTranscriptText({ fileName, text, partial = false, speakersDetected = false, modelKey = '', now = new Date() }) {
  const header = ['МЕДПРИЁМ — РАСШИФРОВКА (ЧЕРНОВИК)', `Дата экспорта: ${now.toLocaleString('ru-RU')}`, `Исходный файл: ${fileName || 'не указан'}`, `Версия: 1.0; модель: ${modelKey || 'не указана'}`, speakersDetected ? 'Говорящие определены автоматически (экспериментально); разметка требует проверки по аудио. Проверяйте числа, дозировки и препараты.' : 'Говорящие автоматически НЕ определены. Проверяйте числа, дозировки, имена препаратов и медицинские факты.', ...(partial ? ['ВНИМАНИЕ: обработана только часть аудиозаписи.'] : []), '', ''];
  return header.join('\n') + String(text || '');
}

export function downloadText(text, filename, ownerDocument = document) {
  const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = ownerDocument.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  ownerDocument.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
