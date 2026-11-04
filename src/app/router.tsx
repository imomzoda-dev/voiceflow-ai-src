import { AnimatePresence, motion } from 'motion/react'
import { useUi } from '@/stores'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { DocumentsPage } from '@/pages/documents/DocumentsPage'
import { EditorPage } from '@/pages/documents/EditorPage'
import { VoiceTypingPage } from '@/pages/voice-typing/VoiceTypingPage'
import { HistoryPage } from '@/pages/history/HistoryPage'
import { AssistantPage } from '@/pages/ai-assistant/AssistantPage'
import { DictionaryPage } from '@/pages/dictionary/DictionaryPage'
import { TemplatesPage } from '@/pages/templates/TemplatesPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'

export function Router() {
  const route = useUi((s) => s.route)
  const key = route.page === 'editor' ? `editor:${route.docId}` : route.page
  let page: React.ReactNode
  switch (route.page) {
    case 'dashboard':
      page = <DashboardPage />
      break
    case 'documents':
      page = <DocumentsPage />
      break
    case 'editor':
      page = route.docId ? <EditorPage docId={route.docId} /> : <DocumentsPage />
      break
    case 'voice':
      page = <VoiceTypingPage />
      break
    case 'history':
      page = <HistoryPage />
      break
    case 'assistant':
      page = <AssistantPage />
      break
    case 'dictionary':
      page = <DictionaryPage />
      break
    case 'templates':
      page = <TemplatesPage />
      break
    case 'settings':
      page = <SettingsPage initialSection={route.section} />
      break
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        className="absolute inset-0"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
        {page}
      </motion.div>
    </AnimatePresence>
  )
}
