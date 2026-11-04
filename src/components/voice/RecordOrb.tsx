import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { Mic, Loader2, Check } from 'lucide-react'
import { useDictation } from '@/stores'
import { api, cn } from '@/lib/utils'
import type { DictationTarget } from '@shared/types'

/** Large Voice-Memos-style record button with a live level ring. */
export function RecordOrb({ target = 'auto', size = 88 }: { target?: DictationTarget; size?: number }) {
  const { t } = useTranslation()
  const phase = useDictation((s) => s.state?.phase ?? 'idle')
  const level = useDictation((s) => s.level)
  const recording = phase === 'recording'
  const busy = phase === 'processing' || phase === 'correcting' || phase === 'inserting'
  const ring = recording ? 1 + Math.min(0.45, level * 0.55) : 1

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size + 36, height: size + 36 }}>
      <motion.span className="absolute rounded-full bg-danger/18" style={{ width: size + 24, height: size + 24 }} animate={{ scale: ring, opacity: recording ? 1 : 0 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} />
      <span className="absolute rounded-full border-[3px] border-fill-strong" style={{ width: size + 12, height: size + 12 }} />
      <motion.button
        whileTap={{ scale: 0.92 }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (recording ? void api().dictation.stop() : !busy && void api().dictation.start({ target }))}
        disabled={busy}
        aria-label={recording ? t('dashboard.stopDictation') : t('dashboard.startDictation')}
        className="relative grid place-items-center rounded-full text-white disabled:opacity-90"
        style={{ width: size, height: size }}
      >
        {/* Voice Memos: the red circle morphs into a rounded square while recording. */}
        <motion.span
          animate={{ borderRadius: recording ? size * 0.12 : size / 2, scale: recording ? 0.46 : 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          className={cn('absolute inset-0 shadow-[0_10px_24px_-8px_rgba(255,59,48,0.65)]', phase === 'success' ? 'bg-success' : 'bg-danger')}
        />
        <span className="relative">
          {busy ? <Loader2 size={size * 0.34} className="animate-spin" /> : phase === 'success' ? <Check size={size * 0.38} strokeWidth={3} /> : recording ? null : <Mic size={size * 0.36} strokeWidth={2.2} />}
        </span>
      </motion.button>
    </div>
  )
}
