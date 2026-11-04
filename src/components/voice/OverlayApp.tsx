/**
 * Floating dictation widget ("Dynamic Island") + audio recorder. Lives in a hidden,
 * non-activating window so the app the user types into keeps focus.
 * States: SELECTING (language picker) / RECORDING (+ live text) / PROCESSING / CORRECTING /
 * INSERTING / SUCCESS / ERROR (IDLE hides it).
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Mic, X, AlertTriangle, Sparkles, Languages, Copy } from 'lucide-react'
import type { AppSettings } from '@shared/settings'
import type { DictationPhase, DictationState } from '@shared/types'
import { languageLabel } from '@shared/languages'
import { formatBinding } from '@shared/hotkeys'
import { MicRecorder } from '@/services/audio/mic-recorder'
import { playEarcon } from '@/services/audio/earcons'
import { Waveform } from './Waveform'
import { setUiLanguage } from '@/i18n'
import { applyTheme } from '@/app/providers/theme'

const api = () => window.voiceflow

function useNow(running: boolean, every = 100) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(t)
  }, [running, every])
  return now
}

const WIDTH: Record<DictationPhase, number> = { idle: 0, selecting: 364, recording: 340, processing: 250, correcting: 260, inserting: 230, success: 250, error: 340 }

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
      onSilence: () => void api().dictation.stop(),
      // Live typing: each phrase goes to the main process as soon as the speaker pauses.
      onSegment: (seg) => {
        const id = session.current
        if (id) void api().recorder.submit(id, seg.wav, { durationMs: seg.durationMs, peak: seg.peak, rms: seg.rms, index: seg.index, final: false })
      }
    })

    const offCmd = api().recorder.onCommand(async (cmd) => {
      const rec = recorder.current!
      if (cmd.type === 'start') {
        session.current = cmd.sessionId
        try {
          await rec.start({ deviceId: cmd.deviceId, gain: cmd.gain, autoStopOnSilence: cmd.autoStopOnSilence, silenceTimeoutSec: cmd.silenceTimeoutSec, live: cmd.live })
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
          await api().recorder.submit(cmd.sessionId, r.wav, { durationMs: r.durationMs, peak: r.peak, rms: r.rms, index: r.index, final: true })
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
  const selecting = phase === 'selecting'
  const now = useNow(recording || selecting, selecting ? 50 : 250)
  const elapsed = state?.startedAt ? Math.max(0, now - state.startedAt) : 0
  const remaining = state ? Math.max(0, state.maxDurationSec * 1000 - elapsed) : 0
  const mm = Math.floor(elapsed / 60000)
  const ss = Math.floor((elapsed % 60000) / 1000)
  const busy = phase === 'processing' || phase === 'correcting' || phase === 'inserting'
  const pos = settings?.voice.widgetPosition ?? 'top'
  const live = recording && !!state?.liveText
  const pickLeft = selecting && state?.pickDeadline ? Math.max(0, state.pickDeadline - now) : 0
  const pickTotal = (state?.pickSeconds ?? 2) * 1000
  const height = selecting ? 132 : live ? 100 : 50
  const hotkey = settings ? formatBinding(settings.voice.hotkeys.dictate, navigator.userAgent.includes('Mac') ? 'darwin' : 'win32') : 'F12'

  const statusText =
    phase === 'error' && state?.errorCode ? t(`errors.${state.errorCode}`) : phase === 'success' && state?.message === 'insert-failed' ? t('overlay.pasteManually') : t(`status.${phase}`)

  return (
    <AnimatePresence>
      {phase !== 'idle' && (
        <motion.div
          key="island"
          className="vf-island"
          data-pos={pos}
          initial={{ opacity: 0, scale: 0.6, width: 120, height: 50, y: pos === 'top' ? -20 : 20 }}
          animate={{ opacity: 1, scale: 1, width: WIDTH[phase], height, y: 0 }}
          exit={{ opacity: 0, scale: 0.7, width: 120, height: 50, y: pos === 'top' ? -16 : 16 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.9 }}
          role="status"
          aria-live="polite"
          style={{ flexDirection: 'column', alignItems: 'stretch', padding: 8, gap: 0, borderRadius: height > 50 ? 26 : 999 }}
        >
          <div className="flex h-[34px] shrink-0 items-center gap-2.5">
            <div className="vf-orb" data-phase={selecting ? 'processing' : phase}>
              {recording && <span className="vf-halo" />}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={busy ? 'busy' : phase} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.16 }} className="grid place-items-center">
                  {selecting && <Languages size={16} strokeWidth={2.4} />}
                  {recording && <Mic size={17} strokeWidth={2.4} />}
                  {busy && (phase === 'correcting' ? <Sparkles size={16} /> : <span className="vf-spinner" />)}
                  {phase === 'success' && <Check size={18} strokeWidth={3} />}
                  {phase === 'error' && <AlertTriangle size={16} strokeWidth={2.4} />}
                </motion.span>
              </AnimatePresence>
            </div>

            <div className="min-w-0 flex-1">
              {selecting ? (
                <div className="flex items-baseline justify-between gap-2 pr-1">
                  <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">{t('overlay.chooseLanguage')}</span>
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-white/60">{(pickLeft / 1000).toFixed(1)} s</span>
                </div>
              ) : recording ? (
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
                  {phase === 'success' && state?.copied && (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-white/60" title={t('overlay.copied')}>
                      <Copy size={11} /> {t('overlay.copiedShort')}
                    </span>
                  )}
                </div>
              )}
            </div>

            {recording && (
              <div className="flex shrink-0 items-center gap-1.5">
                {state?.language && <span className="rounded-full bg-white/15 px-1.5 py-[1px] text-[10.5px] font-bold uppercase text-white/85">{state.language}</span>}
                <span className={`font-mono text-[13px] font-medium tabular-nums ${remaining < 10000 ? 'text-[#ff453a]' : 'text-white/70'}`}>
                  {mm}:{String(ss).padStart(2, '0')}
                </span>
              </div>
            )}
            {(recording || busy || selecting) && (
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
          </div>

          {selecting && state && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex flex-col gap-2 px-1">
              <div className="flex gap-1.5">
                {state.pickLanguages.map((code, i) => {
                  const on = i === state.pickIndex
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => void api().dictation.pick(i)}
                      className={`relative flex h-[36px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-semibold transition-colors ${on ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/18'}`}
                    >
                      <span className={`text-[10px] font-bold uppercase ${on ? 'text-black/45' : 'text-white/40'}`}>{i + 1}</span>
                      <span className="truncate">{languageLabel(code)}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/12">
                  <div className="h-full rounded-full bg-[#0a84ff]" style={{ width: `${Math.min(100, (pickLeft / pickTotal) * 100)}%` }} />
                </div>
                <span className="shrink-0 text-[10.5px] font-medium text-white/50">{t('overlay.pickHint', { key: hotkey })}</span>
              </div>
            </motion.div>
          )}

          {live && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1.5 line-clamp-2 px-1.5 text-[12.5px] leading-snug text-white/85" dir="auto">
              {state!.liveText}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
