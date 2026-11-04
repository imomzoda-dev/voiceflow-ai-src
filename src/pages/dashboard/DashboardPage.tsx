import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { FilePlus2, FileText, Star, Cpu, Sparkles, Keyboard, Clock, Type, Mic, AudioLines, ChevronRight, Languages } from 'lucide-react'
import type { DashboardStats, DocumentSummary, HotkeyStatus, ProviderRecord, WhisperBinaryStatus, WhisperModelInfo } from '@shared/types'
import { languageLabel } from '@shared/languages'
import { formatBinding } from '@shared/hotkeys'
import { useDictation, useSettings, useUi, toast } from '@/stores'
import { api, errorMessage, formatDuration, relativeTime } from '@/lib/utils'
import { Badge, Card, Group, IconTile, SectionTitle, type TileColor } from '@/components/ui/misc'

function greetingKey(): string {
  const h = new Date().getHours()
  return h < 12 ? 'dashboard.greetingMorning' : h < 18 ? 'dashboard.greetingAfternoon' : 'dashboard.greetingEvening'
}

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const settings = useSettings((s) => s.settings)!
  const navigate = useUi((s) => s.navigate)
  const lastResultId = useDictation((s) => s.last?.id)
  const phase = useDictation((s) => s.state?.phase ?? 'idle')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recent, setRecent] = useState<DocumentSummary[]>([])
  const [favorites, setFavorites] = useState<DocumentSummary[]>([])
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [models, setModels] = useState<WhisperModelInfo[]>([])
  const [binary, setBinary] = useState<WhisperBinaryStatus | null>(null)
  const [hotkeys, setHotkeys] = useState<HotkeyStatus | null>(null)
  const platform = navigator.userAgent.includes('Mac') ? 'darwin' : 'win32'

  useEffect(() => {
    void api().system.stats().then(setStats)
    void api().documents.list({ scope: 'recent', limit: 5 }).then(setRecent)
    void api().documents.list({ scope: 'favorites', limit: 5 }).then(setFavorites)
    void api().providers.list().then(setProviders)
    void api().models.catalog().then(setModels)
    void api().models.binaryStatus().then(setBinary)
    void api().hotkeys.status().then(setHotkeys)
  }, [lastResultId])

  const createDoc = async () => {
    try {
      const d = await api().documents.create({ title: t('documents.untitled') })
      navigate({ page: 'editor', docId: d.id })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const speechId = settings.recognition.speechProviderId
  const speechOk = speechId === 'whisper-cpp' ? !!binary?.found && models.some((m) => m.id === settings.recognition.whisperModel && m.installed) : providers.some((p) => p.id === speechId)
  const speechLabel = speechId === 'whisper-cpp' ? `whisper.cpp · ${models.find((m) => m.id === settings.recognition.whisperModel)?.label ?? settings.recognition.whisperModel}` : (providers.find((p) => p.id === speechId)?.name ?? '—')
  const aiProvider = providers.find((p) => p.id === settings.writing.correctionProviderId)
  const hotkey = formatBinding(settings.voice.hotkeys.dictate, platform)
  const manual = settings.voice.activationMode === 'manual'
  const maxDaily = Math.max(1, ...(stats?.daily.map((d) => d.words) ?? [1]))
  const recording = phase === 'recording'
  const today = new Date().toLocaleDateString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })

  const statTiles: { icon: typeof Type; color: TileColor; label: string; value: string }[] = [
    { icon: Type, color: 'blue', label: t('dashboard.totalWords'), value: (stats?.totalWords ?? 0).toLocaleString(i18n.language) },
    { icon: Mic, color: 'red', label: t('dashboard.today'), value: (stats?.wordsToday ?? 0).toLocaleString(i18n.language) },
    { icon: Clock, color: 'orange', label: t('dashboard.timeSpoken'), value: formatDuration(stats?.totalDurationMs ?? 0) },
    { icon: AudioLines, color: 'purple', label: t('dashboard.dictations'), value: (stats?.totalDictations ?? 0).toLocaleString(i18n.language) }
  ]

  const docRows = (items: DocumentSummary[], empty: string, icon: typeof FileText, color: TileColor) =>
    items.length === 0 ? (
      <div className="py-5 text-center text-[13px] text-muted">{empty}</div>
    ) : (
      items.map((d) => (
        <button key={d.id} onClick={() => navigate({ page: 'editor', docId: d.id })} className="flex min-h-[54px] w-full items-center gap-3.5 py-2 text-left">
          <IconTile icon={icon} color={color} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium text-fg">{d.title}</div>
            <div className="truncate text-[12px] text-muted">{d.excerpt || t('documents.edited', { time: relativeTime(d.updatedAt, i18n.language) })}</div>
          </div>
          <span className="shrink-0 text-[12px] text-subtle">{relativeTime(d.updatedAt, i18n.language)}</span>
          <ChevronRight size={16} className="shrink-0 text-subtle" />
        </button>
      ))
    )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1040px] px-8 pb-14 pt-9">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">{today}</div>
          <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.025em] text-fg">{t(greetingKey())}</h1>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Hero widget */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#0a84ff] via-[#5e5ce6] to-[#bf5af2] p-6 text-white shadow-[0_18px_40px_-18px_rgba(94,92,230,0.8)] lg:col-span-2">
            <div className="pointer-events-none absolute -right-6 top-1/2 flex -translate-y-1/2 items-center gap-[7px] opacity-30">
              {[28, 52, 84, 120, 150, 120, 84, 52, 28, 60, 96, 60].map((h, i) => (
                <motion.span key={i} className="w-[9px] rounded-full bg-white" animate={{ height: recording ? [h * 0.5, h, h * 0.6] : h }} transition={{ repeat: recording ? Infinity : 0, duration: 0.9 + (i % 3) * 0.2, ease: 'easeInOut' }} style={{ height: h }} />
              ))}
            </div>
            <div className="relative max-w-[420px]">
              <div className="text-[13px] font-semibold uppercase tracking-[0.05em] text-white/75">{t('nav.voiceTyping')}</div>
              <div className="mt-1.5 font-display text-[24px] font-bold leading-tight tracking-[-0.02em]">{manual ? t('dashboard.subtitleManual') : t('dashboard.subtitle', { hotkey })}</div>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <button
                  onClick={() => (recording ? void api().dictation.stop() : void api().dictation.start({ target: 'auto' }))}
                  className="flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[14.5px] font-semibold text-[#3634a3] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.35)] transition active:scale-[0.97]"
                >
                  <Mic size={17} strokeWidth={2.4} className={recording ? 'text-[#ff3b30]' : ''} />
                  {recording ? t('dashboard.stopDictation') : t('dashboard.startDictation')}
                </button>
                <button onClick={createDoc} className="flex h-10 items-center gap-2 rounded-full bg-white/20 px-5 text-[14.5px] font-semibold text-white backdrop-blur transition hover:bg-white/28 active:scale-[0.97]">
                  <FilePlus2 size={17} />
                  {t('dashboard.newDocument')}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Week chart widget */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
            <Card className="flex h-full flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-muted">{t('dashboard.thisWeek')}</span>
                <IconTile icon={Languages} color="indigo" size="sm" />
              </div>
              <div className="mt-1 font-display text-[30px] font-bold tabular-nums tracking-[-0.02em] text-fg">
                {(stats?.wordsThisWeek ?? 0).toLocaleString(i18n.language)}
                <span className="ml-1.5 text-[14px] font-semibold text-muted">{t('common.words', { count: stats?.wordsThisWeek ?? 0 }).replace(/^[\d\s,.]+/, '')}</span>
              </div>
              <div className="mt-auto flex h-[78px] items-end gap-[7px] pt-3" role="img" aria-label={t('dashboard.thisWeek')}>
                {(stats?.daily ?? Array.from({ length: 7 }, (_, i) => ({ day: String(i), words: 0 }))).map((d, i, arr) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(5, (d.words / maxDaily) * 58)}px` }} className={i === arr.length - 1 ? 'w-full rounded-[5px] bg-accent' : 'w-full rounded-[5px] bg-fill-strong'} />
                    <span className="text-[10.5px] font-medium text-subtle">{stats ? new Date(d.day).toLocaleDateString(i18n.language, { weekday: 'narrow' }) : ''}</span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Stat widgets */}
        <div className="mt-5 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {statTiles.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.03 }}>
              <Card className="p-4">
                <IconTile icon={s.icon} color={s.color} />
                <div className="mt-3 font-display text-[26px] font-bold tabular-nums leading-none tracking-[-0.02em] text-fg">{s.value}</div>
                <div className="mt-1.5 text-[12.5px] font-medium text-muted">{s.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>
        {stats && stats.languages.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 px-1">
            <span className="mr-1 text-[12.5px] text-muted">{t('dashboard.languages')}</span>
            {stats.languages.map((l) => (
              <Badge key={l.language} tone="accent">
                {languageLabel(l.language)} · {l.count}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="mb-2.5 flex items-center justify-between">
              <SectionTitle className="mb-0">{t('dashboard.recent')}</SectionTitle>
              <button className="text-[14px] font-medium text-accent hover:opacity-75" onClick={() => navigate('documents')}>
                {t('dashboard.viewAll')}
              </button>
            </div>
            <Group>{docRows(recent, t('dashboard.noRecent'), FileText, 'orange')}</Group>
            <SectionTitle>{t('dashboard.favorites')}</SectionTitle>
            <Group>{docRows(favorites, t('dashboard.noFavorites'), Star, 'yellow')}</Group>
          </div>
          <div className="lg:col-span-2">
            <SectionTitle>{t('dashboard.engines')}</SectionTitle>
            <Group>
              {[
                { icon: Cpu, color: 'blue' as TileColor, label: t('dashboard.speechEngine'), value: speechLabel, ok: speechOk, go: () => navigate({ page: 'settings', section: 'recognition' }) },
                {
                  icon: Sparkles,
                  color: 'purple' as TileColor,
                  label: t('dashboard.aiEngine'),
                  value: settings.writing.mode === 'raw' ? t('modes.raw') : (aiProvider?.name ?? t('dashboard.notConfigured')),
                  ok: settings.writing.mode === 'raw' || !!aiProvider,
                  go: () => navigate({ page: 'settings', section: 'writing' })
                },
                { icon: Keyboard, color: 'red' as TileColor, label: t('dashboard.hotkeyStatus'), value: manual ? t('activation.manual') : hotkey, ok: !!hotkeys?.nativeHookRunning || manual, go: () => navigate({ page: 'settings', section: 'voice' }) }
              ].map((e) => (
                <button key={e.label} onClick={e.go} className="flex min-h-[58px] w-full items-center gap-3.5 py-2 text-left">
                  <IconTile icon={e.icon} color={e.color} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] text-fg">{e.label}</div>
                    <div className="truncate text-[12px] text-muted">{e.value}</div>
                  </div>
                  <Badge tone={e.ok ? 'success' : 'warning'}>{e.ok ? t('dashboard.ready') : t('dashboard.setUp')}</Badge>
                  <ChevronRight size={16} className="shrink-0 text-subtle" />
                </button>
              ))}
            </Group>
          </div>
        </div>
      </div>
    </div>
  )
}
