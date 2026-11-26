// Russian-language ASR candidates. Experiments must be judged on real audio.
export const ASR_MODELS = Object.freeze({
  gigaam: { id: 'istupakov/gigaam-v3-onnx', label: 'GigaAM v3 RNNT · русский · экспериментально', family: 'gigaam', tier: 'high', experimental: true },
  tiny: { id: 'onnx-community/whisper-tiny', label: 'Whisper Tiny', family: 'whisper', tier: 'low' },
  base: { id: 'onnx-community/whisper-base', label: 'Whisper Base', family: 'whisper', tier: 'medium' },
  small: { id: 'onnx-community/whisper-small', label: 'Whisper Small', family: 'whisper', tier: 'high' },
  medium: { id: 'onnx-community/whisper-medium_timestamped', label: 'Whisper Medium · экспериментально', family: 'whisper', tier: 'extreme', experimental: true },
  turbo: { id: 'onnx-community/whisper-large-v3-turbo', label: 'Whisper Large V3 Turbo · экспериментально', family: 'whisper', tier: 'extreme', experimental: true },
  turbo_ru: { id: 'onnx-community/whisper-large-v3-turbo-russian-ONNX', label: 'Whisper Large V3 Turbo Russian · экспериментально', family: 'whisper', tier: 'extreme', experimental: true },
  xlsr_ru: { id: 'onnx-community/wav2vec2-large-xlsr-53-russian-ONNX', label: 'Wav2Vec2 XLSR · русский · экспериментально', family: 'ctc', tier: 'high', experimental: true },
});
export function resolveModel(key) {
  if (!Object.prototype.hasOwnProperty.call(ASR_MODELS, key)) throw new Error('Неподдерживаемая модель.');
  return ASR_MODELS[key];
}
