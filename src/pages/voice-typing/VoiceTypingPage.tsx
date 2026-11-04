import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Wand2, Hand, Keyboard, ChevronRight } from 'lucide-react'
import type { HotkeyStatus, PermissionKind, PermissionStatus } from '@shared/types'
import { formatBinding } from '@shared/hotkeys'
import { commandPhrases } from '@shared/voice-commands'
import { languageLabel } from '@shared/languages'
import { useDictation, useSettings, useUi } from '@/stores'
import { api } from '@/lib/utils'
import { Card, Kbd, PageHeader, SectionTitle, Badge, Group, IconTile } from '@/components/ui/misc'
import { Field, Segmented, Textarea } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Waveform } from '@/components/voice/Waveform'
import { RecordOrb } from '@/components/voice/RecordOrb'
import { ResultCard } from '@/components/voice/ResultCard'
import { PermissionsList } from '@/components/common/PermissionsList'

export function VoiceTypingPage() {
  const { t, i18n } = useTranslation()
  const settings = useSettings((s) => s.settings)!
  const update = useSettings((s) => s.update)
  const navigate = useUi((s) => s.navigate)
  const { state, last, level } = useDictation()
  const [hotkeys, setHotkeys] = useState<HotkeyStatus | null>(null)
  const [perms, setPerms] = useState<Record<PermissionKind, PermissionStatus> | null>(null)
  const [scratch, setScratch] = useState('')
  const platform = navigator.userAgent.includes('Mac') ? 'darwin' : 'win32'
  const hotkey = formatBinding(settings.voice.hotkeys.dictate, platform)
  const phase = state?.phase ?? 'idle'
  const recording = phase === 'recording'

  useEffect(() => {
    void api().hotkeys.status().then(setHotkeys)
    void api().system.permissions().then(setPerms)
  }, [settings.voice])

  const phrases = commandPhrases()
  const lang = i18n.language
  const pick = (list: string[]) => list.find((p) => (lang === 'ru' ? /[а-яё]/i.test(p) && !/[ғқӯҳҷӣ]/i.test(p) : lang === 'tg' ? /[ғқӯҳҷӣ]/i.test(p) : /^[a-z ]+$/i.test(p))) ?? list[0]
  const conflict = hotkeys?.registrations.find((r) => r.action === 'dictate')?.conflict === 'in-use'

  const steps = [t('voice.step1'), settings.voice.activationMode === 'toggle' ? t('voice.step2Toggle', { hotkey }) : t('voice.step2', { hotkey }), t('voice.step3')]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[920px] px-8 pb-14 pt-9">
        <PageHeader title={t('voice.title')} subtitle={t('voice.subtitle')} />

        {hotkeys && !hotkeys.nativeHookRunning && settings.voice.activationMode !== 'manual' && (
          <Banner>
            {t('voice.hookNotRunning')} {hotkeys.nativeError && <span className="text-muted">({hotkeys.nativeError})</span>}
          </Banner>
        )}
        {hotkeys?.nativeHookRunning && settings.voice.activationMode !== 'manual' && conflict && (
          <Banner action={<Button size="sm" variant="ghost" onClick={() => navigate({ page: 'settings', section: 'voice' })}>{t('voice.change')}</Button>}>{t('settings.voice.conflictInUseActive')}</Banner>
        )}

        {/* Hero: record orb + live waveform + how it works */}
        <Card className="mb-7 flex items-center gap-7 p-6">
          <RecordOrb />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-display text-[20px] font-bold tracking-[-0.015em] text-fg">{recording ? t('status.recording') : t(`status.${phase}`)}</span>
              {state?.language && phase !== 'idle' && <Badge tone="accent">{languageLabel(state.language)}</Badge>}
            </div>
            <div className="mb-4 h-9">
              <Waveform level={level} active={recording} bars={44} idleMotion={false} className="h-full w-full" color={recording ? 'var(--danger)' : 'var(--fill-strong)'} />
            </div>
            <ol className="flex flex-col gap-1.5">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2.5 text-[13.5px] text-fg">
                  <span className="grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </Card>

        <Group>
          <Field inline icon={<IconTile icon={Wand2} color="purple" />} label={t('voice.processingMode')} hint={t(`modes.${settings.writing.mode}Hint`)}>
            <Segmented size="sm" value={settings.writing.mode} onChange={(m) => void update('writing', { mode: m })} options={(['raw', 'correct', 'professional'] as const).map((m) => ({ value: m, label: t(`modes.${m}`) }))} />
          </Field>
          <Field inline icon={<IconTile icon={Hand} color="orange" />} label={t('voice.activation')}>
            <Segmented size="sm" value={settings.voice.activationMode} onChange={(m) => void update('voice', { activationMode: m })} options={(['hold', 'toggle', 'manual'] as const).map((m) => ({ value: m, label: t(`activation.${m}`) }))} />
          </Field>
          <button className="flex min-h-[48px] w-full items-center gap-3.5 py-2 text-left" onClick={() => navigate({ page: 'settings', section: 'voice' })}>
            <IconTile icon={Keyboard} color="red" />
            <span className="flex-1 text-[14px] text-fg">{t('voice.hotkey')}</span>
            <Kbd>{hotkey}</Kbd>
            <ChevronRight size={16} className="text-subtle" />
          </button>
        </Group>

        <SectionTitle>{t('voice.tryIt')}</SectionTitle>
        <Card className="mb-7 p-3">
          <Textarea rows={4} value={scratch} onChange={(e) => setScratch(e.target.value)} placeholder={t('voice.tryPlaceholder')} className="bg-transparent focus:bg-transparent focus:shadow-none" />
        </Card>

        <SectionTitle>{t('voice.lastResult')}</SectionTitle>
        <div className="mb-7">{last ? <ResultCard result={last} /> : <Card className="py-8 text-center text-[13.5px] text-muted">{t('voice.noResultYet')}</Card>}</div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <SectionTitle>{t('voice.permissions')}</SectionTitle>
            <Card>{perms && <PermissionsList perms={perms} onChange={setPerms} />}</Card>
          </div>
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <SectionTitle className="mb-0">{t('voice.commandsTitle')}</SectionTitle>
              <Badge tone={settings.voice.voiceCommands ? 'success' : 'neutral'}>{settings.voice.voiceCommands ? t('common.enabled') : t('common.disabled')}</Badge>
            </div>
            <Card>
              <p className="mb-3 text-[12.5px] text-muted">{t('voice.commandsHint')}</p>
              <div className="flex flex-col text-[13px]">
                {[...Object.entries(phrases.editor), ...Object.entries(phrases.ai)].map(([cmd, list]) => (
                  <div key={cmd} className="flex items-baseline justify-between gap-3 py-[5px] shadow-[inset_0_-0.5px_0_var(--border)] last:shadow-none">
                    <span className="text-muted">{t(`commands.${cmd}`)}</span>
                    <span className="truncate text-right font-medium text-fg">“{pick(list)}”</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function Banner({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-[14px] bg-warning-soft px-4 py-3 text-[13px] leading-snug text-fg">
      <AlertTriangle size={17} className="shrink-0 text-warning" />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  )
}
