import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Save } from 'lucide-react'
import type { DocumentVersion } from '@shared/types'
import { Dialog } from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/misc'
import { DiffView } from '@/components/common/DiffView'
import { api, cn, formatDateTime } from '@/lib/utils'

export function VersionsDialog({ open, onOpenChange, docId, currentText, onRestore, onSnapshot }: { open: boolean; onOpenChange: (o: boolean) => void; docId: string; currentText: string; onRestore: (versionId: string) => Promise<void>; onSnapshot: () => Promise<void> }) {
  const { t, i18n } = useTranslation()
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedText, setSelectedText] = useState('')

  const load = () => void api().documents.versions(docId).then((v) => {
    setVersions(v)
    setSelected((s) => s ?? v[0]?.id ?? null)
  })

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docId])

  useEffect(() => {
    if (!selected) return setSelectedText('')
    void api().documents.versionContent(selected).then((c) => setSelectedText(c?.contentText ?? ''))
  }, [selected])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editor.versionsTitle')}
      className="w-[min(860px,94vw)]"
      footer={
        <>
          <Button
            onClick={async () => {
              await onSnapshot()
              load()
            }}
          >
            <Save size={14} /> {t('editor.snapshotNow')}
          </Button>
          <Button variant="primary" disabled={!selected} onClick={() => selected && void onRestore(selected).then(() => onOpenChange(false))}>
            {t('editor.restoreVersion')}
          </Button>
        </>
      }
    >
      {versions.length === 0 ? (
        <EmptyState icon={History} title={t('editor.noVersions')} className="py-8" />
      ) : (
        <div className="flex h-[52vh] gap-4">
          <div className="w-[230px] shrink-0 overflow-y-auto pr-1">
            {versions.map((v) => (
              <button key={v.id} onClick={() => setSelected(v.id)} className={cn('mb-1 w-full rounded-[9px] px-3 py-2 text-left transition', selected === v.id ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                <div className="text-[12.5px] font-medium text-fg">{formatDateTime(v.createdAt, i18n.language)}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Badge>{t(`editor.versionReason.${v.reason}`)}</Badge>
                  <span className="text-[11px] text-subtle">{t('common.words', { count: v.wordCount })}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto rounded-[10px] border border-border bg-bg p-4">
            <DiffView before={selectedText} after={currentText} />
          </div>
        </div>
      )}
    </Dialog>
  )
}
