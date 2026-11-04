import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { useToasts } from '@/stores'

/** iOS-style notification pill that drops from the top centre (Dynamic-Island feel). */
export function Toaster() {
  const { items, dismiss } = useToasts()
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -28, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex max-w-[min(520px,92vw)] cursor-default items-center gap-2.5 rounded-full bg-[#1c1c1e]/95 py-2 pl-3 pr-4 text-[13px] font-medium text-white shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl dark:bg-[#2c2c2e]/95"
          >
            {t.kind === 'success' ? <CheckCircle2 size={17} className="shrink-0 text-[#30d158]" /> : t.kind === 'error' ? <XCircle size={17} className="shrink-0 text-[#ff453a]" /> : <Info size={17} className="shrink-0 text-[#0a84ff]" />}
            <div className="min-w-0 flex-1 truncate leading-snug">{t.message}</div>
            {t.action ? (
              <button
                className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-[12.5px] font-semibold text-white hover:bg-white/25"
                onClick={(e) => {
                  e.stopPropagation()
                  t.action!.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
