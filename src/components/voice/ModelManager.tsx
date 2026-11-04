import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Check, Trash2, FolderOpen, X, ShieldCheck, ShieldAlert, Cpu, FileSearch } from 'lucide-react'
import type { DownloadProgress, WhisperBinaryStatus, WhisperModelInfo } from '@shared/types'
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

  const reload = () => {
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

      {!compact && <p className="text-[12px] leading-relaxed text-muted">{t('settings.recognition.modelsHint')}</p>}

      <div className="flex flex-col gap-1.5">
        {models.map((m) => {
          const p = progress[m.id]
          const busy = p?.state === 'downloading' || p?.state === 'verifying'
          const inUse = settings.recognition.whisperModel === m.id
          return (
            <div key={m.id} className={cn('flex items-center gap-3 rounded-[11px] border px-3 py-2.5 transition', inUse && m.installed ? 'border-accent/50 bg-accent-soft/40' : 'border-border')}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-fg">
                  {m.label}
                  {m.recommended && <Badge tone="accent">{t('common.recommended')}</Badge>}
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
                  {inUse ? (
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
