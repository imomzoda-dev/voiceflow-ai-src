import { useTranslation } from 'react-i18next'
import { Mic, Accessibility, Keyboard } from 'lucide-react'
import type { PermissionKind, PermissionStatus } from '@shared/types'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/utils'

const ICONS = { microphone: Mic, accessibility: Accessibility, 'input-monitoring': Keyboard }
const WHY: Record<PermissionKind, string> = { microphone: 'permissions.microphoneWhy', accessibility: 'permissions.accessibilityWhy', 'input-monitoring': 'permissions.inputMonitoringWhy' }

export function PermissionsList({ perms, onChange }: { perms: Record<PermissionKind, PermissionStatus>; onChange: (p: Record<PermissionKind, PermissionStatus>) => void }) {
  const { t } = useTranslation()
  const kinds = (Object.keys(perms) as PermissionKind[]).filter((k) => perms[k] !== 'not-required')
  return (
    <div className="flex flex-col gap-2">
      {kinds.map((k) => {
        const Icon = ICONS[k]
        const st = perms[k]
        return (
          <div key={k} className="flex items-center gap-3 rounded-[10px] border border-border px-3 py-2.5">
            <Icon size={16} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
                {t(`permissions.${k}`)}
                <Badge tone={st === 'granted' ? 'success' : st === 'unknown' ? 'neutral' : 'warning'}>{t(`permissions.${st}`)}</Badge>
              </div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{t(WHY[k])}</div>
            </div>
            {st !== 'granted' && (
              <Button
                size="sm"
                onClick={async () => {
                  if (st === 'denied' && k === 'microphone') await api().system.openPermissionSettings(k)
                  else await api().system.requestPermission(k)
                  onChange(await api().system.permissions())
                }}
              >
                {st === 'denied' ? t('permissions.openSettings') : t('permissions.request')}
              </Button>
            )}
          </div>
        )
      })}
      {kinds.length === 0 && <div className="text-[12.5px] text-muted">{t('permissions.not-required')}</div>}
    </div>
  )
}
