/** Main → renderer event channels. Invoke channels are `<namespace>:<method>` (see shared/api.ts). */
export const EVT = {
  settings: 'evt:settings',
  dictationState: 'evt:dictation-state',
  dictationResult: 'evt:dictation-result',
  dictationLevel: 'evt:dictation-level',
  editorInsert: 'evt:editor-insert',
  editorCommand: 'evt:editor-command',
  modelProgress: 'evt:model-progress',
  navigate: 'evt:navigate',
  flushRequest: 'evt:flush-request',
  recorderCommand: 'evt:recorder-command',
  updateState: 'evt:update-state'
} as const

/** Renderer → main fire-and-forget channels. */
export const SEND = {
  editorFocus: 'send:editor-focus',
  recorderLevel: 'send:recorder-level',
  recorderError: 'send:recorder-error',
  recorderReady: 'send:recorder-ready',
  recorderCancel: 'send:recorder-cancel',
  flushDone: 'send:flush-done'
} as const
