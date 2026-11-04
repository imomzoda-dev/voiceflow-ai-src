import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, GitCompareArrows } from 'lucide-react'
import type { DictationResult } from '@shared/types'
import { languageLabel } from '@shared/languages'
import { Badge, Card } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { DiffView } from '@/components/common/DiffView'
import { toast } from '@/stores'

export function ResultCard({ result }: { result: DictationResult }) {
  const { t } = useTranslation()
  const [diff, setDiff] = useState(true)
  const tone = result.correctionStatus === 'applied' ? 'success' : result.correctionStatus === 'skipped' ? 'neutral' : 'warning'
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">
          {t('voice.language')}: {languageLabel(result.language)}
        </Badge>
        <Badge>{t(`voice.detectedBy.${result.languageSource}`)}</Badge>
        {result.engineProbability !== undefined && <Badge>{t('voice.engineProbability', { value: Math.round(result.engineProbability * 100) })}</Badge>}
        {result.segments.length > 1 && result.segments.some((s) => s.language !== result.language) && (
          <Badge>{[...new Set(result.segments.map((s) => s.language).filter(Boolean))].map((l) => languageLabel(l)).join(' · ')}</Badge>
        )}
        <Badge tone={tone}>{t(`voice.correctionStatus.${result.correctionStatus}`)}</Badge>
        <div className="ml-auto flex gap-1">
          {result.corrected && result.corrected !== result.original && (
            <Button size="sm" variant={diff ? 'soft' : 'ghost'} onClick={() => setDiff((d) => !d)}>
              <GitCompareArrows size={13} />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(result.final).then(() => toast.success(t('common.copied')))}>
            <Copy size={13} /> {t('voice.copyFinal')}
          </Button>
        </div>
      </div>
      {result.corrected && result.corrected !== result.original && diff ? (
        <DiffView before={result.original} after={result.final} />
      ) : (
        <div className="selectable whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">{result.final}</div>
      )}
      {result.corrected && result.corrected !== result.original && !diff && (
        <details className="mt-3 text-[12.5px] text-muted">
          <summary className="cursor-pointer">{t('voice.original')}</summary>
          <div className="selectable mt-1 whitespace-pre-wrap">{result.original}</div>
        </details>
      )}
    </Card>
  )
}
