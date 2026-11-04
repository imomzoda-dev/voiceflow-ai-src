import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { LayoutTemplate, Briefcase, Mail, FileBarChart, Users, GraduationCap, Newspaper, FileSignature, NotebookPen, Presentation, Code2, Trash2, FilePlus2 } from 'lucide-react'
import type { Template } from '@shared/types'
import { api, errorMessage } from '@/lib/utils'
import { useUi, toast } from '@/stores'
import { Badge, PageHeader, SectionTitle } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'

const ICONS: Record<string, typeof LayoutTemplate> = {
  'builtin-business-letter': Briefcase,
  'builtin-email': Mail,
  'builtin-report': FileBarChart,
  'builtin-meeting-notes': Users,
  'builtin-academic-notes': GraduationCap,
  'builtin-article': Newspaper,
  'builtin-application': FileSignature,
  'builtin-personal-notes': NotebookPen,
  'builtin-lesson': Presentation,
  'builtin-project-docs': Code2
}

export function TemplatesPage() {
  const { t } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const [templates, setTemplates] = useState<Template[]>([])

  const load = () => void api().templates.list().then(setTemplates)
  useEffect(load, [])

  const use = async (tpl: Template) => {
    try {
      const name = tpl.isBuiltin ? t(`templates.names.${tpl.id}`, { defaultValue: tpl.name }) : tpl.name
      const d = await api().documents.create({ title: name, templateId: tpl.id })
      toast.success(t('templates.created'))
      navigate({ page: 'editor', docId: d.id })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const card = (tpl: Template, i: number) => {
    const Icon = ICONS[tpl.id] ?? LayoutTemplate
    const name = tpl.isBuiltin ? t(`templates.names.${tpl.id}`, { defaultValue: tpl.name }) : tpl.name
    const desc = tpl.isBuiltin ? t(`templates.descriptions.${tpl.id}`, { defaultValue: tpl.description }) : tpl.description
    return (
      <motion.div key={tpl.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.25) }} className="group flex flex-col rounded-[14px] border border-border bg-surface p-4 shadow-soft transition hover:-translate-y-px hover:shadow-card">
        <div className="mb-3 flex items-start justify-between">
          <div className="grid h-10 w-10 place-items-center rounded-[11px] bg-accent-soft text-accent">
            <Icon size={19} />
          </div>
          <Badge>{t(`templates.categories.${tpl.category}`, { defaultValue: tpl.category })}</Badge>
        </div>
        <div className="text-[14px] font-semibold text-fg">{name}</div>
        <div className="mt-1 line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-muted">{desc}</div>
        <div className="mt-4 flex items-center gap-1.5">
          <Button size="sm" variant="soft" onClick={() => void use(tpl)}>
            <FilePlus2 size={13} /> {t('templates.use')}
          </Button>
          {!tpl.isBuiltin && (
            <Button
              size="icon-sm"
              variant="danger-ghost"
              className="ml-auto opacity-0 group-hover:opacity-100"
              onClick={async () => {
                await api().templates.remove(tpl.id)
                load()
              }}
              aria-label={t('common.delete')}
            >
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </motion.div>
    )
  }

  const builtin = templates.filter((x) => x.isBuiltin)
  const mine = templates.filter((x) => !x.isBuiltin)
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1080px] px-8 pb-12 pt-8">
        <PageHeader title={t('templates.title')} subtitle={t('templates.subtitle')} />
        <SectionTitle>{t('templates.builtin')}</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{builtin.map(card)}</div>
        <SectionTitle className="mt-8">{t('templates.mine')}</SectionTitle>
        {mine.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{mine.map(card)}</div> : <div className="rounded-[12px] border border-dashed border-border-strong px-4 py-6 text-center text-[12.5px] text-muted">{t('templates.emptyMine')}</div>}
      </div>
    </div>
  )
}
