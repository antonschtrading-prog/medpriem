# Утверждённые решения
1. Основное приложение — браузерный сайт GitHub Pages, без Xcode и без серверного платного ASR.
2. Приоритет — точность русского языка и медицинских чисел, а не максимальная скорость.
3. Сравнение моделей только на одинаковых аудиозаписях и с эталонным текстом для объективного WER/CER.
4. Подозрительные ASR-выходы не заменять выдуманным «исправленным» текстом. Отмечать интервал для прослушивания.
5. Диаризация врача и пациента пока не подтверждена и не имитируется.
6. GigaAM v3 остаётся кандидатом на отдельный движок, пока нет проверенной реализации прямо в Safari.

7. По решению 25.11.2026 приоритет разделению говорящих повышен до текущего цикла. Ручная разметка допустима только как промежуточный тестовый инструмент, автоматическую диаризацию нельзя имитировать.
8. В основном сценарии врач получает один результат, ручной выбор интервала и сравнение моделей не навязываются; резервная модель рассматривается для автоматической проверки подозрительных участков.

9. В экспериментах допускается Sherpa-ONNX WASM как независимый браузерный движок автоматической диаризации, только после проверки библиотек, сетевого поведения и лицензий. Согласованная целевая функция — точное автоматическое разделение реплик, а не разметка 25-секундных кусков.

10. GigaAM допускается как экспериментальный браузерный движок; Medium/Turbo Russian — контрольная пара, GigaAM — независимый кандидат. Смена основной модели только после сравнения по исходному звуку.

11. Approved 1.0: retain five candidates only; reuse upstream open-source code where possible, keep 0.9 rollback, no publication until integration checks. No invented timing or automatic replacement of critical facts.

12. Publish only current and previous preview; keep old source in Git history/test fixtures, not on Pages. Consensus suggestions never overwrite clinical facts.

13. Approved 1.1: benchmark separate from normal workflow; run all five sequentially, compare same audio; keep 1.0 rollback. No automatic clinical corrections; E2E RNNT default benchmark candidate only, not final production selection.

14. 1.1.1: preserve benchmark progress locally after each fragment, require exact source hash on resume, explicit user deletion. No automatic upload or retention of audio.

15. 1.2 approved: one-click cross-platform workflow, no specific hardware requirement. Primary RNNT and selective E2E RNNT verification; no automatic critical fact substitutions. Keep 1.1.1 rollback and experimental benchmark; hybrid research separate. Review cap 25% is experimental and may miss errors, deferred cues shown.
