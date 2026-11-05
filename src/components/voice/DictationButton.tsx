import { useTranslation } from 'react-i18next'
import { Mic, Square, Loader2 } from 'lucide-react'
import { useDictation, useSettings } from '@/stores'
import { api, cn } from '@/lib/utils'
import { formatBinding } from '@shared/hotkeys'
import { Tooltip } from '@/components/ui/overlays'
import type { DictationTarget } from '@shared/types'

/** Manual record button. Works in every activation mode (it is the only trigger in "manual" mode). */
export function DictationButton({ compact = false, target = 'auto', className }: { compact?: boolean; target?: DictationTarget; className?: string }) {
  const { t } = useTranslation()
  const phase = useDictation((s) => s.state?.phase ?? 'idle')
  const level = useDictation((s) => s.level)
  const settings = useSettings((s) => s.settings)
  const platform = navigator.userAgent.includes('Mac') ? 'darwin' : 'win32'
  const recording = phase === 'recording'
  const busy = phase === 'processing' || phase === 'correcting' || phase === 'inserting'
  const hotkey = settings ? formatBinding(settings.voice.hotkeys.dictate, platform) : ''

  const onClick = () => {
    if (recording) void api().dictation.stop()
    else if (!busy) void api().dictation.start({ target })
  }

  const label = recording ? t('dashboard.stopDictation') : t('dashboard.startDictation')
  const button = (
    <button
      onClick={onClick}
      disabled={busy}
      // Keep focus in the editor so text is inserted at the caret.
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'no-drag relative flex h-10 items-center gap-2.5 overflow-hidden rounded-full px-4 text-[14px] font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-80',
        recording ? 'bg-danger shadow-[0_6px_18px_-6px_rgba(255,59,48,0.7)]' : 'bg-accent shadow-[0_6px_18px_-8px_var(--accent)] hover:brightness-110',
        compact && 'w-10 justify-center px-0',
        className
      )}
      aria-label={label}
    >
      {recording && <span className="absolute inset-0 origin-left bg-white/20 transition-transform duration-75" style={{ transform: `scaleX(${Math.min(1, level * 1.3)})` }} />}
      <span className="relative flex items-center gap-2.5">
        {busy ? <Loader2 size={17} className="animate-spin" /> : recording ? <Square size={13} fill="currentColor" /> : <Mic size={17} strokeWidth={2.3} />}
        {!compact && <span className="truncate">{busy ? t(`status.${phase}`) : label}</span>}
      </span>
      {!compact && !recording && !busy && settings?.voice.activationMode !== 'manual' && <span className="relative ml-auto shrink-0 whitespace-nowrap rounded-full bg-white/20 px-2 py-[1px] text-[11.5px] font-semibold">{hotkey}</span>}
    </button>
  )
  return compact ? (
    <Tooltip content={`${label} · ${hotkey}`} side="right">
      {button}
    </Tooltip>
  ) : (
    button
  )
}
