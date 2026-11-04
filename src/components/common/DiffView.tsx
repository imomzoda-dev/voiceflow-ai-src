import { useMemo } from 'react'
import { diffWords } from '@shared/diff'
import { cn } from '@/lib/utils'

/** Inline word diff: removed text struck through in red, added text highlighted in green. */
export function DiffView({ before, after, className }: { before: string; after: string; className?: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after])
  return (
    <div className={cn('selectable whitespace-pre-wrap text-[13px] leading-relaxed text-fg', className)}>
      {parts.map((p, i) =>
        p.type === 'same' ? (
          <span key={i}>{p.text}</span>
        ) : p.type === 'added' ? (
          <ins key={i} className="rounded-[3px] bg-success-soft px-px text-success no-underline">
            {p.text}
          </ins>
        ) : (
          <del key={i} className="rounded-[3px] bg-danger-soft px-px text-danger/80">
            {p.text}
          </del>
        )
      )}
    </div>
  )
}
