// Approved multilingual ASR candidates, no English-only model.
export const ASR_MODELS = Object.freeze({
  tiny: { id: 'onnx-community/whisper-tiny', label: 'Tiny · тест скорости', tier: 'low' },
  base: { id: 'onnx-community/whisper-base', label: 'Base · точнее, больше памяти', tier: 'medium' },
  small: { id: 'onnx-community/whisper-small', label: 'Small · только при запасе памяти', tier: 'high' },
});
export function resolveModel(key) {
  if (!Object.prototype.hasOwnProperty.call(ASR_MODELS, key)) throw new Error('Неподдерживаемая модель.');
  return ASR_MODELS[key];
}
