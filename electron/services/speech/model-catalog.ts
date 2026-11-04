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
  /** Trained for one language: used for it instead of the general model (when enabled). */
  language?: string
  /** Full download URL (default: the ggerganov/whisper.cpp repository on Hugging Face). */
  url?: string
  /** Pinned SHA-256 of the file (for models not published with a checksum). */
  sha256?: string
  /** Where the model comes from, shown in the model list. */
  source?: string
  /** Writes lower case without punctuation: phrases are capitalised and closed with a full stop. */
  plainText?: boolean
  /** Needs Whisper's full 30 s audio window (fine-tuned models degrade with the 10 s speed window). */
  fullAudioContext?: boolean
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
  { id: 'large-v3', file: 'ggml-large-v3.bin', label: 'Large v3', approxSizeMb: 3095, multilingual: true, speed: 1, quality: 5 },
  // Language models: used automatically for their language (Settings → Recognition → Language models).
  {
    id: 'tajik-small-q5_1',
    file: 'ggml-tajik-small-q5_1.bin',
    label: 'Tajik · Тоҷикӣ',
    approxSizeMb: 190,
    multilingual: false,
    speed: 4,
    quality: 5,
    language: 'tg',
    // Whisper Small fine-tuned for Tajik (abduaziz/whisper-small-tajik, Apache-2.0), converted to
    // ggml and quantised to q5_1. FLEURS Tajik dev, 40 clips: 8.8% WER, 100% Cyrillic
    // (Large v3 Turbo: 102% WER, 28% Cyrillic).
    url: 'https://github.com/imomzoda-dev/VoiceFlowAI/releases/download/models-1/ggml-tajik-small-q5_1.bin',
    sha256: '4052aa37f4479c5230530b8ba2a57fb187cffe14cbd024c0bbdbed573fb46fd5',
    source: 'abduaziz/whisper-small-tajik · Apache-2.0',
    plainText: true,
    fullAudioContext: true
  },
  {
    id: 'persian-turbo-q5_0',
    file: 'ggml-persian-turbo-q5_0.bin',
    label: 'Persian · فارسی',
    approxSizeMb: 574,
    multilingual: false,
    speed: 3,
    quality: 5,
    language: 'fa',
    // Whisper Large v3 Turbo fine-tuned for Persian on ~236 h incl. conversational speech
    // (givia/whisper-large-v3-turbo-persian, CC BY 4.0), quantised to q5_0. FLEURS Persian dev,
    // 40 phrases ≤ 10 s: 6.7% WER (Large v3 Turbo with a Persian prompt: 20.5%). Writes punctuation.
    url: 'https://github.com/imomzoda-dev/VoiceFlowAI/releases/download/models-1/ggml-persian-turbo-q5_0.bin',
    sha256: 'd832fe5cd81c756bc1962765cff4a33cacde00a7701809837875245870b6d5a8',
    source: 'givia/whisper-large-v3-turbo-persian · CC BY 4.0'
  }
]

/** Installed-or-not aside, the model trained for `language`, if the catalogue has one. */
export function languageModelFor(language: string): CatalogModel | undefined {
  return WHISPER_MODELS.find((m) => m.language === language)
}

export function catalogModel(id: string): CatalogModel | undefined {
  return WHISPER_MODELS.find((m) => m.id === id)
}
