import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Highlighter, Baseline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Quote, Code2, Link2, ImagePlus, Table2, Minus, ChevronDown, Rows3, Columns3, Trash2, Heading
} from 'lucide-react'
import { cn, api, errorMessage } from '@/lib/utils'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tooltip, Popover, Dialog } from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { toast } from '@/stores'

const COLORS = ['#17171c', '#5f6070', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed']
const HIGHLIGHTS = ['#fff59d', '#c8f7c5', '#cfe3ff', '#ffd6e7', '#ffe0b2', '#e9d5ff']
const SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px']

function TB({ active, disabled, onClick, label, shortcut, children }: { active?: boolean; disabled?: boolean; onClick: () => void; label: string; shortcut?: string; children: ReactNode }) {
  return (
    <Tooltip content={shortcut ? `${label} · ${shortcut}` : label}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        className={cn('grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] text-fg/80 transition hover:bg-fill hover:text-fg disabled:opacity-30', active && 'bg-accent text-accent-fg hover:bg-accent hover:text-accent-fg')}
      >
        {children}
      </button>
    </Tooltip>
  )
}

const Sep = () => <span className="mx-1.5 h-5 w-px shrink-0 bg-border-strong" />

export function EditorToolbar({ editor, trailing }: { editor: Editor; trailing?: ReactNode }) {
  const { t } = useTranslation()
  const mod = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl'
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      align: (['left', 'center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      fontSize: (e.getAttributes('textStyle').fontSize as string | undefined) ?? '',
      color: (e.getAttributes('textStyle').color as string | undefined) ?? '',
      canUndo: e.can().undo(),
      canRedo: e.can().redo()
    })
  })

  const c = () => editor.chain().focus()
  const blockLabel = s.h1 ? t('editor.heading1') : s.h2 ? t('editor.heading2') : s.h3 ? t('editor.heading3') : t('editor.paragraph')

  const insertImage = async () => {
    try {
      const img = await api().files.pickImage()
      if (img) c().setImage({ src: img.dataUrl, alt: img.name }).run()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const applyLink = () => {
    const url = linkValue.trim()
    if (!url) c().extendMarkRange('link').unsetLink().run()
    else if (/^(https?:\/\/|mailto:)/i.test(url)) c().extendMarkRange('link').setLink({ href: url }).run()
    else c().extendMarkRange('link').setLink({ href: `https://${url}` }).run()
    setLinkOpen(false)
  }

  return (
    <div className="material hairline-b relative z-[5] flex min-h-[46px] items-center gap-0.5 overflow-x-auto px-3 py-1.5" role="toolbar" aria-label="Formatting">
      <TB label={t('editor.undo')} shortcut={`${mod}+Z`} disabled={!s.canUndo} onClick={() => c().undo().run()}>
        <Undo2 size={15} />
      </TB>
      <TB label={t('editor.redo')} shortcut={`${mod}+Shift+Z`} disabled={!s.canRedo} onClick={() => c().redo().run()}>
        <Redo2 size={15} />
      </TB>
      <Sep />
      <Menu>
        <MenuTrigger asChild>
          <button onMouseDown={(e) => e.preventDefault()} className="flex h-7 min-w-[118px] items-center justify-between gap-1 rounded-[7px] px-2 text-[12.5px] font-medium text-fg hover:bg-surface-2">
            <span className="flex items-center gap-1.5 truncate">
              <Heading size={14} className="text-muted" />
              {blockLabel}
            </span>
            <ChevronDown size={13} className="text-subtle" />
          </button>
        </MenuTrigger>
        <MenuContent returnFocus={false} align="start">
          <MenuItem onSelect={() => c().setParagraph().run()} shortcut={`${mod}+Alt+0`}>
            {t('editor.paragraph')}
          </MenuItem>
          <MenuItem onSelect={() => c().toggleHeading({ level: 1 }).run()} shortcut={`${mod}+Alt+1`}>
            <span className="text-[17px] font-bold">{t('editor.heading1')}</span>
          </MenuItem>
          <MenuItem onSelect={() => c().toggleHeading({ level: 2 }).run()} shortcut={`${mod}+Alt+2`}>
            <span className="text-[15px] font-semibold">{t('editor.heading2')}</span>
          </MenuItem>
          <MenuItem onSelect={() => c().toggleHeading({ level: 3 }).run()} shortcut={`${mod}+Alt+3`}>
            <span className="text-[13.5px] font-semibold">{t('editor.heading3')}</span>
          </MenuItem>
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger asChild>
          <button onMouseDown={(e) => e.preventDefault()} className="flex h-7 w-[62px] items-center justify-between rounded-[7px] px-2 text-[12.5px] tabular-nums text-fg hover:bg-surface-2" aria-label={t('editor.fontSize')}>
            {s.fontSize ? s.fontSize.replace('px', '') : '16'}
            <ChevronDown size={13} className="text-subtle" />
          </button>
        </MenuTrigger>
        <MenuContent returnFocus={false} align="start" className="min-w-[90px]">
          <MenuItem onSelect={() => c().unsetFontSize().run()}>{t('common.default')}</MenuItem>
          {SIZES.map((sz) => (
            <MenuItem key={sz} onSelect={() => c().setFontSize(sz).run()}>
              {sz.replace('px', '')}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <Sep />
      <TB label={t('editor.bold')} shortcut={`${mod}+B`} active={s.bold} onClick={() => c().toggleBold().run()}>
        <Bold size={15} />
      </TB>
      <TB label={t('editor.italic')} shortcut={`${mod}+I`} active={s.italic} onClick={() => c().toggleItalic().run()}>
        <Italic size={15} />
      </TB>
      <TB label={t('editor.underline')} shortcut={`${mod}+U`} active={s.underline} onClick={() => c().toggleUnderline().run()}>
        <Underline size={15} />
      </TB>
      <TB label={t('editor.strike')} shortcut={`${mod}+Shift+S`} active={s.strike} onClick={() => c().toggleStrike().run()}>
        <Strikethrough size={15} />
      </TB>
      <Popover
        trigger={
          <button onMouseDown={(e) => e.preventDefault()} aria-label={t('editor.highlight')} className={cn('grid h-7 w-7 place-items-center rounded-[7px] text-muted hover:bg-surface-2 hover:text-fg', s.highlight && 'bg-accent-soft text-accent')}>
            <Highlighter size={15} />
          </button>
        }
      >
        <div className="flex gap-1.5">
          {HIGHLIGHTS.map((h) => (
            <button key={h} className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: h }} onClick={() => c().toggleHighlight({ color: h }).run()} aria-label={h} />
          ))}
          <button className="grid h-6 w-6 place-items-center rounded-full text-[11px] text-muted ring-1 ring-border" onClick={() => c().unsetHighlight().run()} aria-label={t('common.none')}>
            ∅
          </button>
        </div>
      </Popover>
      <Popover
        trigger={
          <button onMouseDown={(e) => e.preventDefault()} aria-label={t('editor.textColor')} className="grid h-7 w-7 place-items-center rounded-[7px] text-muted hover:bg-surface-2 hover:text-fg">
            <Baseline size={15} style={s.color ? { color: s.color } : undefined} />
          </button>
        }
      >
        <div className="flex gap-1.5">
          {COLORS.map((col) => (
            <button key={col} className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: col }} onClick={() => c().setColor(col).run()} aria-label={col} />
          ))}
          <button className="grid h-6 px-2 text-[11px] text-muted ring-1 ring-border rounded-full" onClick={() => c().unsetColor().run()}>
            {t('editor.defaultColor')}
          </button>
        </div>
      </Popover>
      <Sep />
      <TB label={t('editor.alignLeft')} active={s.align === 'left'} onClick={() => c().setTextAlign('left').run()}>
        <AlignLeft size={15} />
      </TB>
      <TB label={t('editor.alignCenter')} active={s.align === 'center'} onClick={() => c().setTextAlign('center').run()}>
        <AlignCenter size={15} />
      </TB>
      <TB label={t('editor.alignRight')} active={s.align === 'right'} onClick={() => c().setTextAlign('right').run()}>
        <AlignRight size={15} />
      </TB>
      <TB label={t('editor.justify')} active={s.align === 'justify'} onClick={() => c().setTextAlign('justify').run()}>
        <AlignJustify size={15} />
      </TB>
      <Sep />
      <TB label={t('editor.bulletList')} shortcut={`${mod}+Shift+8`} active={s.bullet} onClick={() => c().toggleBulletList().run()}>
        <List size={15} />
      </TB>
      <TB label={t('editor.orderedList')} shortcut={`${mod}+Shift+7`} active={s.ordered} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered size={15} />
      </TB>
      <TB label={t('editor.quote')} shortcut={`${mod}+Shift+B`} active={s.quote} onClick={() => c().toggleBlockquote().run()}>
        <Quote size={15} />
      </TB>
      <TB label={t('editor.codeBlock')} shortcut={`${mod}+Alt+C`} active={s.code} onClick={() => c().toggleCodeBlock().run()}>
        <Code2 size={15} />
      </TB>
      <Sep />
      <TB
        label={t('editor.link')}
        shortcut={`${mod}+K`}
        active={s.link}
        onClick={() => {
          setLinkValue((editor.getAttributes('link').href as string | undefined) ?? '')
          setLinkOpen(true)
        }}
      >
        <Link2 size={15} />
      </TB>
      <TB label={t('editor.image')} onClick={() => void insertImage()}>
        <ImagePlus size={15} />
      </TB>
      <Menu>
        <MenuTrigger asChild>
          <button onMouseDown={(e) => e.preventDefault()} aria-label={t('editor.table')} className={cn('flex h-7 items-center gap-0.5 rounded-[7px] px-1.5 text-muted hover:bg-surface-2 hover:text-fg', s.table && 'bg-accent-soft text-accent')}>
            <Table2 size={15} />
            <ChevronDown size={12} />
          </button>
        </MenuTrigger>
        <MenuContent returnFocus={false} align="start">
          <MenuItem onSelect={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            <Table2 size={14} /> {t('editor.insertTable')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled={!s.table} onSelect={() => c().addRowAfter().run()}>
            <Rows3 size={14} /> {t('editor.addRowAfter')}
          </MenuItem>
          <MenuItem disabled={!s.table} onSelect={() => c().addColumnAfter().run()}>
            <Columns3 size={14} /> {t('editor.addColumnAfter')}
          </MenuItem>
          <MenuItem disabled={!s.table} onSelect={() => c().toggleHeaderRow().run()}>
            <Heading size={14} /> {t('editor.toggleHeaderRow')}
          </MenuItem>
          <MenuItem disabled={!s.table} onSelect={() => c().deleteRow().run()}>
            <Rows3 size={14} /> {t('editor.deleteRow')}
          </MenuItem>
          <MenuItem disabled={!s.table} onSelect={() => c().deleteColumn().run()}>
            <Columns3 size={14} /> {t('editor.deleteColumn')}
          </MenuItem>
          <MenuItem danger disabled={!s.table} onSelect={() => c().deleteTable().run()}>
            <Trash2 size={14} /> {t('editor.deleteTable')}
          </MenuItem>
        </MenuContent>
      </Menu>
      <TB label={t('editor.divider')} onClick={() => c().setHorizontalRule().run()}>
        <Minus size={15} />
      </TB>
      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">{trailing}</div>

      <Dialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title={t('editor.link')}
        footer={
          <>
            {s.link && (
              <Button
                variant="danger-ghost"
                onClick={() => {
                  c().extendMarkRange('link').unsetLink().run()
                  setLinkOpen(false)
                }}
              >
                {t('editor.removeLink')}
              </Button>
            )}
            <Button onClick={() => setLinkOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={applyLink}>
              {t('common.apply')}
            </Button>
          </>
        }
      >
        <Input autoFocus value={linkValue} placeholder={t('editor.linkPrompt')} onChange={(e) => setLinkValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyLink()} />
      </Dialog>
    </div>
  )
}
