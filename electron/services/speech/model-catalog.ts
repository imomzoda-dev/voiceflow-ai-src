/** whisper.cpp ggml models published at huggingface.co/ggerganov/whisper.cpp. */
export interface CatalogModel {
  id: string
  file: string
  label: string
  approxSizeMb: number
  multilingual: boolean
  speed: 1 | 2 | 3 | 4 | 5
  quality: 1 | 2 | 3 | 4 | 5
  recommended?: boolean
}

export const WHISPER_MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/'

export const WHISPER_MODELS: CatalogModel[] = [
  { id: 'tiny', file: 'ggml-tiny.bin', label: 'Tiny', approxSizeMb: 75, multilingual: true, speed: 5, quality: 1 },
  { id: 'base', file: 'ggml-base.bin', label: 'Base', approxSizeMb: 142, multilingual: true, speed: 5, quality: 2 },
  { id: 'small', file: 'ggml-small.bin', label: 'Small', approxSizeMb: 466, multilingual: true, speed: 4, quality: 3 },
  { id: 'small-q5_1', file: 'ggml-small-q5_1.bin', label: 'Small (quantised)', approxSizeMb: 181, multilingual: true, speed: 4, quality: 3 },
  { id: 'medium-q5_0', file: 'ggml-medium-q5_0.bin', label: 'Medium (quantised)', approxSizeMb: 514, multilingual: true, speed: 3, quality: 4 },
  { id: 'medium', file: 'ggml-medium.bin', label: 'Medium', approxSizeMb: 1533, multilingual: true, speed: 2, quality: 4 },
  { id: 'large-v3-turbo-q5_0', file: 'ggml-large-v3-turbo-q5_0.bin', label: 'Large v3 Turbo (quantised)', approxSizeMb: 547, multilingual: true, speed: 3, quality: 5, recommended: true },
  { id: 'large-v3-turbo', file: 'ggml-large-v3-turbo.bin', label: 'Large v3 Turbo', approxSizeMb: 1624, multilingual: true, speed: 3, quality: 5 },
  { id: 'large-v3', file: 'ggml-large-v3.bin', label: 'Large v3', approxSizeMb: 3095, multilingual: true, speed: 1, quality: 5 }
]

export function catalogModel(id: string): CatalogModel | undefined {
  return WHISPER_MODELS.find((m) => m.id === id)
}
