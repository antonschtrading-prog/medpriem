// Russian-language ASR candidates. Experiments must be judged on real audio.
export const ASR_MODELS = Object.freeze({
  gigaam: { id: 'istupakov/gigaam-v3-onnx', label: 'GigaAM v3 RNNT · русский · экспериментально', family: 'gigaam', tier: 'high', experimental: true },
  gigaam_e2e_rnnt: {id:'istupakov/gigaam-v3-onnx',label:'GigaAM v3 E2E RNNT',family:'gigaam',tier:'high',experimental:true},
  gigaam_e2e_ctc: {id:'istupakov/gigaam-v3-onnx',label:'GigaAM v3 E2E CTC',family:'gigaam',tier:'high',experimental:true},
  medium: { id: 'onnx-community/whisper-medium_timestamped', label: 'Whisper Medium · экспериментально', family: 'whisper', tier: 'extreme', experimental: true },
  turbo_ru: { id: 'onnx-community/whisper-large-v3-turbo-russian-ONNX', label: 'Whisper Large V3 Turbo Russian · экспериментально', family: 'whisper', tier: 'extreme', experimental: true },
});
export function resolveModel(key) {
  if (!Object.prototype.hasOwnProperty.call(ASR_MODELS, key)) throw new Error('Неподдерживаемая модель.');
  return ASR_MODELS[key];
}
