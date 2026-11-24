import { CHUNK_SECONDS, buildTranscript, chunkRanges, formatTime, TARGET_SAMPLE_RATE, to16kMonoRange, validateAudioBuffer } from './audio.js';
import { createCheckpoint, readCheckpoint, memoryEstimateMiB } from './checkpoint.js';
import { cleanFilename, downloadText, exportTranscriptText } from './exports.js';
import { resolveModel } from './model-options.js';
import { reviewCues, benchmarkRussian } from './quality.js';
import { repetitionAudit, preferRetry } from './hallucination.js';

const $ = id => document.getElementById(id);
const el = {
  audio: $('audio-file'), fileMeta: $('file-meta'), play: $('audio-preview'),
  run: $('run'), cancel: $('cancel'), rerun: $('rerun'), save: $('save'), transcript: $('transcript'), previousTranscript: $('previous-transcript'), previousModel: $('previous-model'), comparisonBox: $('comparison-box'),
  status: $('status'), progress: $('progress'), count: $('segment-count'),
  note: $('note'), privacy: $('privacy-agree'), checkpointSave: $('checkpoint-save'), checkpointFile: $('checkpoint-file'), memory: $('memory-warning'), model: $('asr-model'), reviewRun: $('review-run'), reviewList: $('review-list'), reference: $('reference'), benchmarkRun: $('benchmark-run'), benchmarkResult: $('benchmark-result'), speakerList: $('speaker-list'), speakerSave: $('speaker-save'),
};
const state = { file: null, worker: null, abort: null, busy: false, segments: [], complete: false, imported: null, duration: null, modelKey: null };

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.dataset.kind = isError ? 'error' : 'info';
}
function setProgress(done, total) {
  const pct = total ? Math.round(done * 100 / total) : 0;
  el.progress.value = pct;
  el.count.textContent = total ? `${done} / ${total} фрагментов (${pct}%)` : '';
}
function updateActions() {
  el.run.disabled = !state.file || state.busy || !el.privacy.checked;
  el.cancel.disabled = !state.busy;
  el.rerun.disabled = !state.file || state.busy || !state.segments.length || !el.privacy.checked;
  el.save.disabled = !el.transcript.value.trim();
  el.audio.disabled = state.busy;
  el.privacy.disabled = state.busy;
  el.checkpointSave.disabled = !state.file || !state.segments.length || !state.duration;
  el.checkpointFile.disabled = state.busy || !state.file;
  el.model.disabled = state.busy;
  el.speakerSave.disabled = !state.segments.length || state.busy;
}

let previewURL = null;
el.audio.addEventListener('change', () => {
  const file = el.audio.files?.[0] || null;
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = file ? URL.createObjectURL(file) : null;
  state.file = file;
  state.segments = [];
  state.complete = false;
  state.imported = null;
  state.duration = null;
  state.modelKey = null;
  el.reviewList.replaceChildren(); el.speakerList.replaceChildren(); el.benchmarkResult.textContent = '';
  el.comparisonBox.hidden = true;
  el.previousTranscript.value = '';
  el.checkpointFile.value = '';
  el.memory.textContent = file && file.size > 30_000_000 ? 'Большой аудиофайл: браузер может расходовать сотни мегабайт памяти при декодировании. Экспортируйте контрольные точки в процессе обработки.' : '';
  el.transcript.value = '';
  el.play.hidden = !file;
  el.play.removeAttribute('src');
  if (file) el.play.src = previewURL;
  const size = file ? `${(file.size / 1024 / 1024).toFixed(1)} МБ` : '';
  el.fileMeta.textContent = file ? `${file.name} · ${size}` : 'Файл не выбран';
  el.note.textContent = '';
  setProgress(0, 0);
  setStatus(file ? 'Файл выбран. Запустите тестовую расшифровку.' : 'Ожидание аудиофайла.');
  updateActions();
});
el.privacy.addEventListener('change', updateActions);
el.transcript.addEventListener('input', updateActions);
el.checkpointSave.addEventListener('click', () => {
  if (!state.file || !state.segments.length || !state.duration) return;
  try {
    const checkpoint = createCheckpoint({ file: state.file, segments: state.segments, durationSeconds: state.duration, chunkSeconds: CHUNK_SECONDS, completed: state.complete, modelKey: state.modelKey ?? el.model.value });
    downloadText(JSON.stringify(checkpoint, null, 2), `${cleanFilename(state.file.name)}_контрольная_точка.medpriem.json`);
    setStatus('Контрольная точка подготовлена для сохранения. Файл содержит текст разговора, храните его конфиденциально.');
  } catch (error) { setStatus(error.message, true); }
});
el.checkpointFile.addEventListener('change', async () => {
  const file = el.checkpointFile.files?.[0];
  if (!file || !state.file || state.busy) return;
  try {
    const checkpoint = readCheckpoint(await file.text(), state.file);
    if (checkpoint.chunkSeconds !== CHUNK_SECONDS) throw new Error('Другая длительность фрагментов, продолжение невозможно.');
    el.model.value = checkpoint.modelKey;
    state.modelKey = checkpoint.modelKey;
    state.imported = checkpoint;
    state.segments = checkpoint.segments;
    state.duration = checkpoint.durationSeconds;
    state.complete = checkpoint.completed;
    el.transcript.value = buildTranscript(state.segments, !state.complete);
    renderSpeakers();
    setProgress(checkpoint.nextIndex, Math.ceil(checkpoint.durationSeconds / CHUNK_SECONDS));
    el.note.textContent = 'Восстановлены ранее распознанные фрагменты. Ручные правки после контрольной точки в неё не входят.';
    setStatus(`Контрольная точка загружена: ${checkpoint.nextIndex} фрагментов. Нажмите «Начать расшифровку» для продолжения.`);
  } catch (error) {
    state.imported = null;
    setStatus(error.message, true);
  } finally { updateActions(); }
});

async function decodeAudio(file) {
  setStatus('Читаю аудиофайл локально…');
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  try {
    return await audioContext.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error('Браузер не смог открыть аудио. Попробуйте M4A, WAV или MP3, поддерживаемые вашим браузером.');
  } finally {
    await audioContext.close().catch(() => {});
  }
}

function workerRecognize(worker, data, signal) {
  return new Promise((resolve, reject) => {
    const handle = event => {
      const msg = event.data;
      if (msg.type === 'model-progress') {
        setStatus(`Загружаю бесплатную модель (${Math.round(msg.progress)}%)… Первый запуск требует интернета.`);
      } else if (msg.type === 'engine-state') {
        if (msg.state === 'running') setStatus('Распознаю речь непосредственно на этом устройстве…');
      } else if (msg.id === data.id && msg.type === 'recognized') {
        cleanup(); resolve(msg.text);
      } else if (msg.id === data.id && msg.type === 'error') {
        cleanup(); reject(new Error(msg.message));
      }
    };
    const handleError = event => { cleanup(); reject(new Error(event.message || 'Не удалось загрузить движок распознавания.')); };
    const handleAbort = () => { cleanup(); reject(new DOMException('Обработка остановлена', 'AbortError')); };
    const cleanup = () => {
      worker.removeEventListener('message', handle);
      worker.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
    };
    worker.addEventListener('message', handle);
    worker.addEventListener('error', handleError);
    signal?.addEventListener('abort', handleAbort, { once: true });
    if (signal?.aborted) { handleAbort(); return; }
    worker.postMessage({ ...data }, [data.samples.buffer]);
  });
}

el.reviewRun.addEventListener('click', () => {
  el.reviewList.replaceChildren();
  const cues = reviewCues(state.segments);
  if (!cues.length) { const li=document.createElement('li'); li.textContent = state.segments.length ? 'Автоматических отметок нет. Это не доказывает точность!' : 'Сначала выполните расшифровку.'; el.reviewList.append(li); return; }
  for (const cue of cues) {
    const li=document.createElement('li');
    const jump=document.createElement('button'); jump.type='button'; jump.textContent = `▶ ${formatTime(cue.startSeconds)}`;
    jump.addEventListener('click', () => { if (state.file) { el.play.currentTime=Math.max(0,cue.startSeconds - 1); el.play.play().catch(()=>{}); } });
    const desc=document.createElement('span'); desc.className='cue'; desc.textContent=`${cue.category}: «${cue.excerpt}»`;
    li.append(jump,desc); el.reviewList.append(li);
  }
  if (cues.length >= 75) { const li=document.createElement('li'); li.textContent='Показаны первые 75 отметок, остальные проверьте по тексту.'; el.reviewList.append(li); }
});
el.benchmarkRun.addEventListener('click', () => {
  try {
    const result=benchmarkRussian(el.reference.value,el.transcript.value);
    el.benchmarkResult.textContent=`WER ${(100*result.wer).toFixed(1)}% (${result.wordErrors} ошибок на ${result.referenceWords} слов); CER ${(100*result.cer).toFixed(1)}% (${result.characterErrors} ошибок на ${result.referenceChars} символов). Расхождений чисел: ${result.numericErrors} (эталон: ${result.numericReference.join(', ') || 'нет'}; результат: ${result.numericRecognized.join(', ') || 'нет'}). Это тестовая оценка, не клиническая гарантия.`;
  } catch(e) { el.benchmarkResult.textContent=e.message; }
});

function renderSpeakers() {
  el.speakerList.replaceChildren();
  for (const [i, segment] of state.segments.entries()) {
    const line = document.createElement('div'); line.className = 'speaker-line';
    const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'secondary'; jump.textContent = `▶ ${formatTime(segment.startSeconds)}`;
    jump.addEventListener('click', () => { if (state.file) { el.play.currentTime = Math.max(0, segment.startSeconds - 1); el.play.play().catch(() => {}); } });
    const select = document.createElement('select'); select.setAttribute('aria-label', `Говорящий на ${formatTime(segment.startSeconds)}`);
    for (const [value,label] of [['', 'Не определён / несколько голосов'],['1','Говорящий 1'],['2','Говорящий 2']]) {
      const option = document.createElement('option'); option.value=value; option.textContent=label; select.append(option);
    }
    select.value = segment.speaker || '';
    select.addEventListener('change', () => { segment.speaker = select.value; });
    const excerpt = document.createElement('span'); excerpt.className='speaker-excerpt'; excerpt.textContent=segment.text.slice(0,100);
    line.append(jump,select,excerpt); el.speakerList.append(line);
  }
  el.speakerSave.disabled = !state.segments.length || state.busy;
}
el.speakerSave.addEventListener('click', () => {
  if (!state.segments.length || !state.file) return;
  const body = state.segments.map(segment => `[${formatTime(segment.startSeconds)}] ${segment.speaker ? `Говорящий ${segment.speaker} (размечено вручную)` : 'Говорящий не определён'}: ${segment.text}`).join('\n\n');
  downloadText(exportTranscriptText({fileName:state.file.name,text:body,partial:!state.complete}), `${cleanFilename(state.file.name)}_говорящие_ручная_разметка.txt`);
});

el.rerun.addEventListener('click', () => {
  if (!state.file || state.busy || !state.segments.length || !el.privacy.checked) return;
  el.previousTranscript.value = el.transcript.value;
  el.previousModel.textContent = `Предыдущая модель: ${state.modelKey || 'неизвестно'}. Это отдельный результат того же файла.`;
  el.comparisonBox.hidden = false;
  state.segments = [];
  renderSpeakers();
  state.complete = false;
  state.imported = null;
  state.duration = null;
  state.modelKey = null;
  el.transcript.value = '';
  el.note.textContent = 'Предыдущий результат сохранён для сравнения в этой вкладке. Запускаю новый проход…';
  setProgress(0, 0);
  updateActions();
  el.run.click();
});

el.run.addEventListener('click', async () => {
  if (!state.file || state.busy || !el.privacy.checked) return;
  const currentFile = state.file;
  const modelKey = el.model.value;
  resolveModel(modelKey);
  if (state.segments.length && state.modelKey && state.modelKey !== modelKey) {
    setStatus('Нельзя продолжать расшифровку другой моделью: выберите прежнюю модель или заново загрузите файл.', true);
    return;
  }
  const wasComplete = state.complete;
  state.modelKey = modelKey;
  state.busy = true;
  const resume = state.imported || (state.segments.length && state.duration && !wasComplete ? { nextIndex: state.segments.length, durationSeconds: state.duration } : null);
  state.complete = false;
  if (!resume) { state.segments = []; renderSpeakers(); el.transcript.value = ''; setProgress(0, 0); }
  state.abort = new AbortController();
  el.note.textContent = '';
  updateActions();
  try {
    const decoded = await decodeAudio(currentFile);
    if (!state.busy || state.abort.signal.aborted) return;
    validateAudioBuffer(decoded);
    state.duration = decoded.duration;
    const memoryMiB = memoryEstimateMiB({ durationSeconds: decoded.duration, sampleRate: decoded.sampleRate, channels: decoded.numberOfChannels });
    if (resume && Math.abs(resume.durationSeconds - decoded.duration) > 0.1) throw new Error('Длительность записи не совпадает с контрольной точкой.');
    state.imported = null;
    if (decoded.duration > 900) {
      el.memory.textContent = `ВНИМАНИЕ: ${formatTime(decoded.duration)} — экспериментальная обработка. Оценка памяти только под звуковые массивы ~${memoryMiB} МиБ, без модели. Safari может завершить вкладку. Сохраняйте контрольные точки.`;
    }
    el.fileMeta.textContent = `${currentFile.name} · ${formatTime(decoded.duration)} · ${(currentFile.size / 1024 / 1024).toFixed(1)} МБ`;
    if (!state.busy || state.abort.signal.aborted) return;
    const samplesLength = Math.floor(decoded.length * TARGET_SAMPLE_RATE / decoded.sampleRate);
    const ranges = chunkRanges(samplesLength, TARGET_SAMPLE_RATE, CHUNK_SECONDS);
    if (ranges.length === 0) throw new Error('Аудиофайл пуст.');
    const worker = new Worker('./asr-worker.js', { type: 'module' });
    state.worker = worker;
    for (let i = resume?.nextIndex ?? 0; i < ranges.length; i++) {
      if (!state.busy || state.worker !== worker) return;
      const range = ranges[i];
      const chunk = to16kMonoRange(decoded, range.startSample, range.endSample);
      setStatus(`Фрагмент ${i + 1} из ${ranges.length}. Выполняется локальная расшифровка…`);
      let text = await workerRecognize(worker, { type: 'recognize', id: i, modelKey, samples: chunk }, state.abort.signal);
      const seconds = (range.endSample - range.startSample) / TARGET_SAMPLE_RATE;
      const audit = repetitionAudit(text, seconds);
      if (audit.suspicious) {
        setStatus(`Подозрительный повтор на ${formatTime(range.startSeconds)}. Пробую повторное распознавание…`);
        if (resolveModel(modelKey).family === 'whisper') {
          // The input was transferred to the worker, so reconstruct it for one retry.
          const retrySamples = to16kMonoRange(decoded, range.startSample, range.endSample);
          try {
            const second = await workerRecognize(worker, { type: 'recognize', id: `retry-${i}`, modelKey, samples: retrySamples, retry: true }, state.abort.signal);
            const choice = preferRetry(text, second, seconds);
            text = choice.text;
          } catch (retryError) {
            if (retryError?.name === 'AbortError') throw retryError;
            // Failed retry must never stop the remaining hour-long transcription.
          }
        }
        if (repetitionAudit(text, seconds).suspicious) {
          // Retain provenance, but never silently present a hallucination as a valid utterance.
          text = `[ТРЕБУЕТ ПРОСЛУШИВАНИЯ: подозрительное повторение на ${formatTime(range.startSeconds)}] ${text.slice(0, 200)}`;
        }
      }
      state.segments.push({ startSeconds: range.startSeconds, text });
      renderSpeakers();
      el.transcript.value = buildTranscript(state.segments);
      setProgress(i + 1, ranges.length);
      if ((i + 1) % 12 === 0) el.note.textContent = 'Для защиты прогресса сохраните контрольную точку прямо сейчас. Кнопка доступна во время обработки.';
      updateActions();
    }
    state.complete = true;
    state.imported = null;
    setStatus('Расшифровка завершена. Проверьте текст по оригинальной записи.');
    el.note.textContent = 'Распознавание экспериментальное: ошибки в терминах и дозировках возможны. Говорящие автоматически не определяются.';
  } catch (error) {
    if (state.busy || error?.name !== 'AbortError') {
      setStatus(error instanceof Error ? error.message : String(error), true);
      if (state.segments.length) {
        el.transcript.value = buildTranscript(state.segments, true);
        el.note.textContent = 'Расшифровка неполная. Сохранить можно только с отметкой о неполноте.';
      }
    }
  } finally {
    state.busy = false;
    if (state.worker) state.worker.terminate();
    state.worker = null;
    state.abort = null;
    // No decoded PCM is retained in application state; local browser memory is released when possible.
    updateActions();
  }
});

el.cancel.addEventListener('click', () => {
  if (!state.busy) return;
  state.busy = false;
  state.abort?.abort();
  if (state.worker) state.worker.terminate();
  state.worker = null;
  state.complete = false;
  state.imported = null;
  el.transcript.value = buildTranscript(state.segments, true);
  setStatus('Обработка остановлена. Ранее распознанные фрагменты сохранены в поле текста.');
  el.note.textContent = 'ВНИМАНИЕ: расшифровка неполная.';
  updateActions();
});

el.save.addEventListener('click', () => {
  const text = el.transcript.value.trim();
  if (!text) return;
  // If user edited the field, completion status is conservatively reset to incomplete.
  const partial = !state.complete;
  const result = exportTranscriptText({ fileName: state.file?.name, text, partial });
  downloadText(result, `${cleanFilename(state.file?.name)}_расшифровка.txt`);
  setStatus('Текст подготовлен для сохранения в «Файлы» или загрузки браузера.');
});

setStatus('Ожидание аудиофайла.');
updateActions();
