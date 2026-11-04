import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { AudioLines, Cpu, Cloud, ArrowLeft, ArrowRight, Check, Rocket } from 'lucide-react'
import type { PermissionKind, PermissionStatus, ProviderRecord } from '@shared/types'
import { formatBinding } from '@shared/hotkeys'
import { useDictation, useSettings } from '@/stores'
import { api, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Segmented, Select } from '@/components/ui/form'
import { Kbd } from '@/components/ui/misc'
import { MicTest } from '@/components/voice/MicTest'
import { HotkeyRecorder } from '@/components/voice/HotkeyRecorder'
import { ModelManager } from '@/components/voice/ModelManager'
import { ProvidersManager } from '@/components/common/ProvidersManager'
import { PermissionsList } from '@/components/common/PermissionsList'
import { DictationButton } from '@/components/voice/DictationButton'
import { ResultCard } from '@/components/voice/ResultCard'

type StepId = 'welcome' | 'language' | 'mic' | 'hotkey' | 'engine' | 'model' | 'ai' | 'permissions' | 'test' | 'done'
const STEPS: StepId[] = ['welcome', 'language', 'mic', 'hotkey', 'engine', 'model', 'ai', 'permissions', 'test', 'done']

export function OnboardingWizard() {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)!
  const update = useSettings((s) => s.update)
  const last = useDictation((s) => s.last)
  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const [engine, setEngine] = useState<'local' | 'cloud'>(settings.recognition.speechProviderId === 'whisper-cpp' ? 'local' : 'cloud')
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [perms, setPerms] = useState<Record<PermissionKind, PermissionStatus> | null>(null)
  const [testStartId] = useState(() => last?.id ?? null)
  const platform = navigator.userAgent.includes('Mac') ? 'darwin' : 'win32'
  const hotkey = formatBinding(settings.voice.hotkeys.dictate, platform)
  const step = STEPS[i]

  const reloadProviders = () => void api().providers.list().then(setProviders)
  useEffect(reloadProviders, [])
  useEffect(() => {
    if (step === 'permissions') void api().system.permissions().then(setPerms)
  }, [step])

  const go = (d: 1 | -1) => {
    setDir(d)
    setI((x) => Math.max(0, Math.min(STEPS.length - 1, x + d)))
  }

  const finish = () => void update('general', { onboardingCompleted: true })

  const speechProviders = providers.filter((p) => p.supportsTranscription)
  const chatProviders = providers.filter((p) => p.supportsChat)

  const Title = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => (
    <div className="mb-6">
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-fg">{children}</h1>
      {sub ? <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{sub}</p> : null}
    </div>
  )

  let body: ReactNode
  switch (step) {
    case 'welcome':
      body = (
        <div className="flex flex-col items-center py-6 text-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-6 grid h-20 w-20 place-items-center rounded-[24px] bg-gradient-to-br from-[#4f7dff] to-[#8a5cff] text-white shadow-float">
            <AudioLines size={38} strokeWidth={2.2} />
          </motion.div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg">{t('onboarding.welcomeTitle')}</h1>
          <p className="mt-2 text-[13px] font-medium text-accent">{t('app.slogan')}</p>
          <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-muted">{t('onboarding.welcomeText')}</p>
        </div>
      )
      break
    case 'language':
      body = (
        <>
          <Title sub={t('onboarding.languageText')}>{t('onboarding.languageTitle')}</Title>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ['en', 'English'],
                ['ru', 'Русский'],
                ['tg', 'Тоҷикӣ']
              ] as const
            ).map(([code, label]) => (
              <button key={code} onClick={() => void update('general', { uiLanguage: code })} className={cn('rounded-[14px] border p-5 text-[15px] font-semibold transition', settings.general.uiLanguage === code ? 'border-accent bg-accent-soft text-accent' : 'border-border text-fg hover:bg-surface-2')}>
                {label}
              </button>
            ))}
          </div>
        </>
      )
      break
    case 'mic':
      body = (
        <>
          <Title sub={t('onboarding.micText')}>{t('onboarding.micTitle')}</Title>
          <MicTest />
        </>
      )
      break
    case 'hotkey':
      body = (
        <>
          <Title sub={platform === 'darwin' ? t('onboarding.hotkeyTextMac') : t('onboarding.hotkeyText')}>{t('onboarding.hotkeyTitle')}</Title>
          <div className="flex flex-col items-center gap-5 rounded-[14px] border border-border bg-surface-2 p-6">
            <HotkeyRecorder value={settings.voice.hotkeys.dictate} onChange={(b) => b && void update('voice', { hotkeys: { ...settings.voice.hotkeys, dictate: b } })} others={[settings.voice.hotkeys.cancel]} allowClear={false} />
            <Segmented value={settings.voice.activationMode} onChange={(m) => void update('voice', { activationMode: m })} options={(['hold', 'toggle', 'manual'] as const).map((m) => ({ value: m, label: t(`activation.${m}`) }))} />
          </div>
        </>
      )
      break
    case 'engine':
      body = (
        <>
          <Title>{t('onboarding.engineTitle')}</Title>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['local', Cpu, t('onboarding.engineLocal'), t('onboarding.engineLocalText')],
                ['cloud', Cloud, t('onboarding.engineCloud'), t('onboarding.engineCloudText')]
              ] as const
            ).map(([id, Icon, title, text]) => (
              <button
                key={id}
                onClick={() => {
                  setEngine(id)
                  if (id === 'local') void update('recognition', { speechProviderId: 'whisper-cpp' })
                }}
                className={cn('rounded-[16px] border p-5 text-left transition', engine === id ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2')}
              >
                <Icon size={22} className={engine === id ? 'text-accent' : 'text-muted'} />
                <div className="mt-3 text-[14.5px] font-semibold text-fg">{title}</div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-muted">{text}</div>
              </button>
            ))}
          </div>
        </>
      )
      break
    case 'model':
      body =
        engine === 'local' ? (
          <>
            <Title sub={t('onboarding.modelText')}>{t('onboarding.modelTitle')}</Title>
            <div className="max-h-[46vh] overflow-y-auto pr-1">
              <ModelManager compact />
            </div>
          </>
        ) : (
          <>
            <Title sub={t('onboarding.engineCloudText')}>{t('onboarding.engineCloud')}</Title>
            <ProvidersManager onChange={reloadProviders} />
            {speechProviders.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-fg">{t('settings.recognition.engine')}</span>
                <Select
                  value={settings.recognition.speechProviderId}
                  onChange={(v) => {
                    void update('recognition', { speechProviderId: v })
                    void update('privacy', { allowCloud: true })
                  }}
                  options={[{ value: 'whisper-cpp', label: t('settings.recognition.local') }, ...speechProviders.map((p) => ({ value: p.id, label: p.name }))]}
                />
              </div>
            )}
          </>
        )
      break
    case 'ai':
      body = (
        <>
          <Title sub={t('onboarding.aiText')}>{t('onboarding.aiTitle')}</Title>
          <ProvidersManager onChange={reloadProviders} />
          {chatProviders.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-fg">{t('settings.writing.provider')}</span>
              <Select
                value={settings.writing.correctionProviderId ?? '__none'}
                onChange={(v) => {
                  const p = chatProviders.find((x) => x.id === v)
                  void update('writing', { correctionProviderId: v === '__none' ? null : v })
                  if (p && !p.isLocal) void update('privacy', { allowCloud: true })
                }}
                options={[{ value: '__none', label: t('common.none') }, ...chatProviders.map((p) => ({ value: p.id, label: p.name }))]}
              />
              <Segmented value={settings.writing.mode} onChange={(m) => void update('writing', { mode: m })} options={(['raw', 'correct', 'professional'] as const).map((m) => ({ value: m, label: t(`modes.${m}`) }))} />
            </div>
          )}
        </>
      )
      break
    case 'permissions':
      body = (
        <>
          <Title sub={t('onboarding.permissionsText')}>{t('onboarding.permissionsTitle')}</Title>
          {perms && <PermissionsList perms={perms} onChange={setPerms} />}
        </>
      )
      break
    case 'test':
      body = (
        <>
          <Title sub={settings.voice.activationMode === 'manual' ? undefined : t('onboarding.testText', { hotkey })}>{t('onboarding.testTitle')}</Title>
          <div className="mb-4 flex items-center gap-3">
            <DictationButton target="preview" className="h-10 px-4" />
            {settings.voice.activationMode !== 'manual' && <Kbd>{hotkey}</Kbd>}
          </div>
          {last && last.id !== testStartId && <ResultCard result={last} />}
        </>
      )
      break
    case 'done':
      body = (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="mb-5 grid h-16 w-16 place-items-center rounded-full bg-success-soft text-success">
            <Check size={30} strokeWidth={2.6} />
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-fg">{t('onboarding.doneTitle')}</h1>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-muted">{t('onboarding.doneText', { hotkey })}</p>
        </div>
      )
      break
  }

  return (
    <div className="drag-region flex h-full items-center justify-center bg-bg p-6">
      <div className="no-drag flex max-h-full w-[min(680px,100%)] flex-col overflow-hidden rounded-[22px] border border-border bg-elevated shadow-float">
        <div className="flex items-center gap-1.5 px-8 pt-6">
          {STEPS.map((s, idx) => (
            <span key={s} className={cn('h-1 flex-1 rounded-full transition-colors', idx <= i ? 'bg-accent' : 'bg-surface-3')} />
          ))}
        </div>
        <div className="px-8 pt-2 text-[11.5px] text-subtle">{t('onboarding.stepOf', { n: i + 1, total: STEPS.length })}</div>
        <div className="relative min-h-[360px] flex-1 overflow-y-auto px-8 py-6">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir} initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -24 }} transition={{ duration: 0.2 }}>
              {body}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between border-t border-border px-8 py-4">
          <Button variant="ghost" onClick={() => (i === 0 ? finish() : go(-1))}>
            {i === 0 ? (
              t('common.skip')
            ) : (
              <>
                <ArrowLeft size={14} /> {t('common.back')}
              </>
            )}
          </Button>
          {step === 'done' ? (
            <Button variant="primary" size="lg" onClick={finish}>
              <Rocket size={15} /> {t('onboarding.openApp')}
            </Button>
          ) : (
            <div className="flex gap-2">
              {['ai', 'test', 'permissions', 'model'].includes(step) && (
                <Button variant="ghost" onClick={() => go(1)}>
                  {t('common.skip')}
                </Button>
              )}
              <Button variant="primary" size="lg" onClick={() => go(1)}>
                {i === 0 ? t('onboarding.getStarted') : t('common.next')} <ArrowRight size={15} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
