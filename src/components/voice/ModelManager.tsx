import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Check, Trash2, FolderOpen, X, ShieldCheck, ShieldAlert, Cpu, FileSearch, Zap, Gauge, Languages } from 'lucide-react'
import type { DownloadProgress, EngineInfo, WhisperBinaryStatus, WhisperModelInfo } from '@shared/types'
import { getLanguage } from '@shared/languages'
import { api, cn, formatBytes } from '@/lib/utils'
import { useSettings, toast } from '@/stores'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'

function Dots({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i <= n ? 'bg-accent' : 'bg-surface-3')} />
      ))}
    </span>
  )
}

export function ModelManager({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)!
  const update = useSettings((s) => s.update)
  const [models, setModels] = useState<WhisperModelInfo[]>([])
  const [binary, setBinary] = useState<WhisperBinaryStatus | null>(null)
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({})
  const isMac = navigator.userAgent.includes('Mac')

  const [engine, setEngine] = useState<EngineInfo | null>(null)
  const reload = () => {
    void api().models.engineInfo().then(setEngine)
    void api().models.catalog().then(setModels)
    void api().models.binaryStatus().then(setBinary)
  }

  useEffect(() => {
    reload()
    return api().models.onProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.id]: p }))
      if (p.state === 'done' || p.state === 'error' || p.state === 'cancelled') {
        reload()
        if (p.state === 'error') toast.error(p.message ?? t('errors.unknown'))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const download = async (id: string) => {
    setProgress((p) => ({ ...p, [id]: { id, receivedBytes: 0, totalBytes: null, state: 'downloading' } }))
    const r = await api().models.download(id)
    if (r.ok && !models.some((m) => m.installed)) void update('recognition', { whisperModel: id })
  }

  const pct = (p?: DownloadProgress) => (p?.totalBytes ? Math.round((p.receivedBytes / p.totalBytes) * 100) : null)
  const binProgress = progress['whisper-binary']
  const binBusy = binProgress?.state === 'downloading'
  const gpuProgress = progress['whisper-gpu']
  const gpuBusy = gpuProgress?.state === 'downloading'
  const slow = !!engine?.lastMs && !!engine.lastAudioMs && engine.lastMs > engine.lastAudioMs * 1.2
  const general = models.filter((m) => !m.language)
  const special = models.filter((m) => m.language)
  // A language model for one of the user's languages that is not installed yet.
  const suggested = special.find((m) => !m.installed && m.language && settings.recognition.allowedLanguages.includes(m.language))
  const langName = (code?: string) => getLanguage(code)?.native ?? code ?? ''

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-[12px] border border-border px-3 py-2.5">
        <Cpu size={16} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-fg">{t('settings.recognition.binary')}</div>
          <div className="truncate text-[11.5px] text-muted">
            {binary?.found ? t('settings.recognition.binaryFound', { path: binary.path }) : isMac ? t('settings.recognition.macBinaryHint') : t('settings.recognition.binaryMissing')}
            {binary?.version ? ` · ${binary.version}` : ''}
          </div>
          {binBusy && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${pct(binProgress) ?? 5}%` }} />
            </div>
          )}
        </div>
        {binary?.found ? <Badge tone="success">{t('settings.recognition.installed')}</Badge> : null}
        {binary?.canAutoInstall && !binary.found && (
          <Button size="sm" variant="primary" loading={binBusy} onClick={() => void api().models.installBinary().then((r) => (r.ok ? reload() : toast.error(r.error ?? '')))}>
            <Download size={13} /> {t('settings.recognition.installBinary')}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void api().models.chooseBinary().then(setBinary)}>
          <FileSearch size={13} /> {t('settings.recognition.chooseBinary')}
        </Button>
      </div>

      {binary?.nvidiaGpu && (
        <div className="flex items-center gap-3 rounded-[12px] border border-border px-3 py-2.5">
          <Zap size={16} className="shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-fg">{t('settings.recognition.gpuTitle')}</div>
            <div className="truncate text-[11.5px] text-muted">{binary.gpuPath ? t('settings.recognition.gpuInstalled', { gpu: binary.nvidiaGpu }) : t('settings.recognition.gpuHint', { gpu: binary.nvidiaGpu })}</div>
            {gpuBusy && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full bg-success transition-[width]" style={{ width: `${pct(gpuProgress) ?? 3}%` }} />
              </div>
            )}
          </div>
          {binary.gpuPath ? (
            <Badge tone="success">{t('settings.recognition.installed')}</Badge>
          ) : gpuBusy ? (
            <Button size="sm" variant="ghost" onClick={() => void api().models.cancel('whisper-gpu')}>
              <X size={13} /> {t('common.cancel')}
            </Button>
          ) : (
            <Button size="sm" className="bg-success text-white" onClick={() => void api().models.installBinary('cuda').then((r) => (r.ok ? reload() : r.error !== 'Cancelled' && toast.error(r.error ?? '')))}>
              <Download size={13} /> {t('settings.recognition.gpuInstall')}
            </Button>
          )}
        </div>
      )}

      {engine?.backend && (
        <div className={cn('flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12px] leading-snug', slow ? 'bg-warning-soft text-fg' : 'bg-fill text-muted')}>
          <Gauge size={14} className={cn('mt-px shrink-0', slow ? 'text-warning' : 'text-muted')} />
          <div>
            {t('settings.recognition.engineOn', { device: engine.backend === 'gpu' ? `GPU${engine.device ? ` · ${engine.device}` : ''}` : 'CPU' })}
            {engine.lastMs && engine.lastAudioMs ? ` · ${t('settings.recognition.lastPhrase', { audio: (engine.lastAudioMs / 1000).toFixed(1), time: (engine.lastMs / 1000).toFixed(1) })}` : ''}
            {slow && <div className="mt-0.5 font-medium">{binary?.nvidiaGpu && !binary.gpuPath ? t('settings.recognition.slowGpuHint') : t('settings.recognition.slowHint')}</div>}
          </div>
        </div>
      )}

      {suggested && (
        <div className="flex items-center gap-3 rounded-[12px] border border-accent/40 bg-accent-soft/40 px-3 py-2.5">
          <Languages size={16} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-fg">{t('settings.recognition.langModelSuggest', { language: langName(suggested.language) })}</div>
            <div className="text-[11.5px] leading-snug text-muted">{t('settings.recognition.langModelSuggestHint', { language: langName(suggested.language), size: suggested.approxSizeMb })}</div>
            {progress[suggested.id]?.state === 'downloading' && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${pct(progress[suggested.id]) ?? 3}%` }} />
              </div>
            )}
          </div>
          {progress[suggested.id]?.state === 'downloading' ? (
            <Button size="sm" variant="ghost" onClick={() => void api().models.cancel(suggested.id)}>
              <X size={13} /> {t('common.cancel')}
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => void download(suggested.id)}>
              <Download size={13} /> {t('settings.recognition.download')}
            </Button>
          )}
        </div>
      )}

      {!compact && <p className="text-[12px] leading-relaxed text-muted">{t('settings.recognition.modelsHint')}</p>}

      <div className="flex flex-col gap-1.5">
        {[...general, ...special].map((m) => {
          const p = progress[m.id]
          const busy = p?.state === 'downloading' || p?.state === 'verifying'
          const inUse = settings.recognition.whisperModel === m.id
          return (
            <div key={m.id} className={cn('flex items-center gap-3 rounded-[11px] border px-3 py-2.5 transition', inUse && m.installed ? 'border-accent/50 bg-accent-soft/40' : 'border-border')}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-fg">
                  {m.label}
                  {m.recommended && <Badge tone="accent">{t('common.recommended')}</Badge>}
                  {m.language && <Badge tone="accent">{t('settings.recognition.langModelBadge')}</Badge>}
                  {m.installed && (m.verified ? <ShieldCheck size={13} className="text-success" aria-label={t('settings.recognition.verified')} /> : <ShieldAlert size={13} className="text-warning" aria-label={t('settings.recognition.unverified')} />)}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11.5px] text-muted">
                  <span>{m.installed ? formatBytes(m.sizeBytes) : t('settings.recognition.size', { size: m.approxSizeMb >= 1000 ? `${(m.approxSizeMb / 1000).toFixed(1)} GB` : `${m.approxSizeMb} MB` })}</span>
                  <span className="flex items-center gap-1.5">
                    {t('settings.recognition.speed')} <Dots n={m.speed} />
                  </span>
                  <span className="flex items-center gap-1.5">
                    {t('settings.recognition.quality')} <Dots n={m.quality} />
                  </span>
                  {m.source && <span className="truncate">{m.source}</span>}
                </div>
                {busy && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full bg-accent transition-[width]" style={{ width: `${pct(p) ?? 3}%` }} />
                    </div>
                    <span className="w-[120px] text-right text-[11px] tabular-nums text-muted">
                      {formatBytes(p.receivedBytes)} / {formatBytes(p.totalBytes)}
                    </span>
                  </div>
                )}
              </div>
              {busy ? (
                <Button size="sm" variant="ghost" onClick={() => void api().models.cancel(m.id)}>
                  <X size={13} /> {t('common.cancel')}
                </Button>
              ) : m.installed ? (
                <>
                  {m.language ? (
                    <Badge tone={settings.recognition.languageModels ? 'success' : 'neutral'}>
                      {settings.recognition.languageModels ? <Check size={11} /> : null} {t('settings.recognition.langModelUsedFor', { language: langName(m.language) })}
                    </Badge>
                  ) : inUse ? (
                    <Badge tone="success">
                      <Check size={11} /> {t('settings.recognition.inUse')}
                    </Badge>
                  ) : (
                    <Button size="sm" variant="soft" onClick={() => void update('recognition', { whisperModel: m.id, speechProviderId: 'whisper-cpp' })}>
                      {t('settings.recognition.use')}
                    </Button>
                  )}
                  <Button size="icon-sm" variant="danger-ghost" onClick={() => void api().models.remove(m.id).then(reload)} aria-label={t('common.delete')}>
                    <Trash2 size={13} />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => void download(m.id)}>
                  <Download size={13} /> {t('settings.recognition.download')}
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {!compact && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => void api().models.openFolder()}>
            <FolderOpen size={13} /> {t('settings.recognition.openFolder')}
          </Button>
        </div>
      )}
    </div>
  )
}
