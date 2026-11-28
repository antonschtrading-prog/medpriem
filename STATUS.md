# Статус 0.4 — 25.11.2026

## Реализовано в GitHub
- Введён детектор зацикливания текста и аномального количества слов за 25 секунд.
- При подозрении на зацикливание Whisper повторяется ровно один запуск с противодействующими повторению параметрами.
- Если повторный результат также подозрительный, участок снабжается явной меткой необходимости прослушивания; обзор отмечает его в списке.
- Добавлены экспериментальные кандидаты Wav2Vec2 XLSR Russian ONNX (CTC) и Whisper Medium ONNX.
- Реестр моделей разделяет Whisper-параметры генерации и CTC-вызов.
- Созданы Node-регрессионные тесты и проверка перед публикацией Pages.
- Реализован повторный запуск модели без новой загрузки аудио; предыдущая расшифровка остаётся видимой в браузере до закрытия вкладки.
- Проверены синтаксис семи модулей и девять проверок из тестового файла репозитория в отдельной JS-среде (9/9 PASS).
- Успешный GitHub CI/Pages после обновления и реальный inference новых движков пока не подтверждены.

## Фактически подтверждено ранее
- Предыдущая v0.3 работала в браузере у пользователя: 31-минутный русский диалог обработан моделями Base и Small.
- Обе допустили зацикливания, Small улучшила читаемость некоторых фрагментов, но не обеспечила достоверную клиническую точность.

## НЕ проверено
- Реальный запуск двух новых моделей, загрузка весов, производительность, Safari/iPhone.
- Эффективность повторного декодирования на исходном аудио.
- Новая публикация Pages/CI не считается успешной до получения результата GitHub Actions.
- Восстановление исходной речи в отмеченных фрагментах без прослушивания аудио.

## Ветка feature/speaker-review-v05 (проверка до слияния)
- Добавлена ручная привязка обозначений «Говорящий 1/2» к 25-секундным фрагментам и отдельный экспорт; исходный текст сохраняется.
- Это НЕ автоматическая диаризация: внутри одного фрагмента могут говорить несколько человек; по умолчанию говорящий не определён.
- Wav2Vec2 XLSR Russian и Whisper Medium уже присутствуют как экспериментальные варианты в v0.4; повторно не добавлялись. Их реальный запуск, память и корректность ещё не проверены.
- Изменения пока только в отдельной ветке; браузерные испытания и CI после изменений не подтверждены.

## Ветка v0.5: реальный акустический движок (25.11.2026)
- Созданы site/diarization-worker.js: экспериментальный Sherpa-ONNX WASM с pyannote сегментацией, speaker embedding и кластеризацией, выполняется в браузерном Worker. Весовые файлы скачиваются со стороннего Hugging Face при первом использовании; запись передаётся в локальный Worker, не на ASR-сервер.
- Добавлена кнопка запуска автоматического определения говорящих после расшифровки, отображение временных интервалов и отдельный TXT с осторожным присвоением голоса только целиком одноголосным 25-секундным ASR-фрагментам. Смешанные фрагменты сохраняются без выдуманного говорящего.
- Добавлены тесты normalizeSpeakerTurns/speakerForWindow/diarizedTranscript; их CI пока не подтверждён.
- Важно: реальный inference WASM, корректная загрузка кросс-доменных весов, производительность и Safari/iPhone НЕ ПРОВЕРЕНЫ. Нельзя утверждать, что автоматическая диаризация уже работает у пользователя.
- 25-секундные текстовые фрагменты НЕ имеют поминутных/пословных меток; точное распределение каждой реплики требует ASR с временными метками слов. Следующий важный шаг — связка diarization+word timestamps без придуманных слов/атрибуции.

## Последние изменения v0.5
- Подключена экспериментальная однокнопочная последовательность «распознать → автоматически определить говорящих» после явного согласия пользователя (галочка в интерфейсе).
- Whisper теперь запрашивает временные метки фрагментов, передаёт их вместе с текстом и при несовместимом ONNX-экспорте пробует прежний режим без меток. Wav2Vec2 остаётся без точной пословной привязки до тестирования.
- Автоматический экспорт распределяет речь по голосам только при валидных таймкодах и точном сохранении текста; иные участки не приписываются произвольно. Исправлена маркировка происхождения в TXT.
- Добавлен PR workflow без публикации сайта; результатов CI/реального браузерного inference на момент изменений нет.

## Диагностика загрузки Turbo, 26.11.2026
- Ошибка `Module.MountedFiles is not available` при создании ONNX-сессии означает обращение к внешнему файлу весов `encoder_model.onnx_data`. Предыдущие переходы fp32→q4 НЕ подтвердили реальную совместимость на Mac 8 GB.
- В опубликованном preview добавлены версии URL скрипта `app.js` и `asr-worker.js` для исключения старого кэша и вывод фактического типа весов + номера сборки. Без реального inference модель НЕ считать исправленной.
- Попытка Pages deploy run 45702647168: JS-тесты PASS, этап deploy API дважды FAIL из-за отсутствия обнаруженного артефакта; инициирован новый полноценный запуск.

## Preview 0.8 (ветка feature/quality-v08-dual-asr)
Добавлены выборочная проверка второй моделью, отображение вариантов и экспорт JSON, восстановление вариантов из checkpoint v2 и регрессионные тесты. CI и реальный inference пока не подтверждены. Предыдущий preview 0.7 опубликован коммитом 9d6ebf1, Actions 45844997861 success.

## Preview 0.9
CI 0.8 подтверждён: run 45860476153. Добавлен адаптер GigaAM, preflight списка файлов, выбор модели, тесты контракта с заглушкой, обновлена контрольная пара Medium/Turbo Russian. Реальный inference и лицензии весов требуют проверки; публикация не подтверждена.

## 1.0 integration batch 1
0.9 Pages confirmed success 45890271627; user confirmed real GigaAM RNNT transcript. Separate preview-v10: restricted model registry/menu, explicit E2E artifacts, Diarization-JS experimental adapter and attribution. Not yet verified real E2E/diarization, browser memory, boundary/word alignment or ROVER. No publication in this batch.

Batch 2: native GigaAM word timestamps when text reconstruction matches; Whisper word timestamp request; string speaker IDs; conservative exact single-word seam fix adapted from GigaAMGUI (MIT notice); five contract tests and syntax checks. Overlapped word alignment, contextual reread and ROVER remain outstanding. No real inference verification.

Batch 3: DP word alignment and conservative third-model consensus suggestions, contextual reread (separate text), model identifier export, diarization UI lock, Pages staging only current 1.0 and previous 0.9. Not full NIST ROVER port or independent acoustic alignment. CI and real inference pending. Prior batch CI 45906664422 PASS.

Batch 4: native word timestamps retained across overlapping windows when exact text reconstruction succeeds; real Chromium smoke CI added for synthetic Russian speech (three GigaAM variants and Diarization-JS). No real accuracy claim, no medical data used. Batch 3 CI 45908176378 PASS. Publication gated on real browser smoke result.

## 1.0 browser smoke result
Run 45908684759 SUCCESS: all three GigaAM engines returned Russian text and native timing; Diarization-JS returned valid intervals. However synthetic 8.4s audio was severely under-transcribed (3/1/1 words); both synthetic voices clustered as one. This is runtime smoke only, NOT accuracy or speaker separation validation. Publish experimental build for comparative testing per user instruction. Full forced alignment and full ROVER remain unimplemented; only conservative native timing and DP consensus implemented. No identifiable medical data.

## Independent CTC alignment
Added real CTC emission Viterbi alignment worker using plain GigaAM v3 CTC only as internal aligner; no selectable ASR model added. Transcript retained verbatim; unknown vocabulary, low acoustic posterior, impossible paths rejected. Native times retained on rejection; checkpoint records source. Synthetic DP tests added; browser runtime and accuracy not yet verified.

ROVER: progressive word-transition network with null votes, insertion/deletion/substitution proposals, primary retained on ties; no silent edits. Browser CTC rejected reference phrase in run 45910891450; added diagnostic greedy output, no lowering confidence thresholds. Verify real alignment before release.

Alignment diagnostic run 45911251628: real CTC returned readable greedy transcript containing target phrase; forced alignment rejected it. Corrected leading separator handling and free outer acoustic context while retaining posterior gates. Added positive/negative runtime controls and edge tests; verification pending.

## Alignment and ROVER integration gate passed
CI 45912428826 SUCCESS; Chromium 45912428878 SUCCESS. Real CTC positive control: «добрый» 0.040–0.360 s, «день» 0.400–0.720 s. Negative unrelated phrase rejected. ROVER insertion/deletion/substitution/tie regression tests passed. This confirms runtime and limited synthetic controls, not long-recording accuracy or clinical readiness. Release for comparative testing.

## 1.1 benchmark implementation
Sequential comparison, common PCM, per-model load/inference/wall time, partial export, reuse same-window results for independent review and ROVER, CTC and diarization. Reference scoring requires matching segment boundary; no reference means no accuracy score. CI and actual browser validation pending. No measured speedup yet.

## 1.1.1 recovery fix
1.1 deployed successfully (46006347530; browser 46004198898 all five runtime passes, synthetic speech accuracy not verified). User reported lost progress after tab closed. Added local IndexedDB checkpoints after every recognized fragment and model, restore on page load, SHA-256 same-file gate, resume incomplete model, explicit deletion and JSON fallback. No audio stored. Old 1.1 in-memory state cannot be recovered after reload. Tests pending.

Recovery test: actual first model, reload, reject wrong file, continue second model, assert first result unchanged, reload again. Added Web Locks to prevent competing benchmark tabs where supported; completed CTC spans are reused. Browser checks pending.

Recovery validation: browser 46032441438 PASS real model -> reload -> wrong-file rejection -> second model -> reload; full browser 46032441195 and regression 46032441199 SUCCESS. PR 8 merged 8089674. Added separate parallel public-dialogue benchmark (37 s excerpt, five isolated GitHub jobs; no real patient audio), not a change to local ASR architecture. Results pending. No claim of speedup or clinical accuracy.

1.2 implementation batch: PR9 merged, run 46056547942 success. Implemented separate 1.2 preview; real runtime and performance tests pending. No claim of WebGPU, neural punctuation, clinical accuracy or speed target reached.

28.11.2026: PR10 merged 4cd6736; regression 46141952123 and real browser 46141952183 passed, including reload recovery, 37 s public dialogue, 2 fragments, 1 reviewed, 5 speaker intervals. Pages 46143990053 attempts 1/2 failed on missing/duplicate artifact metadata. Fix: unique attempt artifact name and wait for API visibility. Publication pending; no application code changed.
