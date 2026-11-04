/**
 * Sidebar update card. Appears as soon as a new version is on GitHub: Update → download progress
 * → integrity check → "Restart and update". Errors during an update offer a retry.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpCircle, Loader2, RotateCw, ShieldCheck, X, AlertTriangle, FileText } from 'lucide-react'
import type { UpdateState } from '@shared/types'
import { api, cn, formatBytes } from '@/lib/utils'
import { Tooltip, Dialog } from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'

export const useUpdates = create<{ state: UpdateState | null; set: (s: UpdateState) => void }>((set) => ({ state: null, set: (state) => set({ state }) }))

/** Subscribes once (App) to the main-process update state. */
export function useUpdateSubscription() {
  useEffect(() => {
    void api().updates.get().then((s) => useUpdates.getState().set(s))
    return api().updates.onState((s) => useUpdates.getState().set(s))
  }, [])
}

const VISIBLE: UpdateState['phase'][] = ['available', 'downloading', 'verifying', 'downloaded', 'installing', 'error']

export function UpdateCard({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const s = useUpdates((x) => x.state)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const errorDuringUpdate = s?.phase === 'error' && !!s.version && s.version !== s.currentVersion
  const visible = !!s && VISIBLE.includes(s.phase) && (s.phase !== 'error' || errorDuringUpdate) && !(s.phase === 'available' && dismissed === s.version)
  const pct = Math.round(s?.percent ?? 0)

  const primary = () => {
    if (!s) return
    if (s.phase === 'available' || s.phase === 'error') void api().updates.download()
    else if (s.phase === 'downloaded') void api().updates.install()
  }

  if (collapsed) {
    if (!visible || !s) return null
    const icon = s.phase === 'downloading' ? <Loader2 size={18} className="animate-spin" /> : s.phase === 'verifying' ? <ShieldCheck size={18} className="animate-pulse" /> : s.phase === 'downloaded' ? <RotateCw size={18} /> : s.phase === 'error' ? <AlertTriangle size={18} /> : <ArrowUpCircle size={18} />
    return (
      <Tooltip content={s.phase === 'downloaded' ? t('update.restart') : t('update.available', { version: s.version })} side="right">
        <button onClick={primary} className="no-drag mx-auto grid h-10 w-10 place-items-center rounded-full bg-success text-white shadow-[0_6px_16px_-6px_rgba(52,199,89,0.7)]" aria-label={t('update.available', { version: s.version })}>
          {icon}
        </button>
      </Tooltip>
    )
  }

  return (
    <>
      <AnimatePresence initial={false}>
        {visible && s && (
          <motion.div initial={{ opacity: 0, height: 0, y: 10 }} animate={{ opacity: 1, height: 'auto', y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }} className="no-drag overflow-hidden">
            <div className="relative mb-1 rounded-[16px] bg-surface p-3 shadow-card" data-testid="update-card">
              {s.phase === 'available' && (
                <button className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-subtle hover:bg-fill hover:text-fg" onClick={() => setDismissed(s.version ?? null)} aria-label={t('common.close')}>
                  <X size={13} strokeWidth={2.6} />
                </button>
              )}
              <div className="flex items-center gap-2.5 pr-5">
                <span className={cn('grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] text-white', s.phase === 'error' ? 'bg-warning' : 'bg-success')}>
                  {s.phase === 'error' ? <AlertTriangle size={16} /> : s.phase === 'downloading' ? <Loader2 size={16} className="animate-spin" /> : s.phase === 'verifying' ? <ShieldCheck size={16} /> : s.phase === 'downloaded' || s.phase === 'installing' ? <RotateCw size={16} /> : <ArrowUpCircle size={17} />}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-fg">
                    {s.phase === 'downloaded' || s.phase === 'installing' ? t('update.readyTitle') : s.phase === 'error' ? t('update.errorTitle') : t('update.available', { version: s.version })}
                  </div>
                  <div className="truncate text-[11.5px] text-muted">
                    {s.phase === 'downloading'
                      ? `${pct}% · ${formatBytes(s.transferred)}${s.total ? ` / ${formatBytes(s.total)}` : ''}`
                      : s.phase === 'verifying'
                        ? t('update.verifying')
                        : s.phase === 'error'
                          ? s.error
                          : `${s.currentVersion} → ${s.version}`}
                  </div>
                </div>
              </div>
              {s.phase === 'downloading' && (
                <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-fill-strong">
                  <motion.div className="h-full rounded-full bg-success" animate={{ width: `${Math.max(3, pct)}%` }} transition={{ ease: 'linear', duration: 0.25 }} />
                </div>
              )}
              <div className="mt-2.5 flex gap-1.5">
                {s.phase === 'downloading' ? (
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => void api().updates.cancel()}>
                    {t('common.cancel')}
                  </Button>
                ) : s.phase === 'verifying' || s.phase === 'installing' ? (
                  <Button size="sm" variant="secondary" className="flex-1" disabled loading>
                    {s.phase === 'installing' ? t('update.installing') : t('update.verifying')}
                  </Button>
                ) : (
                  <Button size="sm" className="flex-1 bg-success text-white hover:brightness-110" onClick={primary}>
                    {s.phase === 'downloaded' ? t('update.restart') : s.phase === 'error' ? t('common.retry') : t('update.update')}
                  </Button>
                )}
                {(s.phase === 'available' || s.phase === 'downloaded') && (
                  <Button size="sm" variant="secondary" onClick={() => setNotesOpen(true)} aria-label={t('update.whatsNew')}>
                    <FileText size={13} />
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <WhatsNewDialog open={notesOpen} onOpenChange={setNotesOpen} state={s} />
    </>
  )
}

export function WhatsNewDialog({ open, onOpenChange, state }: { open: boolean; onOpenChange: (o: boolean) => void; state: UpdateState | null }) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={state?.releaseName ?? t('update.whatsNew')}
      footer={
        <>
          {state?.releaseUrl && (
            <Button variant="ghost" onClick={() => void api().system.openExternal(state.releaseUrl!)}>
              GitHub
            </Button>
          )}
          {state?.phase === 'available' && (
            <Button
              className="bg-success text-white"
              onClick={() => {
                onOpenChange(false)
                void api().updates.download()
              }}
            >
              {t('update.update')}
            </Button>
          )}
          {state?.phase === 'downloaded' && (
            <Button className="bg-success text-white" onClick={() => void api().updates.install()}>
              {t('update.restart')}
            </Button>
          )}
        </>
      }
    >
      <div className="selectable whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">{state?.releaseNotes?.split(/\n## /)[0] || t('update.noNotes')}</div>
    </Dialog>
  )
}
