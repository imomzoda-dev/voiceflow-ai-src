import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Download, Upload, FileJson, Trash2, RefreshCw, AlertTriangle, ExternalLink, Volume2, PanelTop, AudioLines, AppWindow, Archive, Bell, CalendarClock, CirclePause, CircleX, Clipboard, ClipboardPaste, Cloud, Cpu, FileText, Gauge, Globe, Hand, History, Languages, LifeBuoy, MessageSquareText, Mic, Moon, Palette, PanelBottomClose, Plug, Power, Repeat, Rows3, ShieldCheck, Sparkles, Timer } from 'lucide-react'
import type { BackupInfo, HotkeyStatus, ProviderRecord, SystemInfo } from '@shared/types'
import { APP_CONFIG } from '@shared/app-config'
import { useUpdates, WhatsNewDialog } from '@/components/common/UpdateCard'
import type { HotkeyAction } from '@shared/hotkeys'
import { LANGUAGES } from '@shared/languages'
import { useSettings, toast } from '@/stores'
import { api, errorMessage, formatBytes, formatDateTime } from '@/lib/utils'
import { Card, Badge, Group, IconTile } from '@/components/ui/misc'
import { Field, Input, Segmented, Select, Slider, Switch, Textarea } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { MicTest } from '@/components/voice/MicTest'
import { HotkeyRecorder } from '@/components/voice/HotkeyRecorder'
import { ModelManager } from '@/components/voice/ModelManager'
import { ProvidersManager } from '@/components/common/ProvidersManager'

function useS() {
  const settings = useSettings((s) => s.settings)!
  const update = useSettings((s) => s.update)
  return { s: settings, update }
}

/* ------------------------------------ General ------------------------------------ */

export function GeneralSection() {
  const { t } = useTranslation()
  const { s, update } = useS()
  return (
    <>
      <Group>
        <Field inline icon={<IconTile icon={Globe} color="blue" />} label={t('settings.general.language')}>
          <Segmented value={s.general.uiLanguage} onChange={(v) => void update('general', { uiLanguage: v })} options={[{ value: 'en', label: 'English' }, { value: 'ru', label: 'Русский' }, { value: 'tg', label: 'Тоҷикӣ' }]} />
        </Field>
        <Field inline icon={<IconTile icon={Power} color="green" />} label={t('settings.general.launchAtLogin')} hint={t('settings.general.launchAtLoginHint')}>
          <Switch checked={s.general.launchAtLogin} onCheckedChange={(v) => void update('general', { launchAtLogin: v })} />
        </Field>
        <Field inline icon={<IconTile icon={PanelBottomClose} color="gray" />} label={t('settings.general.startMinimized')}>
          <Switch checked={s.general.startMinimized} onCheckedChange={(v) => void update('general', { startMinimized: v })} />
        </Field>
        <Field inline icon={<IconTile icon={AppWindow} color="orange" />} label={t('settings.general.closeBehavior')}>
          <Select value={s.general.closeBehavior} onChange={(v) => void update('general', { closeBehavior: v as 'tray' | 'quit' })} options={[{ value: 'tray', label: t('settings.general.closeTray') }, { value: 'quit', label: t('settings.general.closeQuit') }]} />
        </Field>
        <Field inline icon={<IconTile icon={Bell} color="red" />} label={t('settings.general.notifications')} hint={t('settings.general.notificationsHint')}>
          <Switch checked={s.general.notifications} onCheckedChange={(v) => void update('general', { notifications: v })} />
        </Field>
      </Group>
    </>
  )
}

/* ----------------------------------- Appearance ----------------------------------- */

export function AppearanceSection() {
  const { t } = useTranslation()
  const { s, update } = useS()
  const a = s.appearance
  return (
    <Group>
      <Field inline icon={<IconTile icon={Moon} color="indigo" />} label={t('settings.appearance.theme')}>
        <Segmented value={a.theme} onChange={(v) => void update('appearance', { theme: v })} options={(['light', 'dark', 'system'] as const).map((v) => ({ value: v, label: t(`settings.appearance.${v}`) }))} />
      </Field>
      <Field inline icon={<IconTile icon={Palette} color="pink" />} label={t('settings.appearance.accent')}>
        <div className="flex gap-2">
          {(
            [
              ['blue', '#007aff'],
              ['violet', '#5856d6'],
              ['pink', '#ff2d55'],
              ['orange', '#ff9500'],
              ['green', '#34c759'],
              ['graphite', '#8e8e93']
            ] as const
          ).map(([id, color]) => (
            <button key={id} onClick={() => void update('appearance', { accent: id })} title={t(`settings.appearance.${id}`)} aria-label={t(`settings.appearance.${id}`)} className="h-7 w-7 rounded-full ring-offset-2 ring-offset-[var(--surface)] transition" style={{ background: color, boxShadow: a.accent === id ? `0 0 0 2px var(--surface), 0 0 0 4px ${color}` : undefined }} />
          ))}
        </div>
      </Field>
      <Field inline icon={<IconTile icon={Rows3} color="gray" />} label={t('settings.appearance.compact')}>
        <Switch checked={a.compact} onCheckedChange={(v) => void update('appearance', { compact: v })} />
      </Field>
      <Field inline icon={<IconTile icon={Sparkles} color="purple" />} label={t('settings.appearance.motion')}>
        <Segmented value={a.motion} onChange={(v) => void update('appearance', { motion: v })} options={[{ value: 'system', label: t('settings.appearance.motionSystem') }, { value: 'full', label: t('settings.appearance.motionFull') }, { value: 'reduced', label: t('settings.appearance.motionReduced') }]} />
      </Field>
    </Group>
  )
}

/* -------------------------------------- Voice -------------------------------------- */

export function VoiceSection() {
  const { t } = useTranslation()
  const { s, update } = useS()
  const v = s.voice
  const hk = v.hotkeys
  const setKey = (action: HotkeyAction) => (b: typeof hk.dictate | null) => {
    if (action === 'dictate' && !b) return
    void update('voice', { hotkeys: { ...hk, [action]: b } })
  }
  const others = (action: HotkeyAction) => (Object.keys(hk) as HotkeyAction[]).filter((k) => k !== action).map((k) => hk[k])
  const [status, setStatus] = useState<HotkeyStatus | null>(null)
  useEffect(() => void api().hotkeys.status().then(setStatus), [v])
  const conflictOf = (action: HotkeyAction) => {
    const c = status?.registrations.find((r) => r.action === action)?.conflict
    if (!c) return null
    return c === 'in-use' ? t('settings.voice.conflictInUseActive') : c.startsWith('system:') ? t('settings.voice.conflictSystem', { name: c.slice(7) }) : null
  }
  return (
    <>
      <Group title={t('settings.voice.microphone')}>
        <div className="py-3">
          <MicTest />
        </div>
        <Field inline label={t('settings.voice.gain')}>
          <div className="flex w-[220px] items-center gap-3">
            <Slider value={v.inputGain} min={0.25} max={4} step={0.25} onChange={(x) => void update('voice', { inputGain: x })} label={t('settings.voice.gain')} />
            <span className="w-10 text-right text-[12px] tabular-nums text-muted">{v.inputGain.toFixed(2)}×</span>
          </div>
        </Field>
      </Group>
      <Group title={t('settings.voice.hotkeys')}>
        <Field inline icon={<IconTile icon={Hand} color="orange" />} label={t('settings.voice.activation')}>
          <Segmented value={v.activationMode} onChange={(m) => void update('voice', { activationMode: m })} options={(['hold', 'toggle', 'manual'] as const).map((m) => ({ value: m, label: t(`activation.${m}`) }))} />
        </Field>
        <Field inline icon={<IconTile icon={Mic} color="red" />} label={t('settings.voice.dictateKey')} hint={conflictOf('dictate') ? <span className="text-warning">{conflictOf('dictate')}</span> : undefined}>
          <HotkeyRecorder value={hk.dictate} onChange={setKey('dictate')} others={others('dictate')} allowClear={false} />
        </Field>
        <Field inline icon={<IconTile icon={CircleX} color="gray" />} label={t('settings.voice.cancelKey')}>
          <HotkeyRecorder value={hk.cancel} onChange={setKey('cancel')} others={others('cancel')} />
        </Field>
        <Field inline icon={<IconTile icon={AppWindow} color="blue" />} label={t('settings.voice.openWindowKey')}>
          <HotkeyRecorder value={hk.openWindow} onChange={setKey('openWindow')} others={others('openWindow')} />
        </Field>
        <Field inline icon={<IconTile icon={ClipboardPaste} color="teal" />} label={t('settings.voice.pasteLastKey')}>
          <HotkeyRecorder value={hk.pasteLast} onChange={setKey('pasteLast')} others={others('pasteLast')} />
        </Field>
        <Field inline icon={<IconTile icon={Repeat} color="purple" />} label={t('settings.voice.cycleModeKey')}>
          <HotkeyRecorder value={hk.cycleMode} onChange={setKey('cycleMode')} others={others('cycleMode')} />
        </Field>
        <Field inline icon={<IconTile icon={ShieldCheck} color="green" />} label={t('settings.voice.suppress')} hint={t('settings.voice.suppressHint')}>
          <Switch checked={v.suppressHotkey} onCheckedChange={(x) => void update('voice', { suppressHotkey: x })} />
        </Field>
      </Group>
      <Group>
        <Field inline icon={<IconTile icon={Timer} color="orange" />} label={t('settings.voice.maxDuration')}>
          <Select value={String(v.maxDurationSec)} onChange={(x) => void update('voice', { maxDurationSec: Number(x) })} options={[30, 60, 120, 300, 600, 900].map((n) => ({ value: String(n), label: n < 60 ? t('common.seconds', { count: n }) : t('common.minutes', { count: n / 60 }) }))} />
        </Field>
        <Field inline icon={<IconTile icon={CirclePause} color="indigo" />} label={t('settings.voice.autoStop')}>
          <Switch checked={v.autoStopOnSilence} onCheckedChange={(x) => void update('voice', { autoStopOnSilence: x })} />
        </Field>
        {v.autoStopOnSilence && (
          <Field inline label={t('settings.voice.silence')}>
            <Select value={String(v.silenceTimeoutSec)} onChange={(x) => void update('voice', { silenceTimeoutSec: Number(x) })} options={[2, 3, 4, 6, 10].map((n) => ({ value: String(n), label: t('common.seconds', { count: n }) }))} />
          </Field>
        )}
        <Field inline label={t('settings.voice.minHold')}>
          <Select value={String(v.minHoldMs)} onChange={(x) => void update('voice', { minHoldMs: Number(x) })} options={[0, 150, 250, 400, 600].map((n) => ({ value: String(n), label: `${n} ms` }))} />
        </Field>
        <Field inline icon={<IconTile icon={MessageSquareText} color="blue" />} label={t('settings.voice.voiceCommands')} hint={t('settings.voice.voiceCommandsHint')}>
          <Switch checked={v.voiceCommands} onCheckedChange={(x) => void update('voice', { voiceCommands: x })} />
        </Field>
        <Field inline label={t('settings.voice.playSounds')} icon={<IconTile icon={Volume2} color="pink" />}>
          <Switch checked={v.playSounds} onCheckedChange={(x) => void update('voice', { playSounds: x })} />
        </Field>
        <Field inline label={t('settings.voice.widgetPosition')} icon={<IconTile icon={PanelTop} color="graphite" />}>
          <Segmented size="sm" value={v.widgetPosition} onChange={(x) => void update('voice', { widgetPosition: x })} options={[{ value: 'top', label: t('settings.voice.widgetTop') }, { value: 'bottom', label: t('settings.voice.widgetBottom') }]} />
        </Field>
        <Field inline icon={<IconTile icon={Clipboard} color="gray" />} label={t('settings.voice.restoreClipboard')}>
          <Switch checked={v.restoreClipboard} onCheckedChange={(x) => void update('voice', { restoreClipboard: x })} />
        </Field>
      </Group>
    </>
  )
}

/* ----------------------------------- Recognition ----------------------------------- */

export function RecognitionSection() {
  const { t } = useTranslation()
  const { s, update } = useS()
  const r = s.recognition
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  useEffect(() => void api().providers.list().then(setProviders), [])
  const speech = providers.filter((p) => p.supportsTranscription)
  const cloudSelected = speech.find((p) => p.id === r.speechProviderId)
  const toggleAllowed = (code: string) => {
    const set = new Set(r.allowedLanguages)
    if (set.has(code)) set.delete(code)
    else set.add(code)
    void update('recognition', { allowedLanguages: [...set] })
  }
  return (
    <>
      <Group>
        <Field inline label={t('settings.recognition.engine')} hint={cloudSelected ? (cloudSelected.isLocal ? undefined : t('settings.recognition.cloudHint', { name: cloudSelected.name })) : t('settings.recognition.localHint')}>
          <Select className="w-[260px]" value={r.speechProviderId} onChange={(v) => void update('recognition', { speechProviderId: v })} options={[{ value: 'whisper-cpp', label: t('settings.recognition.local') }, ...speech.map((p) => ({ value: p.id, label: `${p.name} · ${p.transcriptionModel ?? ''}` }))]} />
        </Field>
        {cloudSelected && !cloudSelected.isLocal && !s.privacy.allowCloud && (
          <div className="flex items-center gap-2 py-3 text-[12.5px] text-warning">
            <AlertTriangle size={14} /> {t('settings.recognition.cloudBlocked')}
            <Button size="sm" variant="soft" className="ml-auto" onClick={() => void update('privacy', { allowCloud: true })}>
              {t('settings.privacy.allowCloud')}
            </Button>
          </div>
        )}
        <Field inline icon={<IconTile icon={Languages} color="blue" />} label={t('settings.recognition.languageMode')}>
          <Select className="w-[260px]" value={r.languageMode} onChange={(v) => void update('recognition', { languageMode: v as typeof r.languageMode })} options={(['auto', 'single', 'multiple'] as const).map((m) => ({ value: m, label: t(`settings.recognition.${m}`) }))} />
        </Field>
        {r.languageMode === 'single' && (
          <Field inline label={t('settings.recognition.language')}>
            <Select value={r.language} onChange={(v) => void update('recognition', { language: v })} options={LANGUAGES.map((l) => ({ value: l.code, label: l.native }))} />
          </Field>
        )}
        {r.languageMode === 'multiple' && (
          <div className="py-3">
            <div className="mb-2 text-[13px] font-medium text-fg">{t('settings.recognition.allowed')}</div>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((l) => {
                const on = r.allowedLanguages.includes(l.code)
                return (
                  <button key={l.code} onClick={() => toggleAllowed(l.code)} className={`rounded-full border px-2.5 py-1 text-[12px] transition ${on ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-fg'}`}>
                    {l.native}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="py-3 text-[12px] leading-relaxed text-muted">{t('settings.recognition.tajikNote')}</div>
      </Group>

      {r.speechProviderId === 'whisper-cpp' && (
        <>
          <Group title={t('settings.recognition.models')}>
            <div className="py-3">
              <ModelManager />
            </div>
          </Group>
          <Group>
            <Field inline icon={<IconTile icon={Gauge} color="orange" />} label={t('settings.recognition.qualityMode')}>
              <Segmented value={r.quality} onChange={(v) => void update('recognition', { quality: v })} options={(['fast', 'balanced', 'accurate'] as const).map((q) => ({ value: q, label: t(`settings.recognition.${q}`) }))} />
            </Field>
            <Field inline label={t('settings.recognition.threads')}>
              <Select value={String(r.threads)} onChange={(v) => void update('recognition', { threads: Number(v) })} options={[0, 2, 4, 6, 8, 12, 16].map((n) => ({ value: String(n), label: n === 0 ? t('settings.recognition.threadsAuto') : String(n) }))} />
            </Field>
            <Field inline icon={<IconTile icon={Cpu} color="green" />} label={t('settings.recognition.gpu')}>
              <Switch checked={r.useGpu} onCheckedChange={(v) => void update('recognition', { useGpu: v })} />
            </Field>
          </Group>
        </>
      )}
    </>
  )
}

/* ------------------------------------ AI Writing ------------------------------------ */

export function WritingSection() {
  const { t } = useTranslation()
  const { s, update } = useS()
  const w = s.writing
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  useEffect(() => void api().providers.list().then(setProviders), [])
  const chat = providers.filter((p) => p.supportsChat)
  const [mode, setMode] = useState<'raw' | 'correct' | 'professional'>('correct')
  return (
    <>
      <Group>
        <div className="py-3">
          <div className="mb-2 text-[13px] font-medium text-fg">{t('settings.writing.mode')}</div>
          <div className="grid grid-cols-3 gap-2">
            {(['raw', 'correct', 'professional'] as const).map((m) => (
              <button key={m} onClick={() => void update('writing', { mode: m })} className={`rounded-[11px] border p-3 text-left transition ${w.mode === m ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2'}`}>
                <div className="text-[13px] font-semibold text-fg">{t(`modes.${m}`)}</div>
                <div className="mt-1 text-[11.5px] leading-snug text-muted">{t(`modes.${m}Hint`)}</div>
              </button>
            ))}
          </div>
        </div>
        <Field inline icon={<IconTile icon={Plug} color="green" />} label={t('settings.writing.provider')} hint={chat.length ? undefined : t('settings.writing.noProviders')}>
          <Select className="w-[240px]" value={w.correctionProviderId ?? '__none'} onChange={(v) => void update('writing', { correctionProviderId: v === '__none' ? null : v })} options={[{ value: '__none', label: t('common.none') }, ...chat.map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        {w.correctionProviderId && (
          <Field inline label={t('settings.writing.model')}>
            <Input key={w.correctionProviderId} className="w-[240px]" defaultValue={w.correctionModel ?? ''} placeholder={chat.find((p) => p.id === w.correctionProviderId)?.chatModel ?? t('settings.writing.modelFromProvider')} onBlur={(e) => void update('writing', { correctionModel: e.target.value.trim() || null })} />
          </Field>
        )}
        <Field inline icon={<IconTile icon={Sparkles} color="purple" />} label={t('settings.writing.assistantProvider')}>
          <Select className="w-[240px]" value={w.assistantProviderId ?? '__same'} onChange={(v) => void update('writing', { assistantProviderId: v === '__same' ? null : v })} options={[{ value: '__same', label: t('settings.writing.sameAsCorrection') }, ...chat.map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        <Field inline icon={<IconTile icon={LifeBuoy} color="orange" />} label={t('settings.writing.fallback')}>
          <Switch checked={w.fallbackToRaw} onCheckedChange={(v) => void update('writing', { fallbackToRaw: v })} />
        </Field>
        <Field inline icon={<IconTile icon={Archive} color="gray" />} label={t('settings.writing.keepOriginal')}>
          <Switch checked={w.keepOriginal} onCheckedChange={(v) => void update('writing', { keepOriginal: v })} />
        </Field>
      </Group>
      <Group title={t('settings.writing.instructions')}>
        <div className="py-3">
          <Segmented value={mode} onChange={setMode} options={(['raw', 'correct', 'professional'] as const).map((m) => ({ value: m, label: t(`modes.${m}`) }))} />
          <Textarea key={mode} className="mt-3" rows={4} defaultValue={w.customInstructions[mode]} onBlur={(e) => void update('writing', { customInstructions: { ...w.customInstructions, [mode]: e.target.value } })} />
          <div className="mt-1.5 text-[11.5px] text-muted">{t('settings.writing.instructionsHint')}</div>
        </div>
      </Group>
    </>
  )
}

export function ProvidersSection() {
  return <ProvidersManager />
}

/* ------------------------------------- Storage ------------------------------------- */

export function StorageSection() {
  const { t } = useTranslation()
  const { s, update } = useS()
  const [info, setInfo] = useState<SystemInfo | null>(null)
  useEffect(() => void api().system.info().then(setInfo), [])
  return (
    <Group>
      <Field inline label={t('settings.storage.location')} hint={<span className="selectable break-all">{info?.userData}</span>}>
        <Button size="sm" onClick={() => void api().models.openFolder()}>
          <FolderOpen size={13} /> {t('common.open')}
        </Button>
      </Field>
      <Field inline icon={<IconTile icon={History} color="indigo" />} label={t('settings.storage.historyRetention')}>
        <Select value={String(s.storage.historyRetentionDays)} onChange={(v) => void update('storage', { historyRetentionDays: Number(v) })} options={[0, 7, 30, 90, 365].map((n) => ({ value: String(n), label: n === 0 ? t('settings.storage.forever') : t('settings.storage.days', { count: n }) }))} />
      </Field>
      <Field inline icon={<IconTile icon={AudioLines} color="red" />} label={t('settings.storage.saveAudio')} hint={t('settings.storage.saveAudioHint')}>
        <Switch checked={s.storage.saveAudio} onCheckedChange={(v) => void update('storage', { saveAudio: v })} />
      </Field>
      {s.storage.saveAudio && (
        <Field inline label={t('settings.storage.audioRetention')}>
          <Select value={String(s.storage.audioRetentionDays)} onChange={(v) => void update('storage', { audioRetentionDays: Number(v) })} options={[1, 7, 30, 90].map((n) => ({ value: String(n), label: t('settings.storage.days', { count: n }) }))} />
        </Field>
      )}
      <Field inline icon={<IconTile icon={FileText} color="gray" />} label={t('settings.storage.openLogs')}>
        <Button size="sm" onClick={() => void api().system.openLogs()}>
          <FolderOpen size={13} /> {t('common.open')}
        </Button>
      </Field>
    </Group>
  )
}

/* ------------------------------------- Privacy ------------------------------------- */

export function PrivacySection() {
  const { t } = useTranslation()
  const { s, update } = useS()
  return (
    <>
      <Group>
        <div className="py-3 text-[12.5px] leading-relaxed text-muted">
          <span className="font-medium text-fg">{t('settings.privacy.localFirst')}. </span>
          {t('settings.privacy.localFirstHint')}
        </div>
        <Field inline icon={<IconTile icon={Cloud} color="blue" />} label={t('settings.privacy.allowCloud')} hint={t('settings.privacy.allowCloudHint')}>
          <Switch checked={s.privacy.allowCloud} onCheckedChange={(v) => void update('privacy', { allowCloud: v })} />
        </Field>
      </Group>
      <Group>
        <Field inline icon={<IconTile icon={Trash2} color="red" />} label={t('settings.privacy.deleteHistory')}>
          <Button size="sm" variant="danger-ghost" onClick={() => void api().history.clear().then(() => toast.success(t('history.cleared')))}>
            <Trash2 size={13} /> {t('common.delete')}
          </Button>
        </Field>
        <Field inline icon={<IconTile icon={Trash2} color="red" />} label={t('settings.privacy.deleteAudio')}>
          <Button size="sm" variant="danger-ghost" onClick={() => void api().history.deleteAudio().then((n) => toast.success(t('settings.privacy.deletedAudio', { count: n })))}>
            <Trash2 size={13} /> {t('common.delete')}
          </Button>
        </Field>
        <Field inline label={<span className="text-danger">{t('settings.privacy.clearAll')}</span>} hint={t('settings.privacy.clearAllHint')}>
          <Button size="sm" variant="danger" onClick={() => void api().system.clearAllData()}>
            {t('common.delete')}
          </Button>
        </Field>
      </Group>
    </>
  )
}

/* -------------------------------------- Backup -------------------------------------- */

export function BackupSection() {
  const { t, i18n } = useTranslation()
  const { s, update } = useS()
  const [list, setList] = useState<BackupInfo[]>([])
  const load = () => void api().backup.list().then(setList)
  useEffect(load, [])
  const act = async (fn: () => Promise<{ ok: boolean; error?: string; cancelled?: boolean; path?: string }>, msg: string) => {
    try {
      const r = await fn()
      if (r.ok) toast.success(r.path ? `${msg}: ${r.path}` : msg)
      else if (!r.cancelled) toast.error(r.error ?? t('errors.unknown'))
      load()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <>
      <p className="mb-3 text-[12.5px] leading-relaxed text-muted">{t('settings.backup.contents')}</p>
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void act(() => api().backup.create(), t('settings.backup.created'))}>
          <Download size={14} /> {t('settings.backup.create')}
        </Button>
        <Button onClick={() => void act(() => api().backup.restore(), t('settings.backup.restored'))}>
          <Upload size={14} /> {t('settings.backup.restore')}
        </Button>
        <Button variant="ghost" onClick={() => void act(() => api().backup.exportSettings(), t('common.export'))}>
          <FileJson size={14} /> {t('settings.backup.exportSettings')}
        </Button>
      </div>
      <Group title={t('settings.backup.schedule')}>
        <Field inline icon={<IconTile icon={CalendarClock} color="blue" />} label={t('settings.backup.schedule')}>
          <Segmented value={s.backup.schedule} onChange={(v) => void update('backup', { schedule: v })} options={(['off', 'daily', 'weekly'] as const).map((v) => ({ value: v, label: t(`settings.backup.${v}`) }))} />
        </Field>
        <Field inline icon={<IconTile icon={FolderOpen} color="cyan" />} label={t('settings.backup.directory')} hint={<span className="selectable break-all">{s.backup.directory ?? '—'}</span>}>
          <Button size="sm" onClick={() => void api().backup.chooseDirectory()}>
            <FolderOpen size={13} /> {t('settings.backup.choose')}
          </Button>
        </Field>
        <Field inline label={t('settings.backup.keep')}>
          <Select value={String(s.backup.keep)} onChange={(v) => void update('backup', { keep: Number(v) })} options={[3, 5, 10, 20, 50].map((n) => ({ value: String(n), label: String(n) }))} />
        </Field>
        <Field inline label={t('settings.backup.last')}>
          <span className="text-[12.5px] text-muted">{s.backup.lastBackupAt ? formatDateTime(s.backup.lastBackupAt, i18n.language) : t('settings.backup.never')}</span>
        </Field>
      </Group>
      <Group title={t('settings.backup.history')}>
        {list.length === 0 ? (
          <div className="py-4 text-center text-[12.5px] text-muted">{t('settings.backup.noBackups')}</div>
        ) : (
          list.slice(0, 20).map((b) => (
            <div key={b.id} className="flex items-center gap-3 py-2.5 text-[12.5px]">
              <Badge tone={b.status === 'ok' ? 'success' : 'danger'}>{b.kind}</Badge>
              <span className="text-fg">{formatDateTime(b.createdAt, i18n.language)}</span>
              <span className="selectable min-w-0 flex-1 truncate text-subtle">{b.path}</span>
              <span className="text-muted">{formatBytes(b.sizeBytes)}</span>
            </div>
          ))
        )}
      </Group>
    </>
  )
}

/* -------------------------------------- About -------------------------------------- */

export function AboutSection() {
  const { t, i18n } = useTranslation()
  const { s, update } = useS()
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const upd = useUpdates((x) => x.state)
  const [notesOpen, setNotesOpen] = useState(false)
  useEffect(() => void api().system.info().then(setInfo), [])
  const status = !upd
    ? ''
    : upd.phase === 'unsupported'
      ? t('update.unsupported')
      : upd.phase === 'checking'
        ? t('settings.about.checking')
        : upd.phase === 'not-available'
          ? t('settings.about.upToDate')
          : upd.phase === 'available'
            ? t('settings.about.available', { version: upd.version })
            : upd.phase === 'downloading'
              ? `${t('update.downloadingShort')} ${Math.round(upd.percent ?? 0)}%`
              : upd.phase === 'verifying'
                ? t('update.verifying')
                : upd.phase === 'downloaded'
                  ? t('update.readyTitle')
                  : upd.phase === 'error'
                    ? `${t('update.errorTitle')}: ${upd.error ?? ''}`
                    : ''
  return (
    <>
      <Card className="mb-7 flex flex-col items-center gap-3 py-7 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-[22px] bg-gradient-to-br from-[#0a84ff] via-[#5e5ce6] to-[#bf5af2] text-white shadow-[0_14px_30px_-10px_rgba(94,92,230,0.75)]">
          <AudioLines size={40} strokeWidth={2.2} />
        </div>
        <div>
          <div className="font-display text-[22px] font-bold tracking-[-0.02em] text-fg">{t('app.name')}</div>
          <div className="text-[13px] text-muted">{t('app.slogan')}</div>
        </div>
        <Badge>{t('settings.about.version')} {info?.version}</Badge>
      </Card>
      <Group title={t('update.title')} footer={upd?.checkedAt ? t('update.lastChecked', { time: formatDateTime(upd.checkedAt, i18n.language) }) : undefined}>
        <Field inline icon={<IconTile icon={RefreshCw} color="green" />} label={t('settings.about.checkUpdates')} hint={status}>
          <div className="flex gap-1.5">
            {upd?.phase === 'available' && (
              <Button size="sm" className="bg-success text-white" onClick={() => void api().updates.download()}>
                {t('update.update')}
              </Button>
            )}
            {upd?.phase === 'downloaded' && (
              <Button size="sm" className="bg-success text-white" onClick={() => void api().updates.install()}>
                {t('update.restart')}
              </Button>
            )}
            {(upd?.phase === 'available' || upd?.phase === 'downloaded') && (
              <Button size="sm" onClick={() => setNotesOpen(true)}>
                {t('update.whatsNew')}
              </Button>
            )}
            <Button size="sm" loading={upd?.phase === 'checking'} disabled={!upd || upd.phase === 'unsupported' || ['downloading', 'verifying', 'installing'].includes(upd.phase)} onClick={() => void api().updates.check()}>
              {t('update.checkNow')}
            </Button>
          </div>
        </Field>
        <Field inline icon={<IconTile icon={CalendarClock} color="blue" />} label={t('update.autoCheck')} hint={t('update.autoCheckHint')}>
          <Switch checked={s.updates.autoCheck} onCheckedChange={(v) => void update('updates', { autoCheck: v })} />
        </Field>
        <Field inline icon={<IconTile icon={ExternalLink} color="graphite" />} label={t('update.releases')}>
          <Button size="sm" variant="ghost" onClick={() => void api().system.openExternal(`https://github.com/${APP_CONFIG.releasesRepo}/releases`)}>
            GitHub
          </Button>
        </Field>
      </Group>
      <Group>
        <Field inline label={t('settings.about.platform')}>
          <span className="selectable font-mono text-[12px] text-muted">
            {info?.platform}-{info?.arch} · Electron {info?.electron}
          </span>
        </Field>
        <div className="py-3">
          <div className="text-[14px] text-fg">{t('settings.about.licenses')}</div>
          <div className="mt-1 text-[12px] leading-relaxed text-muted">{t('settings.about.licensesText')}</div>
        </div>
        <div className="py-3 text-[12px] text-muted">{t('settings.about.developers')}</div>
      </Group>
      <WhatsNewDialog open={notesOpen} onOpenChange={setNotesOpen} state={upd} />
    </>
  )
}
