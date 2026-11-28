# Дорожная карта

1. Проверить успешный CI и публикацию версии 0.4 в GitHub Pages.
2. Испытать повторный детектор на проблемных интервалах исходного MP3: 08:45, 14:35, 18:45.
3. Запустить Wav2Vec2 XLSR на коротком русском эталонном аудио, затем Whisper Medium только при достаточной памяти.
4. Измерить WER, CER, числовые ошибки и отношение времени вычислений к длительности записи.
5. При необходимости подключить GigaAM v3 отдельным браузерным ONNX-движком после доказательства совместимости.
6. Реализован локальный повторный запуск другой модели и сохранение одного предыдущего текста в открытой вкладке; следующий этап — полноценная история всех результатов и сравнение по таймкодам.
7. Реализовать проверенную диаризацию с ручной коррекцией «врач/пациент».
8. Только после точности и приватности: локальные DOCX и клинические шаблоны.

## Ближайший цикл по решению пользователя 25.11.2026
1. Прогнать CI и браузерную проверку ветки разметки говорящих, включая импорт контрольной точки и экспорт.
2. Исследовать реальную браузерную диаризацию: voice-activity detection + speaker embeddings/clustering с локальным выполнением, проверить точность на двух голосах, скорость и Safari; не маркировать голоса автоматически до успешных испытаний.
3. Испытать уже подключённые Wav2Vec2 XLSR Russian и Whisper Medium на коротком обезличенном аудио. Не считать пункт меню доказательством работы.
4. Сохранить основной пользовательский сценарий одной кнопки; техническое сравнение моделей оставить лишь в экспериментальном режиме.

### Проверенные направления для будущего автоматического движка
- Browser-only ONNX диаризация: https://github.com/khawjaahmad/nemotron-diarization-web (Nemotron 3, экспериментальная реализация), https://github.com/adamwulf/speech-diarization (pyannote+WeSpeaker). Это внешние кандидаты, НЕ интегрированы и НЕ проверены на наших русских записях.
- Перед интеграцией проверить лицензии моделей и библиотек, размеры загрузки, приватность сетевых запросов, Safari/iPhone и разделение коротких перебиваний. Сохранить ручную разметку как контрольный эталон.

### Проверка акустического движка v0.5
1. На отдельной preview-ветке открыть браузерную страницу и подтвердить загрузку Sherpa WASM + data/ONNX через CORS, наличие интервалов и отсутствие сетевой отправки аудио.
2. Прогнать тестовую двухголосную запись 2–3 мин, проверить время смены голоса и реальное количество ложных назначений.
3. Проверить Safari/Chrome, Mac M1 8 GB, затем iPhone, в том числе ошибки памяти при 31-минутном аудио.
4. Добавить точные временные метки слов/коротких реплик, чтобы разговор врача и пациента отображался раздельно даже при частых перебиваниях; текущая автоматическая разметка целых 25-секундных блоков недостаточна для конечного ТЗ.
5. Только после подтверждённого inference и тестов слить PR в main. Ручная версия — резервный инструмент, не пользовательский основной сценарий.

6. После CI выполнить реальный короткий прогон Whisper + Sherpa-ONNX в Chrome и Safari, проконтролировать ошибки CORS/загрузки бинарных файлов. При необходимости зафиксировать проверенные URL файлов/хеши и организовать статическую бесплатную раздачу.
7. Проверить включение однокнопочного режима, fallback Whisper без таймкодов и отсутствие приписывания смешанного диалога одному голосу. Оценить DER и качество пословной привязки на эталонном двухголосном аудио.

## Следующий этап после 0.8
Проверить CI и inference на обезличенном двухголосном аудио; измерить WER, ошибки доз и отрицаний; проверить полноту покрытия выбранных интервалов, потребление памяти и диаризацию. Не публиковать как клинически проверенное.

## 0.9
Подтвердить реальную загрузку и русский inference GigaAM на Mac M1, проверить лицензии весов, сопоставить результаты с имеющимися расшифровками; затем проверять акустическую диаризацию. Не считать тест заглушки реальным распознаванием.

## 1.0 gates (supersede previous experimental model list)
1. Validate E2E runtime and diarization API/output; verify tests/Chrome. 2. Adapt upstream boundary stitching and word timing, then contextual reread and ROVER without replacing clinical facts. 3. Full audio benchmark and privacy checks. 4. Publish only validated preview; preserve 0.9.

1.0: finish CI, browser runtime validation, real E2E and diarization benchmark. DP suggestions are conservative ROVER-style adaptation; full insertion voting and acoustic forced alignment remain research items.

Independent CTC alignment: verify actual ONNX runtime, time accuracy and rejection rates on reference speech. No clinical use until validated.

## 1.1
Validate benchmark contracts, browser integration, cancellation, exports; run real public dialogue and synthetic clinical reference; profile per-stage runtime; then select adaptive configuration and optimize only measured bottlenecks.

1.1.1: verify recovery on reload and interrupted model; then resume the public dialogue benchmark, without re-running finished models.

Parallel lab: run five models on the same public 37-second excerpt in independent runner jobs; compare hashes and segmentation, collect timings and disagreements. Use results and existing user exports to reduce the candidate set; avoid full-recording repeats unless they answer a specific remaining question. Local runtime remains serial until measured memory/performance support concurrency.

1.2: validate one-button workflow, exact-file recovery, timing and bounded review, numeric preservation, public dialogue runtime. Publish after regression/browser gates. Then measure on Safari/iPhone, investigate neural punctuation and verified WebGPU provider; improve speaker accuracy using reference annotations. Do not rerun all five models.

## Current 1.3–1.5 plan (28.11.2026)
- 1.3: WebKit full 37s pipeline passed in non-isolated single-thread mode (46160278197, 115.041s), Chromium passed 47.496s. Verify long recordings, real iPhone/Mac, memory and recovery; retain serial engines because parallel gain was marginal. Publish after integration gates, preserve 1.2.
- 1.4: finish local punctuation alignment and browser smoke; evaluate precision/recall on Russian annotated text and critical negations/doses; integrate conservative formatting without overwriting raw text; improve speaker attribution and completeness.
- 1.5: integrate existing protocol editor with transcription, manual doctor/patient roles, source-linked drafts, TXT/JSON and later DOCX. Final privacy review and user validation; no automatic clinical conclusions or identifiable patient recordings before audit.
