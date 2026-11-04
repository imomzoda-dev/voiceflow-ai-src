/**
 * Floating dictation widget ("Dynamic Island") + audio recorder. Lives in a hidden,
 * non-activating window so the app the user types into keeps focus.
 * States: RECORDING / PROCESSING / CORRECTING / INSERTING / SUCCESS / ERROR (IDLE hides it).
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Mic, X, AlertTriangle, Sparkles } from 'lucide-react'
import type { AppSettings } from '@shared/settings'
import type { DictationPhase, DictationState } from '@shared/types'
import { languageLabel } from '@shared/languages'
import { MicRecorder } from '@/services/audio/mic-recorder'
import { playEarcon } from '@/services/audio/earcons'
import { Waveform } from './Waveform'
import { setUiLanguage } from '@/i18n'
import { applyTheme } from '@/app/providers/theme'

const api = () => window.voiceflow

function useElapsed(startedAt: number | null, running: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [running])
  if (!startedAt) return 0
  return Math.max(0, now - startedAt)
}

const WIDTH: Record<DictationPhase, number> = { idle: 0, recording: 320, processing: 236, correcting: 250, inserting: 220, success: 210, error: 330 }

export function OverlayApp() {
  const { t } = useTranslation()
  const [state, setState] = useState<DictationState | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [level, setLevel] = useState(0)
  const session = useRef<string | null>(null)
  const recorder = useRef<MicRecorder | null>(null)
  const prevPhase = useRef<DictationPhase>('idle')
  const sounds = useRef(true)

  useEffect(() => {
    const apply = (s: AppSettings) => {
      setSettings(s)
      sounds.current = s.voice.playSounds
      setUiLanguage(s.general.uiLanguage)
      applyTheme(s.appearance)
    }
    void api().settings.get().then(apply)
    const offSettings = api().settings.onChange(apply)
    void api().dictation.state().then(setState)
    const offState = api().dictation.onState((s) => {
      const prev = prevPhase.current
      if (sounds.current && s.phase !== prev) {
        if (s.phase === 'recording') playEarcon('start')
        else if (prev === 'recording' && s.phase === 'processing') playEarcon('stop')
        else if (s.phase === 'success') playEarcon('success')
        else if (s.phase === 'error' && s.errorCode !== 'too-short') playEarcon('error')
      }
      prevPhase.current = s.phase
      setState(s)
    })

    recorder.current = new MicRecorder({
      onLevel: (l) => {
        setLevel(l)
        api().recorder.reportLevel(l)
      },
      onError: (code, message) => {
        if (session.current) api().recorder.reportError(session.current, code, message)
      },
      onSilence: () => void api().dictation.stop()
    })

    const offCmd = api().recorder.onCommand(async (cmd) => {
      const rec = recorder.current!
      if (cmd.type === 'start') {
        session.current = cmd.sessionId
        try {
          await rec.start({ deviceId: cmd.deviceId, gain: cmd.gain, autoStopOnSilence: cmd.autoStopOnSilence, silenceTimeoutSec: cmd.silenceTimeoutSec })
          if (session.current === cmd.sessionId) api().recorder.reportReady(cmd.sessionId)
          else await rec.cancel()
        } catch {
          /* error already reported through onError */
        }
      } else if (cmd.type === 'stop') {
        if (session.current !== cmd.sessionId || !rec.active) return
        session.current = null
        try {
          const r = await rec.stop()
          await api().recorder.submit(cmd.sessionId, r.wav, { durationMs: r.durationMs, peak: r.peak, rms: r.rms })
        } catch (e) {
          api().recorder.reportError(cmd.sessionId, 'no-audio', (e as Error).message)
        }
        setLevel(0)
      } else if (cmd.type === 'cancel') {
        if (session.current === cmd.sessionId) session.current = null
        await rec.cancel()
        setLevel(0)
      }
    })
    return () => {
      offSettings()
      offState()
      offCmd()
      void recorder.current?.cancel()
    }
  }, [])

  const phase = state?.phase ?? 'idle'
  const recording = phase === 'recording'
  const elapsed = useElapsed(state?.startedAt ?? null, recording)
  const remaining = state ? Math.max(0, state.maxDurationSec * 1000 - elapsed) : 0
  const mm = Math.floor(elapsed / 60000)
  const ss = Math.floor((elapsed % 60000) / 1000)
  const busy = phase === 'processing' || phase === 'correcting' || phase === 'inserting'
  const pos = settings?.voice.widgetPosition ?? 'top'

  const statusText = phase === 'error' && state?.errorCode ? t(`errors.${state.errorCode}`) : t(`status.${phase}`)

  return (
    <AnimatePresence>
      {phase !== 'idle' && (
        <motion.div
          key="island"
          className="vf-island"
          data-pos={pos}
          initial={{ opacity: 0, scale: 0.6, width: 120, y: pos === 'top' ? -20 : 20 }}
          animate={{ opacity: 1, scale: 1, width: WIDTH[phase], y: 0 }}
          exit={{ opacity: 0, scale: 0.7, width: 120, y: pos === 'top' ? -16 : 16 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.9 }}
          role="status"
          aria-live="polite"
        >
          <div className="vf-orb" data-phase={phase}>
            {recording && <span className="vf-halo" />}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={busy ? 'busy' : phase} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.16 }} className="grid place-items-center">
                {recording && <Mic size={17} strokeWidth={2.4} />}
                {busy && (phase === 'correcting' ? <Sparkles size={16} /> : <span className="vf-spinner" />)}
                {phase === 'success' && <Check size={18} strokeWidth={3} />}
                {phase === 'error' && <AlertTriangle size={16} strokeWidth={2.4} />}
              </motion.span>
            </AnimatePresence>
          </div>

          <div className="min-w-0 flex-1">
            {recording ? (
              <div className="h-[26px]">
                <Waveform level={level} active bars={26} className="h-full w-full" color="#ff453a" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`truncate text-[13.5px] font-semibold tracking-[-0.01em] ${phase === 'error' ? 'whitespace-normal text-[12px] leading-tight' : ''}`}>{statusText}</span>
                {busy && (
                  <span className="vf-dots shrink-0 text-white/70">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
                {state?.language && (phase === 'success' || busy) && <span className="shrink-0 rounded-full bg-white/15 px-2 py-[2px] text-[11px] font-semibold text-white/90">{languageLabel(state.language)}</span>}
              </div>
            )}
          </div>

          {recording && (
            <div className={`shrink-0 font-mono text-[13px] font-medium tabular-nums ${remaining < 10000 ? 'text-[#ff453a]' : 'text-white/70'}`}>
              {mm}:{String(ss).padStart(2, '0')}
            </div>
          )}
          {(recording || busy) && (
            <button
              type="button"
              onClick={() => api().recorder.cancelFromWidget()}
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-white/12 text-white/80 transition hover:bg-white/22 hover:text-white"
              title={t('overlay.cancel')}
              aria-label={t('overlay.cancel')}
            >
              <X size={16} strokeWidth={2.6} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
