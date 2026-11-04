/**
 * Minimal, explicit bridge between the sandboxed renderer and the main process.
 * No Node APIs, no generic `invoke(channel)` escape hatch: every method is listed here.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { VoiceFlowApi, RecorderCommand } from '../../shared/api'
import { EVT, SEND } from '../../shared/channels'

const inv =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: VoiceFlowApi = {
  settings: {
    get: inv('settings:get') as VoiceFlowApi['settings']['get'],
    update: inv('settings:update') as VoiceFlowApi['settings']['update'],
    onChange: (cb) => on(EVT.settings, cb)
  },
  documents: {
    list: inv('documents:list') as VoiceFlowApi['documents']['list'],
    get: inv('documents:get') as VoiceFlowApi['documents']['get'],
    create: inv('documents:create') as VoiceFlowApi['documents']['create'],
    update: inv('documents:update') as VoiceFlowApi['documents']['update'],
    duplicate: inv('documents:duplicate') as VoiceFlowApi['documents']['duplicate'],
    move: inv('documents:move') as VoiceFlowApi['documents']['move'],
    setFavorite: inv('documents:setFavorite') as VoiceFlowApi['documents']['setFavorite'],
    trash: inv('documents:trash') as VoiceFlowApi['documents']['trash'],
    restore: inv('documents:restore') as VoiceFlowApi['documents']['restore'],
    deleteForever: inv('documents:deleteForever') as VoiceFlowApi['documents']['deleteForever'],
    emptyTrash: inv('documents:emptyTrash') as VoiceFlowApi['documents']['emptyTrash'],
    markOpened: inv('documents:markOpened') as VoiceFlowApi['documents']['markOpened'],
    snapshot: inv('documents:snapshot') as VoiceFlowApi['documents']['snapshot'],
    versions: inv('documents:versions') as VoiceFlowApi['documents']['versions'],
    versionContent: inv('documents:versionContent') as VoiceFlowApi['documents']['versionContent'],
    restoreVersion: inv('documents:restoreVersion') as VoiceFlowApi['documents']['restoreVersion']
  },
  folders: {
    list: inv('folders:list') as VoiceFlowApi['folders']['list'],
    create: inv('folders:create') as VoiceFlowApi['folders']['create'],
    rename: inv('folders:rename') as VoiceFlowApi['folders']['rename'],
    remove: inv('folders:remove') as VoiceFlowApi['folders']['remove']
  },
  files: {
    exportDocument: inv('files:exportDocument') as VoiceFlowApi['files']['exportDocument'],
    importDocument: inv('files:importDocument') as VoiceFlowApi['files']['importDocument'],
    pickImage: inv('files:pickImage') as VoiceFlowApi['files']['pickImage']
  },
  history: {
    list: inv('history:list') as VoiceFlowApi['history']['list'],
    remove: inv('history:remove') as VoiceFlowApi['history']['remove'],
    clear: inv('history:clear') as VoiceFlowApi['history']['clear'],
    export: inv('history:export') as VoiceFlowApi['history']['export'],
    deleteAudio: inv('history:deleteAudio') as VoiceFlowApi['history']['deleteAudio']
  },
  dictionary: {
    list: inv('dictionary:list') as VoiceFlowApi['dictionary']['list'],
    upsert: inv('dictionary:upsert') as VoiceFlowApi['dictionary']['upsert'],
    remove: inv('dictionary:remove') as VoiceFlowApi['dictionary']['remove']
  },
  templates: {
    list: inv('templates:list') as VoiceFlowApi['templates']['list'],
    create: inv('templates:create') as VoiceFlowApi['templates']['create'],
    update: inv('templates:update') as VoiceFlowApi['templates']['update'],
    remove: inv('templates:remove') as VoiceFlowApi['templates']['remove']
  },
  providers: {
    list: inv('providers:list') as VoiceFlowApi['providers']['list'],
    upsert: inv('providers:upsert') as VoiceFlowApi['providers']['upsert'],
    remove: inv('providers:remove') as VoiceFlowApi['providers']['remove'],
    test: inv('providers:test') as VoiceFlowApi['providers']['test']
  },
  models: {
    catalog: inv('models:catalog') as VoiceFlowApi['models']['catalog'],
    download: inv('models:download') as VoiceFlowApi['models']['download'],
    cancel: inv('models:cancel') as VoiceFlowApi['models']['cancel'],
    remove: inv('models:remove') as VoiceFlowApi['models']['remove'],
    onProgress: (cb) => on(EVT.modelProgress, cb),
    binaryStatus: inv('models:binaryStatus') as VoiceFlowApi['models']['binaryStatus'],
    installBinary: inv('models:installBinary') as VoiceFlowApi['models']['installBinary'],
    chooseBinary: inv('models:chooseBinary') as VoiceFlowApi['models']['chooseBinary'],
    openFolder: inv('models:openFolder') as VoiceFlowApi['models']['openFolder']
  },
  dictation: {
    start: inv('dictation:start') as VoiceFlowApi['dictation']['start'],
    stop: inv('dictation:stop') as VoiceFlowApi['dictation']['stop'],
    cancel: inv('dictation:cancel') as VoiceFlowApi['dictation']['cancel'],
    toggle: inv('dictation:toggle') as VoiceFlowApi['dictation']['toggle'],
    state: inv('dictation:state') as VoiceFlowApi['dictation']['state'],
    pick: inv('dictation:pick') as VoiceFlowApi['dictation']['pick'],
    pasteLast: inv('dictation:pasteLast') as VoiceFlowApi['dictation']['pasteLast'],
    reprocess: inv('dictation:reprocess') as VoiceFlowApi['dictation']['reprocess'],
    onState: (cb) => on(EVT.dictationState, cb),
    onResult: (cb) => on(EVT.dictationResult, cb),
    onLevel: (cb) => on(EVT.dictationLevel, cb),
    onEditorInsert: (cb) => on(EVT.editorInsert, cb),
    onEditorCommand: (cb) => on(EVT.editorCommand, cb),
    setEditorFocus: (focused) => ipcRenderer.send(SEND.editorFocus, Boolean(focused))
  },
  ai: {
    assistant: inv('ai:assistant') as VoiceFlowApi['ai']['assistant'],
    correct: inv('ai:correct') as VoiceFlowApi['ai']['correct']
  },
  hotkeys: {
    status: inv('hotkeys:status') as VoiceFlowApi['hotkeys']['status'],
    suspend: inv('hotkeys:suspend') as VoiceFlowApi['hotkeys']['suspend'],
    checkBinding: inv('hotkeys:checkBinding') as VoiceFlowApi['hotkeys']['checkBinding']
  },
  system: {
    info: inv('system:info') as VoiceFlowApi['system']['info'],
    permissions: inv('system:permissions') as VoiceFlowApi['system']['permissions'],
    requestPermission: inv('system:requestPermission') as VoiceFlowApi['system']['requestPermission'],
    openPermissionSettings: inv('system:openPermissionSettings') as VoiceFlowApi['system']['openPermissionSettings'],
    openLogs: inv('system:openLogs') as VoiceFlowApi['system']['openLogs'],
    openExternal: inv('system:openExternal') as VoiceFlowApi['system']['openExternal'],
    showMainWindow: inv('system:showMainWindow') as VoiceFlowApi['system']['showMainWindow'],
    clearAllData: inv('system:clearAllData') as VoiceFlowApi['system']['clearAllData'],
    stats: inv('system:stats') as VoiceFlowApi['system']['stats'],
    onNavigate: (cb) => on(EVT.navigate, cb),
    onFlushRequest: (cb) =>
      on<string>(EVT.flushRequest, async (token) => {
        try {
          await cb()
        } finally {
          ipcRenderer.send(SEND.flushDone, token)
        }
      })
  },
  updates: {
    get: inv('updates:get') as VoiceFlowApi['updates']['get'],
    check: inv('updates:check') as VoiceFlowApi['updates']['check'],
    download: inv('updates:download') as VoiceFlowApi['updates']['download'],
    cancel: inv('updates:cancel') as VoiceFlowApi['updates']['cancel'],
    install: inv('updates:install') as VoiceFlowApi['updates']['install'],
    notes: inv('updates:notes') as VoiceFlowApi['updates']['notes'],
    onState: (cb) => on(EVT.updateState, cb)
  },
  backup: {
    create: inv('backup:create') as VoiceFlowApi['backup']['create'],
    restore: inv('backup:restore') as VoiceFlowApi['backup']['restore'],
    list: inv('backup:list') as VoiceFlowApi['backup']['list'],
    chooseDirectory: inv('backup:chooseDirectory') as VoiceFlowApi['backup']['chooseDirectory'],
    exportSettings: inv('backup:exportSettings') as VoiceFlowApi['backup']['exportSettings']
  },
  recorder: {
    onCommand: (cb) => on<RecorderCommand>(EVT.recorderCommand, cb),
    submit: inv('recorder:submit') as VoiceFlowApi['recorder']['submit'],
    reportError: (sessionId, code, message) => ipcRenderer.send(SEND.recorderError, { sessionId, code, message }),
    reportLevel: (level) => ipcRenderer.send(SEND.recorderLevel, level),
    reportReady: (sessionId) => ipcRenderer.send(SEND.recorderReady, sessionId),
    cancelFromWidget: () => ipcRenderer.send(SEND.recorderCancel)
  }
}

contextBridge.exposeInMainWorld('voiceflow', api)
