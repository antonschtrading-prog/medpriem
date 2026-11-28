// Russian ASR hallucination guard. Acoustic correctness still requires checking the recording.
const tokens = text => String(text || '').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').match(/[а-яa-z0-9]+/gi) || [];
export function repetitionAudit(text, seconds = 25) {
  const words = tokens(text);
  const flags = [];
  if (words.length > Math.max(145, Math.ceil(seconds * 6))) flags.push('аномально много слов для длительности фрагмента');
  if (words.length >= 16) {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const counts = new Map();
      for (let i = 0; i <= words.length - n; i++) {
        const key = words.slice(i, i+n).join(' ');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      let max = 0;
      for (const value of counts.values()) max = Math.max(max, value);
      if ((n === 1 && max >= 25 && max / words.length > .42) ||
          (n >= 2 && max >= 9 && max * n / words.length > .45)) {
        flags.push('многократное повторение слов или фраз');
        break;
      }
    }
  }
  if (words.length >= 24 && new Set(words).size / words.length < .22) flags.push('необычно низкое разнообразие слов');
  return { suspicious: flags.length > 0, reasons: [...new Set(flags)], wordCount: words.length };
}
export function preferRetry(originalText, alternateText, seconds = 25) {
  const first = repetitionAudit(originalText, seconds);
  const second = repetitionAudit(alternateText, seconds);
  if (!first.suspicious || second.suspicious) return { text: originalText, improved: false, flagged: first.suspicious };
  return { text: alternateText, improved: true, flagged: false };
}
