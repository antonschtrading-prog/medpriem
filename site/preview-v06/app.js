import { selectReviewJobs, compareReview } from './dual-review.js';
import { CHUNK_SECONDS, buildTranscript, chunkRanges, formatTime, TARGET_SAMPLE_RATE, to16kMono, to16kMonoRange, validateAudioBuffer } from './audio.js';
import { pauseAwareRanges } from './pause-segmentation.js';
import { sileroPauseRanges } from './silero-segmentation.js';
import { runEnginePreflight } from './preflight.js';
import { createPauseCheckpoint, readPauseCheckpoint } from './pause-checkpoint.js';
import { createCheckpoint, readCheckpoint, memoryEstimateMiB } from './checkpoint.js';
import { cleanFilename, downloadText, exportTranscriptText } from './exports.js';
import { resolveModel } from './model-options.js';
import { reviewCues, benchmarkRussian } from './quality.js';
import { repetitionAudit, preferRetry } from './hallucination.js';
import { recognitionWindow, reconcileBoundary } from './boundary-continuity.js';
import { meritsClinicalRetry, criticalDisagreement } from './critical-review.js';
import { normalizeSpeakerTurns, diarizedTranscript } from './diarization.js';

const $ = id => document.getElementById(id);
const el = {
  audio: $('audio-file'), fileMeta: $('file-meta'), play: $('audio-preview'),
  preflight: $('engine-preflight'), preflightResult: $('engine-preflight-result'),
  run: $('run'), cancel: $('cancel'), rerun: $('rerun'), save: $('save'), transcript: $('transcript'), previousTranscript: $('previous-transcript'), previousModel: $('previous-model'), comparisonBox: $('comparison-box'),
  status: $('status'), progress: $('progress'), count: $('segment-count'),
  note: $('note'), privacy: $('privacy-agree'), checkpointSave: $('checkpoint-save'), checkpointFile: $('checkpoint-file'), memory: $('memory-warning'), model: $('asr-model'), reviewRun: $('review-run'), reviewList: $('review-list'), reference: $('reference'), benchmarkRun: $('benchmark-run'), benchmarkResult: $('benchmark-result'), speakerList: $('speaker-list'), speakerSave: $('speaker-save'), speakerAfter: $('speaker-after'), speakerAuto: $('speaker-auto'), speakerStatus: $('speaker-status'), speakerTurns: $('speaker-turns'), speakerExportAuto: $('speaker-export-auto'),
};
const state = { file: null, worker: null, abort: null, busy: false, segments: [], complete: false, imported: null, duration: null, modelKey: null, diarizationBusy: false, diarizationWorker: null, turns: [], ranges: [], legacyFixed: false, preflightBusy: false, vadEngine: null };

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
  el.run.disabled = !state.file || state.busy || state.preflightBusy || !el.privacy.checked;
  el.cancel.disabled = !state.busy;
  el.rerun.disabled = !state.file || state.busy || state.preflightBusy || !state.segments.length || !el.privacy.checked;
  el.save.disabled = !el.transcript.value.trim();
  el.audio.disabled = state.busy;
  el.privacy.disabled = state.busy;
  el.checkpointSave.disabled = !state.file || !state.segments.length || !state.duration;
  el.checkpointFile.disabled = state.busy || !state.file;
  el.model.disabled = state.busy || state.preflightBusy;
  $('dual-after').disabled=state.busy;
  el.preflight.disabled = state.busy || state.preflightBusy;
  el.speakerSave.disabled = !state.segments.length || state.busy;
  el.speakerAuto.disabled = !state.file || state.busy || state.diarizationBusy || !state.segments.length || !el.privacy.checked;
  el.speakerExportAuto.disabled = !state.turns.length || state.busy || state.diarizationBusy;
}

let previewURL = null;
el.audio.addEventListener('change', () => {
  const file = el.audio.files?.[0] || null;
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = file ? URL.createObjectURL(file) : null;
  state.file = file;
  state.segments = [];
  renderDualReview();
  state.complete = false;
  state.imported = null;
  state.duration = null;
  state.modelKey = null;
  state.ranges = []; state.legacyFixed = false; state.vadEngine = null;
  state.turns = []; el.speakerStatus.textContent = ''; el.speakerTurns.replaceChildren();
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
el.preflight.addEventListener('click', async () => {
  if (state.busy || state.preflightBusy) return;
  state.preflightBusy = true;
  el.preflightResult.textContent = 'Проверяю доступность библиотек и модели…';
  updateActions();
  try {
    const results = await runEnginePreflight(el.model.value, message => {
      el.preflightResult.textContent = message;
    });
    el.preflightResult.textContent = results.map(r =>
      (r.ok ? '✓ ' : '✗ ') + r.name + ': ' + r.details
    ).join('\n');
    if (results.some(r => !r.ok)) setStatus('Самопроверка обнаружила проблему. Режим Silero или модель могут быть недоступны.', true);
    else setStatus('Проверка Silero выполнена. Манифест модели доступен. Полное распознавание и голоса пока не проверены.');
  } catch (error) {
    el.preflightResult.textContent = 'Самопроверка прервана: ' + (error?.message || String(error));
  } finally {
    state.preflightBusy = false;
    updateActions();
  }
});
el.transcript.addEventListener('input', updateActions);
el.checkpointSave.addEventListener('click', () => {
  if (!state.file || !state.segments.length || !state.duration) return;
  try {
    const checkpoint = state.legacyFixed ? createCheckpoint({ file: state.file, segments: state.segments, durationSeconds: state.duration, chunkSeconds: CHUNK_SECONDS, completed: state.complete, modelKey: state.modelKey ?? el.model.value }) : createPauseCheckpoint({ file: state.file, segments: state.segments, durationSeconds: state.duration, ranges: state.ranges, completed: state.complete, modelKey: state.modelKey ?? el.model.value });
    downloadText(JSON.stringify(checkpoint, null, 2), `${cleanFilename(state.file.name)}_контрольная_точка.medpriem.json`);
    setStatus('Контрольная точка подготовлена для сохранения. Файл содержит текст разговора, храните его конфиденциально.');
  } catch (error) { setStatus(error.message, true); }
});
el.checkpointFile.addEventListener('change', async () => {
  const file = el.checkpointFile.files?.[0];
  if (!file || !state.file || state.busy) return;
  try {
    const checkpointText = await file.text();
    const meta = JSON.parse(checkpointText);
    const legacyFixed = meta.version === 1;
    const checkpoint = legacyFixed ? readCheckpoint(checkpointText, state.file) : readPauseCheckpoint(checkpointText, state.file);
    if (legacyFixed && checkpoint.chunkSeconds !== CHUNK_SECONDS) throw new Error('Другая длительность старых фрагментов, продолжение невозможно.');
    state.legacyFixed = legacyFixed;
    state.ranges = legacyFixed ? [] : checkpoint.ranges;
    el.model.value = checkpoint.modelKey;
    state.modelKey = checkpoint.modelKey;
    state.imported = checkpoint;
    state.segments = checkpoint.segments;
    renderDualReview();
    state.duration = checkpoint.durationSeconds;
    state.complete = checkpoint.completed;
    el.transcript.value = buildTranscript(state.segments, !state.complete);
    state.turns = []; el.speakerTurns.replaceChildren(); el.speakerStatus.textContent = '';
    renderSpeakers();
    setProgress(checkpoint.nextIndex, legacyFixed ? Math.ceil(checkpoint.durationSeconds / CHUNK_SECONDS) : checkpoint.ranges.length);
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
      } else if (msg.type === 'model-config') {
        setStatus(`Модель ${msg.modelKey}; фактические веса: encoder=${msg.encoderDtype}, decoder=${msg.decoderDtype}; код ${msg.build}. Загружаю ONNX…`);
      } else if (msg.type === 'engine-state') {
        if (msg.state === 'running') setStatus('Распознаю речь непосредственно на этом устройстве…');
      } else if (msg.id === data.id && msg.type === 'recognized') {
        cleanup(); resolve({ text: msg.text, chunks: msg.chunks || [] });
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


function renderDualReview(){
  const list=$('dual-list');list.replaceChildren();
  const results=state.segments.map(s=>s.dualReview).filter(Boolean);
  for(const r of results){
    const li=document.createElement('li');
    const play=document.createElement('button');play.type='button';play.className='secondary';
    play.textContent='▶ '+formatTime(r.startSeconds)+'–'+formatTime(r.endSeconds);
    play.onclick=()=>{el.play.currentTime=r.startSeconds;el.play.play().catch(()=>{});};
    const detail=document.createElement('span');
    detail.textContent=r.status==='failed'?' Проверка не завершена.': ' '+(r.differs?'Расхождение':'Совпадение текста (не доказательство точности)')+' · '+r.modelKey+' · Основная: '+r.primary+' · Контрольная: '+r.alternate+(r.critical.length?' · Критические отличия: '+r.critical.join(', '):'');
    li.append(play,detail);list.append(li);
  }
  $('dual-status').textContent='Проверено '+results.filter(r=>r.status==='compared').length+' интервалов. Непроверенные интервалы не считаются достоверными.';
}
$('dual-export').onclick=()=>downloadText(JSON.stringify(state.segments.map(s=>s.dualReview).filter(Boolean),null,2), 'medpriem-review.json');
function showAutomaticTurns() {
  el.speakerTurns.replaceChildren();
  for (const turn of state.turns) {
    const line = document.createElement('div'); line.className = 'speaker-line';
    const play = document.createElement('button'); play.className = 'secondary'; play.type='button';
    play.textContent = `▶ ${formatTime(turn.startSeconds)}–${formatTime(turn.endSeconds)}`;
    play.addEventListener('click', () => {
      if (!state.file) return;
      el.play.currentTime = turn.startSeconds;
      el.play.play().catch(() => {});
    });
    const label = document.createElement('strong'); label.textContent = `Говорящий ${turn.speaker}`;
    line.append(play, label); el.speakerTurns.append(line);
  }
}

el.speakerAuto.addEventListener('click', async () => {
  if (!state.file || !state.segments.length || state.busy || state.diarizationBusy || !el.privacy.checked) return;
  state.diarizationBusy = true;
  state.turns = [];
  el.speakerTurns.replaceChildren();
  el.speakerStatus.textContent = 'Загружаю звук для локального определения голосов…';
  updateActions();
  let worker;
  try {
    const decoded = await decodeAudio(state.file);
    validateAudioBuffer(decoded);
    const length = decoded.duration;
    if (length > 1200) {
      el.speakerStatus.textContent = 'Длинная запись: для анализа голосов понадобится дополнительная память и загрузка модели. На телефоне возможна остановка вкладки.';
    }
    const samples = to16kMono(decoded);
    worker = new Worker('./diarization-worker.js'); // Classic worker required by Emscripten.
    state.diarizationWorker = worker;
    const raw = await new Promise((resolve,reject) => {
      worker.onerror = event => reject(new Error(event.message || 'Ошибка запуска движка голосов.'));
      worker.onmessage = ({ data }) => {
        if (data.id !== 1) return;
        if (data.type === 'diarization-progress') el.speakerStatus.textContent = data.message;
        if (data.type === 'diarization-result') resolve(data.segments);
        if (data.type === 'diarization-error') reject(new Error(data.message));
      };
      worker.postMessage({ type:'diarize', id:1, samples }, [samples.buffer]);
    });
    state.turns = normalizeSpeakerTurns(raw, length);
    if (!state.turns.length) throw new Error('Модель не нашла уверенно распознанных голосовых интервалов. Разметка не создана.');
    showAutomaticTurns();
    el.speakerStatus.textContent = `Найдено ${state.turns.length} временных интервалов; различимых голосов: ${new Set(state.turns.map(t => t.speaker)).size}. Это автоматические гипотезы, их нужно проверить по записи.`;
  } catch (error) {
    state.turns = [];
    el.speakerStatus.textContent = `Автоматическое разделение не завершено: ${error instanceof Error ? error.message : String(error)}. Основная расшифровка сохранена.`;
  } finally {
    worker?.terminate();
    state.diarizationWorker = null;
    state.diarizationBusy = false;
    updateActions();
  }
});
el.speakerExportAuto.addEventListener('click', () => {
  if (!state.turns.length || !state.file || !state.segments.length) return;
  const duration = state.duration || Math.max(...state.turns.map(t => t.endSeconds));
  const body = diarizedTranscript(state.segments, state.turns, duration, formatTime);
  downloadText(exportTranscriptText({fileName:state.file.name,text:body,partial:!state.complete,speakersDetected:true}), `${cleanFilename(state.file.name)}_говорящие_автоматически.txt`);
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
  state.turns = []; el.speakerTurns.replaceChildren(); el.speakerStatus.textContent = '';
  renderSpeakers();
  state.complete = false;
  state.imported = null;
  state.duration = null;
  state.ranges = []; state.legacyFixed = false;
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
  const resume = state.imported || (state.segments.length && state.duration && !wasComplete ? { nextIndex: state.segments.length, durationSeconds: state.duration, ranges: state.ranges } : null);
  state.complete = false;
  if (!resume) { state.segments = []; state.turns = []; el.speakerTurns.replaceChildren(); el.speakerStatus.textContent=''; renderSpeakers(); el.transcript.value = ''; setProgress(0, 0); }
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
    let ranges, segmentationNote = '';
    if (state.legacyFixed) {
      ranges = chunkRanges(samplesLength, TARGET_SAMPLE_RATE, CHUNK_SECONDS);
      segmentationNote = 'Продолжаю старую контрольную точку (25 секунд).';
    } else if (resume?.ranges?.length) {
      ranges = resume.ranges;
      segmentationNote = 'Восстановлены сохранённые границы речи.';
    } else {
      setStatus('Silero VAD определяет интервалы речи непосредственно в браузере…');
      try {
        const result = await sileroPauseRanges(decoded);
        ranges = result.ranges;
        segmentationNote = `Silero VAD: найдено ${result.speechCount} речевых интервалов.`;
      } catch (error) {
        ranges = pauseAwareRanges(decoded);
        segmentationNote = 'Silero VAD недоступен, использован локальный анализ пауз по энергии: ' +
          (error instanceof Error ? error.message : String(error));
      }
    }
    if (!state.busy || state.abort.signal.aborted) return;
    if (ranges.length === 0) throw new Error('Аудиофайл пуст.');
    state.ranges = ranges;
    state.vadEngine = state.legacyFixed ? 'legacy' : segmentationNote.startsWith('Silero VAD:') ? 'silero' : 'energy';
    el.note.textContent = segmentationNote;
    setStatus(segmentationNote + ' Начинаю распознавание фрагментов переменной длины.');
    const worker = new Worker('./asr-worker.js?v=09-gigaam', { type: 'module' });
    state.worker = worker;
    for (let i = resume?.nextIndex ?? 0; i < ranges.length; i++) {
      if (!state.busy || state.worker !== worker) return;
      const range = ranges[i];
      const window = state.legacyFixed ? { startSample: range.startSample, endSample: range.endSample, overlapSeconds: 0 } : recognitionWindow(ranges, i);
      const chunk = to16kMonoRange(decoded, window.startSample, window.endSample);
      setStatus(`Фрагмент ${i + 1} из ${ranges.length}. Выполняется локальная расшифровка…`);
      const firstResult = await workerRecognize(worker, { type: 'recognize', id: i, modelKey, samples: chunk }, state.abort.signal);
      let text = firstResult.text;
      let timedChunks = firstResult.chunks;
      const seconds = (window.endSample - window.startSample) / TARGET_SAMPLE_RATE;
      const audit = repetitionAudit(text, seconds);
      let clinicalReview = false;
      const isWhisper = resolveModel(modelKey).family === 'whisper';
      // A single extra decode only on suspicious or clinically critical spans.
      // Compare numeric, dosage, medication and negation facts without inventing corrections.
      const safetyRetry = isWhisper && meritsClinicalRetry(text);
      if (isWhisper && (audit.suspicious || safetyRetry)) {
        setStatus('Проверяю спорный участок повторным распознаванием…');
        const retrySamples = to16kMonoRange(decoded, window.startSample, window.endSample);
        try {
          const second = await workerRecognize(worker, { type: 'recognize', id: `retry-${i}`, modelKey, samples: retrySamples, retry: true }, state.abort.signal);
          if (criticalDisagreement(text, second.text).length) clinicalReview = true;
          if (audit.suspicious) {
            const choice = preferRetry(text, second.text, seconds);
            text = choice.text;
            if (choice.improved) timedChunks = second.chunks;
          }
          // If both runs are fluent but disagree, preserve the original words
          // and refer to original audio. No confidence is inferred.
        } catch (retryError) {
          if (retryError?.name === 'AbortError') throw retryError;
          clinicalReview = clinicalReview || safetyRetry;
        }
      }
      if (audit.suspicious && repetitionAudit(text, seconds).suspicious) {
        text = `[ТРЕБУЕТ ПРОСЛУШИВАНИЯ: подозрительное повторение на ${formatTime(range.startSeconds)}] ${text.slice(0, 200)}`;
      }
      // Only remove words whose exact repetition at the forced seam is demonstrated.
      // Keep disagreement verbatim and mark the segment for human listening.
      const boundary = reconcileBoundary(state.segments.at(-1)?.text, text, window.overlapSeconds > 0);
      text = boundary.text;
      const segment = { startSeconds: range.startSeconds, endSeconds: range.endSeconds, text, rawRecognition: firstResult.text,
        // Overlapped word timestamps refer to different origins; do not attach
        // them to a wrong speaker until real word alignment is available.
        timedChunks: window.overlapSeconds > 0 ? [] : timedChunks,
        boundaryReview: boundary.requiresReview, clinicalReview };
      state.segments.push(segment);
      renderSpeakers();
      el.transcript.value = buildTranscript(state.segments);
      setProgress(i + 1, ranges.length);
      if ((i + 1) % 12 === 0) el.note.textContent = segmentationNote + ' Для защиты прогресса сохраните контрольную точку прямо сейчас.';
      updateActions();
    }
    // Release the primary model before loading the independent model.
    worker.terminate(); state.worker = null;
    if ($('dual-after').checked && !state.legacyFixed) {
      const jobs=selectReviewJobs(state.segments,ranges,modelKey);
      if(jobs.length){
        const verifier=new Worker('./asr-worker.js?v=09-gigaam', {type:'module'});
        state.worker=verifier;
        try {
          for(const [j,job] of jobs.entries()){
            if(state.abort.signal.aborted) throw new DOMException('Отменено','AbortError');
            setStatus('Независимая проверка '+(j+1)+' / '+jobs.length);
            const s=state.segments[job.index];
            try {
              const result=await workerRecognize(verifier,{type:'recognize',id:'verify-'+j,modelKey:job.modelKey,samples:to16kMonoRange(decoded,job.startSample,job.endSample)},state.abort.signal);
              s.dualReview=compareReview(s.rawRecognition??s.text,result.text,job);
            } catch(e) {
              if(e?.name==='AbortError') throw e;
              s.dualReview={status:'failed',modelKey:job.modelKey,startSeconds:job.startSample/16000,endSeconds:job.endSample/16000,reasons:job.reasons};
              // A model-load failure can recur for every job; stop rather than loop.
              break;
            }
          }
        } finally {verifier.terminate();state.worker=null;}
      }
      renderDualReview();
    }
    state.complete = true;
    state.imported = null;
    setStatus('Расшифровка завершена. Проверьте текст по оригинальной записи.');
    el.note.textContent = segmentationNote + ' Распознавание экспериментальное: ошибки в терминах и дозировках возможны. Говорящие автоматически не определяются.';
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
    if (state.complete && el.speakerAfter.checked && state.file === currentFile) {
      // Single user action for ASR + experimental acoustic diarization.
      // Schedule after busy state clears so the existing click handler can run.
      queueMicrotask(() => el.speakerAuto.click());
    }
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
