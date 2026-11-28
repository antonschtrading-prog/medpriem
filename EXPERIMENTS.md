# Experiments
- 1.1 local 12:21 dialogue: 4/5 completed; RNNT ~19 min, E2E RNNT ~42 min, E2E CTC ~11 min, Medium ~78 min, Turbo ~87 min incomplete. Overall ~5h09m. Full CTC alignment ~53 min, accepted 10/28. Diarization ~19 min. Prior conversation analysis, not a clinical benchmark.
- GitHub 46056547942: verified identical 37s excerpt, all five completed; RNNT 22.96s, E2E RNNT 21.30s, E2E CTC 20.91s, Medium 130.95s, Turbo 524.63s. No verified accuracy reference for this excerpt. Do not extrapolate runner speed to mobile.
- 1.1.1 recovery verified 46032441438. Prior 1.1 lost memory on reload.
- 1.2 candidate: bounded review 25%, no blanket CTC alignment, preserve numbers, native times, conservative overlap, minimal case/terminal punctuation; not neural punctuation. WASM adaptive threads only where cross-origin isolation allows; WebGPU not enabled without proven compatibility. No measured improvement yet.

- 1.2 recovery browser 46141952183 PASS: 37s, 2 fragments, 1 reviewed, 5 turns, reported preparation .748s, ASR 8.445s (only resumed processing), review 7.956s, diarization 19.711s. Not full elapsed time, not DER. First browser test raced against UI completion; fixed wait condition in 35291e2. Pages failures separate from app. New uninterrupted Chromium/WebKit profile added.

- Chromium uninterrupted baseline 140979190269: 61.173s total / 37s audio, RTF 1.653. Diarization 26.583s. Test batch sizes 1/2/4/8 with repeat baseline; output agreement is not reference accuracy. Production unchanged.

28.11.2026: Pages 46144975791 SUCCESS. Cross-browser profile 46145722121 SUCCESS Chromium/WebKit; WebKit 116.645s for 37s input, RTF 3.153, ASR 36.811s, review 26.393s, diarization 52.560s, 2/2 timed rows, 2 speakers, 5 intervals, observed external writes 0. Transcript and intervals match first Chromium run. Not actual iPhone validation. Diarization batch comparison 46145722192 SUCCESS: wall 20.002/19.945/20.919/22.709/19.684s (batch 1/2/4/8/repeat 1), all identical intervals. No meaningful benefit; retain batch 1. No reference DER or memory measurement. Next investigate safe device-adaptive WASM threading and lighter diarization candidate, independent punctuation with lexical invariance. Do not repeat batch experiment without new backend or evidence.

1.3 lab: isolated HTTP header experiment, same-source threads and contention, GPU capability probe. No performance results yet. Separate from production.

Chromium 140986144794: 2 threads improves diarization vs 1 on 4-core runner; 4 threads worse than 2. Concurrent 2 vs sequential 2 (partial ASR only) ~19.48 vs 23.42s. No full end-to-end or memory proof. GPU unavailable. SW scoped smoke introduced.

Added experimental cache eligibility policy (pinned public model GET only, no persistent cache yet), parallel eligibility policy (explicit opt-in, known >=8 GB, >=4 cores, isolated; no default concurrent engines), extended 180 s public dialogue workflow manual dispatch. Need measured cold/warm fetch and browser memory before enabling cache or parallel. 180 s is intermediate stress test, not hour-long validation. Chromium full candidate previously 41.661s vs 61.173s baseline; WebKit startup race fix pending. No new speed claim.
