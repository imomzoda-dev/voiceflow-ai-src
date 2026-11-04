import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, X } from 'lucide-react'
import { bindingFromDomEvent, bindingsEqual, formatBinding, isUnsafeBareBinding, knownSystemConflict, type HotkeyBinding } from '@shared/hotkeys'
import { api, cn } from '@/lib/utils'
import { Kbd } from '@/components/ui/misc'

/**
 * Records a key/combination. While recording, global hotkeys are suspended so the key reaches
 * this window, then the binding is checked for conflicts (system-reserved, unsafe bare keys,
 * duplicates, and shortcuts already registered by another app).
 */
export function HotkeyRecorder({ value, onChange, others, allowClear = true }: { value: HotkeyBinding | null; onChange: (b: HotkeyBinding | null) => void; others: (HotkeyBinding | null)[]; allowClear?: boolean }) {
  const { t } = useTranslation()
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const platform = navigator.userAgent.includes('Mac') ? 'darwin' : 'win32'

  useEffect(() => {
    if (!recording) return
    void api().hotkeys.suspend(true)
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && value) {
        setRecording(false)
        return
      }
      const r = bindingFromDomEvent(e)
      if (!r.ok) {
        if (r.reason === 'unsupported-key') setError(t('settings.voice.unsupportedKey'))
        return
      }
      const b = r.binding
      const sys = knownSystemConflict(b, platform)
      if (sys) return setError(t('settings.voice.conflictSystem', { name: sys }))
      if (isUnsafeBareBinding(b)) return setError(t('settings.voice.conflictUnsafe'))
      if (others.some((o) => bindingsEqual(o, b))) return setError(t('settings.voice.conflictDuplicate'))
      const check = await api().hotkeys.checkBinding(b)
      setWarning(check.conflict === 'in-use' ? t('settings.voice.conflictInUse') : null)
      setError(null)
      setRecording(false)
      onChange(b)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      void api().hotkeys.suspend(false)
    }
  }, [recording, others, onChange, platform, t, value])

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setError(null)
            setRecording((r) => !r)
          }}
          className={cn(
            'flex h-8 min-w-[150px] items-center justify-center gap-2 rounded-[9px] px-3 text-[13px] transition',
            recording ? 'bg-accent-soft text-accent shadow-[0_0_0_3px_var(--ring)]' : 'bg-fill text-fg hover:bg-fill-strong'
          )}
          aria-label={t('settings.voice.pressKeys')}
        >
          {recording ? (
            <>
              <Keyboard size={14} className="animate-pulse" /> {t('settings.voice.pressKeys')}
            </>
          ) : value ? (
            <Kbd>{formatBinding(value, platform)}</Kbd>
          ) : (
            <span className="text-subtle">{t('settings.voice.notSet')}</span>
          )}
        </button>
        {allowClear && value && !recording && (
          <button className="grid h-7 w-7 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg" onClick={() => onChange(null)} aria-label={t('settings.voice.clear')}>
            <X size={14} />
          </button>
        )}
      </div>
      {error && <div className="max-w-[300px] text-right text-[11.5px] text-danger">{error}</div>}
      {!error && warning && <div className="max-w-[300px] text-right text-[11.5px] text-warning">{warning}</div>}
    </div>
  )
}
