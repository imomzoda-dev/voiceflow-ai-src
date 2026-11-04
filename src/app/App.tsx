import { useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { TooltipProvider } from '@/components/ui/overlays'
import { Toaster } from '@/components/common/Toaster'
import { CommandPalette, usePalette } from '@/components/common/CommandPalette'
import { useUpdateSubscription } from '@/components/common/UpdateCard'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Router } from './router'
import { OnboardingWizard } from '@/pages/onboarding/OnboardingWizard'
import { useDictation, useSettings, useUi, toast, type Page } from '@/stores'
import { applyTheme } from './providers/theme'
import i18n, { setUiLanguage } from '@/i18n'
import { api, errorMessage } from '@/lib/utils'
import { flushAll } from '@/features/document-management/flush-registry'

const PAGES: Page[] = ['dashboard', 'documents', 'voice', 'history', 'assistant', 'dictionary', 'templates', 'settings']

async function newDocument(title: string) {
  try {
    const d = await api().documents.create({ title })
    useUi.getState().navigate({ page: 'editor', docId: d.id })
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

export function App() {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const [booted, setBooted] = useState(false)
  useUpdateSubscription()
  const isMac = navigator.userAgent.includes('Mac')

  useEffect(() => {
    void useSettings
      .getState()
      .load()
      .then(() => setBooted(true))
    const offs = [
      api().settings.onChange((s) => useSettings.getState().set(s)),
      api().dictation.onState((s) => useDictation.getState().setState(s)),
      api().dictation.onResult((r) => useDictation.getState().setLast(r)),
      api().dictation.onLevel((l) => useDictation.getState().setLevel(l)),
      api().system.onNavigate((p) => {
        // The application menu / tray can also request actions.
        if (p === 'action:new-document') return void newDocument(i18n.t('documents.untitled'))
        if (p === 'action:palette') return usePalette.getState().setOpen(true)
        const [page, section] = p.split(':')
        if (page === 'settings') return useUi.getState().navigate({ page: 'settings', section })
        useUi.getState().navigate((PAGES.includes(page as Page) ? page : 'dashboard') as Page)
      }),
      api().system.onFlushRequest(() => flushAll())
    ]
    void api().dictation.state().then((s) => useDictation.getState().setState(s))
    return () => offs.forEach((o) => o())
  }, [])

  // Global keyboard shortcuts (⌘ on macOS, Ctrl elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        usePalette.getState().setOpen(!usePalette.getState().open)
      } else if (k === 'n' && !e.shiftKey) {
        e.preventDefault()
        void newDocument(t('documents.untitled'))
      } else if (k === ',') {
        e.preventDefault()
        useUi.getState().navigate('settings')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMac, t])

  useEffect(() => {
    if (!settings) return
    applyTheme(settings.appearance)
    setUiLanguage(settings.general.uiLanguage)
  }, [settings])

  if (!booted || !settings) return <div className="h-full bg-bg" />

  const reduced = document.documentElement.dataset.motion === 'reduced'

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
      <TooltipProvider delayDuration={400}>
        {!settings.general.onboardingCompleted ? (
          <OnboardingWizard />
        ) : (
          <div className="flex h-full">
            <Sidebar />
            <main className="relative min-w-0 flex-1 overflow-hidden bg-bg">
              {/* macOS: the hidden-inset title bar needs a draggable strip above the content. */}
              {isMac && <div className="drag-region absolute inset-x-0 top-0 z-20 h-[26px]" />}
              <Router />
            </main>
          </div>
        )}
        <CommandPalette />
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  )
}

