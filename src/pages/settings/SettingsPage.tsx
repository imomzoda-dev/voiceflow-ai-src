import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2, Palette, Mic, AudioWaveform, Sparkles, Plug, BookA, HardDrive, Shield, Archive, Info, ChevronRight } from 'lucide-react'
import { IconTile, type TileColor } from '@/components/ui/misc'
import type { LucideIcon } from 'lucide-react'
import { useSettings, useUi } from '@/stores'
import { cn } from '@/lib/utils'
import { GeneralSection, AppearanceSection, VoiceSection, RecognitionSection, WritingSection, ProvidersSection, StorageSection, PrivacySection, BackupSection, AboutSection } from './sections'

const SECTIONS: { id: string; icon: LucideIcon; color: TileColor; gap?: boolean }[] = [
  { id: 'general', icon: Settings2, color: 'gray' },
  { id: 'appearance', icon: Palette, color: 'blue' },
  { id: 'voice', icon: Mic, color: 'red', gap: true },
  { id: 'recognition', icon: AudioWaveform, color: 'pink' },
  { id: 'writing', icon: Sparkles, color: 'purple' },
  { id: 'providers', icon: Plug, color: 'green' },
  { id: 'dictionary', icon: BookA, color: 'orange' },
  { id: 'storage', icon: HardDrive, color: 'gray', gap: true },
  { id: 'privacy', icon: Shield, color: 'blue' },
  { id: 'backup', icon: Archive, color: 'teal' },
  { id: 'about', icon: Info, color: 'gray', gap: true }
]

export function SettingsPage({ initialSection }: { initialSection?: string }) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const navigate = useUi((s) => s.navigate)
  const [section, setSection] = useState(initialSection && SECTIONS.some((s) => s.id === initialSection) ? initialSection : 'general')

  useEffect(() => {
    if (initialSection) setSection(initialSection)
  }, [initialSection])

  if (!settings) return null

  let body: ReactNode
  switch (section) {
    case 'general':
      body = <GeneralSection />
      break
    case 'appearance':
      body = <AppearanceSection />
      break
    case 'voice':
      body = <VoiceSection />
      break
    case 'recognition':
      body = <RecognitionSection />
      break
    case 'writing':
      body = <WritingSection />
      break
    case 'providers':
      body = <ProvidersSection />
      break
    case 'storage':
      body = <StorageSection />
      break
    case 'privacy':
      body = <PrivacySection />
      break
    case 'backup':
      body = <BackupSection />
      break
    case 'about':
      body = <AboutSection />
      break
  }

  return (
    <div className="flex h-full">
      <nav className="w-[250px] shrink-0 overflow-y-auto px-3 pt-9">
        <div className="mb-4 px-2 font-display text-[28px] font-bold tracking-[-0.025em] text-fg">{t('settings.title')}</div>
        <div className="flex flex-col">
          {SECTIONS.map((s) => {
            const on = section === s.id
            return (
              <button
                key={s.id}
                onClick={() => (s.id === 'dictionary' ? navigate('dictionary') : setSection(s.id))}
                className={cn('flex h-[38px] items-center gap-3 rounded-[10px] px-2 text-left text-[14px] transition-colors', s.gap && 'mt-3', on ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-fill')}
              >
                <IconTile icon={s.icon} color={s.color} size="sm" />
                <span className={cn('flex-1 truncate', on && 'font-semibold')}>{t(`settings.sections.${s.id}`)}</span>
                {s.id === 'dictionary' && <ChevronRight size={14} className="text-subtle" />}
              </button>
            )
          })}
        </div>
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-8 pb-16 pt-9">
          <h1 className="mb-6 font-display text-[28px] font-bold tracking-[-0.025em] text-fg">{t(`settings.sections.${section}`)}</h1>
          {body}
        </div>
      </div>
    </div>
  )
}
