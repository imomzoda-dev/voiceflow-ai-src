import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { EditorContent, useEditor } from '@tiptap/react'
import { ArrowLeft, Check, CloudOff, Download, History, Loader2, MoreHorizontal, Sparkles, Star, LayoutTemplate, FileUp, AlertTriangle, Wand2, Languages, Briefcase, Minimize2, Scissors, Copy, ClipboardPaste } from 'lucide-react'
import type { DocumentRecord, ExportFormat } from '@shared/types'
import type { AiCommand } from '@shared/voice-commands'
import { formatBinding } from '@shared/hotkeys'
import { api, errorMessage } from '@/lib/utils'
import { useDictation, useSettings, useUi, toast } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { ContextContent, ContextItem, ContextMenu, ContextSeparator, ContextSub, ContextTrigger, Dialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tooltip } from '@/components/ui/overlays'
import { EmptyState } from '@/components/ui/misc'
import { EditorToolbar } from '@/components/toolbar/EditorToolbar'
import { DictationButton } from '@/components/voice/DictationButton'
import { baseExtensions, htmlToDoc } from '@/components/editor/extensions'
import { AiPanel, type AiPanelHandle } from '@/components/editor/AiPanel'
import { VersionsDialog } from '@/components/editor/VersionsDialog'
import { insertDictation, lastParagraphRange, runEditorCommand } from '@/components/editor/editor-commands'
import { htmlToMarkdown } from '@/components/editor/markdown'
import { clearDraft, readDraft, useAutosave } from '@/features/document-management/useAutosave'

const AI_COMMAND_ACTION: Record<AiCommand, { action: Parameters<AiPanelHandle['run']>[0]; lang?: string; lastParagraph?: boolean }> = {
  fixLastParagraph: { action: 'fix', lastParagraph: true },
  rewriteProfessional: { action: 'professional' },
  shorten: { action: 'shorten' },
  expand: { action: 'expand' },
  translateEn: { action: 'translate', lang: 'en' },
  translateRu: { action: 'translate', lang: 'ru' },
  translateTg: { action: 'translate', lang: 'tg' },
  summarize: { action: 'summarize' }
}

export function EditorPage({ docId }: { docId: string }) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)!
  const navigate = useUi((s) => s.navigate)
  const phase = useDictation((s) => s.state?.phase ?? 'idle')
  const [doc, setDoc] = useState<DocumentRecord | null | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [recovery, setRecovery] = useState<{ content: unknown; at: number } | null>(null)
  const aiRef = useRef<AiPanelHandle>(null)
  const pendingAi = useRef<{ action: Parameters<AiPanelHandle['run']>[0]; lang?: string; range?: { from: number; to: number } } | null>(null)
  const platform = navigator.userAgent.includes('Mac') ? 'darwin' : 'win32'
  const hotkey = formatBinding(settings.voice.hotkeys.dictate, platform)

  const placeholder = settings.voice.activationMode === 'manual' ? t('editor.placeholderManual') : t('editor.placeholder', { hotkey })
  const extensions = useMemo(() => baseExtensions(placeholder), [placeholder])

  // The editor is (re)created once the document has loaded, so the initial content is not an undo step.
  const editor = useEditor(
    {
      extensions,
      content: doc ? (doc.content as object) : null,
      editable: !!doc,
      autofocus: doc ? 'end' : false,
      // Each paragraph gets dir="auto": Persian, Arabic, Hebrew or Urdu lines read right-to-left, others left-to-right.
      textDirection: 'auto',
      editorProps: { attributes: { class: 'vf-prose', spellcheck: 'true' } },
      onFocus: () => api().dictation.setEditorFocus(true),
      onBlur: () => api().dictation.setEditorFocus(false)
    },
    [extensions, doc?.id]
  )

  const { status, flush } = useAutosave(docId, editor)

  // Load document
  useEffect(() => {
    let cancelled = false
    void api()
      .documents.get(docId)
      .then((d) => {
        if (cancelled) return
        setDoc(d)
        if (!d) return
        setTitle(d.title)
        void api().documents.markOpened(docId)
        const draft = readDraft(docId)
        if (draft && draft.at > d.updatedAt + 500) setRecovery(draft)
        else if (draft) clearDraft(docId)
      })
    return () => {
      cancelled = true
    }
  }, [docId])

  useEffect(() => () => api().dictation.setEditorFocus(false), [])

  // Title autosave
  useEffect(() => {
    if (!doc || title === doc.title) return
    const h = setTimeout(() => void api().documents.update(docId, { title: title.trim() || t('documents.untitled') }), 500)
    return () => clearTimeout(h)
  }, [title, doc, docId, t])

  const saveNow = useCallback(async () => {
    await flush()
    await api().documents.snapshot(docId, 'manual')
    toast.success(t('editor.saved'))
  }, [docId, flush, t])

  // Ctrl/Cmd+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveNow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveNow])

  const runAi = useCallback((action: Parameters<AiPanelHandle['run']>[0], opts?: { lang?: string; range?: { from: number; to: number } }) => {
    if (aiRef.current) aiRef.current.run(action, { targetLanguage: opts?.lang, range: opts?.range })
    else {
      pendingAi.current = { action, lang: opts?.lang, range: opts?.range }
      setAiOpen(true)
    }
  }, [])

  useEffect(() => {
    if (aiOpen && aiRef.current && pendingAi.current) {
      const p = pendingAi.current
      pendingAi.current = null
      aiRef.current.run(p.action, { targetLanguage: p.lang, range: p.range })
    }
  })

  // Dictation → editor
  useEffect(() => {
    if (!editor) return
    const offInsert = api().dictation.onEditorInsert(({ text }) => {
      if (!editor.isDestroyed) insertDictation(editor, text)
    })
    const offCmd = api().dictation.onEditorCommand(({ command }) => {
      if (editor.isDestroyed) return
      if (command.kind === 'editor') {
        runEditorCommand(editor, command.command, () => void saveNow())
        toast.info(t('editor.voiceCommandDone', { name: t(`commands.${command.command}`) }))
      } else {
        const map = AI_COMMAND_ACTION[command.command]
        const range = map.lastParagraph ? (lastParagraphRange(editor) ?? undefined) : undefined
        if (range) editor.commands.setTextSelection(range)
        runAi(map.action, { lang: map.lang, range })
      }
    })
    return () => {
      offInsert()
      offCmd()
    }
  }, [editor, runAi, saveNow, t])

  const exportAs = async (format: ExportFormat) => {
    if (!editor) return
    await flush()
    const html = editor.getHTML()
    const res = await api().files.exportDocument({
      format,
      title: title || t('documents.untitled'),
      content: editor.getJSON(),
      html,
      markdown: format === 'md' ? htmlToMarkdown(html) : undefined,
      text: format === 'txt' ? editor.getText({ blockSeparator: '\n\n' }) : undefined
    })
    if (res.ok) toast.success(t('editor.exported', { path: res.path }))
    else if (!res.cancelled) toast.error(`${t('editor.exportFailed')}: ${res.error ?? ''}`)
  }

  const importInto = async () => {
    try {
      const imp = await api().files.importDocument()
      if (!imp || !editor) return
      await api().documents.snapshot(docId, 'import')
      editor.chain().focus().insertContent(htmlToDoc(imp.html) as object).run()
      toast.success(t('documents.imported'))
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  if (doc === null) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('editor.notFound')}
        action={
          <Button onClick={() => navigate('documents')}>
            <ArrowLeft size={14} /> {t('editor.backToDocuments')}
          </Button>
        }
        className="h-full"
      />
    )
  }

  const words = editor?.storage.characterCount?.words?.() ?? 0
  const chars = editor?.storage.characterCount?.characters?.() ?? 0

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="drag-region material hairline-b relative z-10 flex h-[54px] shrink-0 items-center gap-2 px-3">
          <Tooltip content={t('editor.backToDocuments')}>
            <Button variant="ghost" size="icon" className="no-drag" onClick={() => navigate('documents')} aria-label={t('editor.backToDocuments')}>
              <ArrowLeft size={16} />
            </Button>
          </Tooltip>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('editor.titlePlaceholder')}
            className="no-drag h-8 min-w-0 flex-1 rounded-[8px] bg-transparent px-2 font-display text-[17px] font-semibold tracking-[-0.015em] text-fg outline-none placeholder:text-subtle hover:bg-fill focus:bg-fill"
            aria-label={t('editor.titlePlaceholder')}
          />
          <div className="no-drag flex shrink-0 items-center gap-1.5 text-[12px] text-muted" aria-live="polite">
            {status === 'saving' || status === 'dirty' ? (
              <>
                <Loader2 size={13} className="animate-spin" /> {t('editor.saving')}
              </>
            ) : status === 'error' ? (
              <Tooltip content={t('editor.saveErrorHint')}>
                <span className="flex items-center gap-1 text-danger">
                  <CloudOff size={13} /> {t('editor.saveError')}
                </span>
              </Tooltip>
            ) : (
              <>
                <Check size={13} className="text-success" /> {t('editor.saved')}
              </>
            )}
          </div>
          <div className="no-drag ml-2 flex items-center gap-1">
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Download size={14} /> {t('editor.export')}
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => void exportAs('docx')}>{t('editor.exportDocx')}</MenuItem>
                <MenuItem onSelect={() => void exportAs('pdf')}>{t('editor.exportPdf')}</MenuItem>
                <MenuItem onSelect={() => void exportAs('md')}>{t('editor.exportMd')}</MenuItem>
                <MenuItem onSelect={() => void exportAs('txt')}>{t('editor.exportTxt')}</MenuItem>
                <MenuItem onSelect={() => void exportAs('html')}>{t('editor.exportHtml')}</MenuItem>
              </MenuContent>
            </Menu>
            <Tooltip content={t('editor.history')}>
              <Button variant="ghost" size="icon" onClick={() => setVersionsOpen(true)} aria-label={t('editor.history')}>
                <History size={15} />
              </Button>
            </Tooltip>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More">
                  <MoreHorizontal size={16} />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => doc && void api().documents.setFavorite(docId, !doc.isFavorite).then(() => setDoc({ ...doc, isFavorite: !doc.isFavorite }))}>
                  <Star size={14} /> {doc?.isFavorite ? t('documents.unfavorite') : t('documents.favorite')}
                </MenuItem>
                <MenuItem onSelect={() => void importInto()}>
                  <FileUp size={14} /> {t('common.import')}
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    setTemplateName(title)
                    setTemplateOpen(true)
                  }}
                >
                  <LayoutTemplate size={14} /> {t('editor.saveAsTemplate')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={() => void saveNow()} shortcut="Ctrl+S">
                  <Check size={14} /> {t('editor.snapshotNow')}
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button variant={aiOpen ? 'soft' : 'ghost'} size="sm" onClick={() => setAiOpen((o) => !o)}>
              <Sparkles size={14} /> {t('editor.aiAssistant')}
            </Button>
          </div>
        </header>

        {editor && <EditorToolbar editor={editor} trailing={<DictationButton target="editor" className="h-7 px-2.5 text-[12px]" />} />}

        <AnimatePresence>
          {recovery && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-warning/30 bg-warning-soft">
              <div className="flex items-center gap-3 px-4 py-2 text-[12.5px] text-fg">
                <AlertTriangle size={14} className="text-warning" />
                <span className="flex-1">{t('editor.recovered')}</span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    editor?.commands.setContent(recovery.content as object)
                    setRecovery(null)
                  }}
                >
                  {t('editor.recoverRestore')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    clearDraft(docId)
                    setRecovery(null)
                  }}
                >
                  {t('editor.recoverDiscard')}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ContextMenu>
          <ContextTrigger asChild>
            <div className="relative min-h-0 flex-1 overflow-y-auto bg-bg" onClick={(e) => e.target === e.currentTarget && editor?.commands.focus('end')}>
              <div className="mx-auto my-8 min-h-[calc(100%-4rem)] w-[min(820px,calc(100%-48px))] rounded-[14px] bg-page px-[clamp(24px,7%,72px)] py-14 shadow-card" onClick={() => editor && !editor.isFocused && editor.commands.focus()}>
                <EditorContent editor={editor} />
              </div>
              {phase === 'recording' && <div className="pointer-events-none fixed inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-[#ef4444] to-transparent opacity-70" />}
            </div>
          </ContextTrigger>
          <ContextContent>
            <ContextItem onSelect={() => document.execCommand('cut')} shortcut="Ctrl+X">
              <Scissors size={14} /> {t('editor.cut')}
            </ContextItem>
            <ContextItem onSelect={() => document.execCommand('copy')} shortcut="Ctrl+C">
              <Copy size={14} /> {t('common.copy')}
            </ContextItem>
            <ContextItem onSelect={() => void navigator.clipboard.readText().then((txt) => editor && insertDictation(editor, txt))} shortcut="Ctrl+V">
              <ClipboardPaste size={14} /> {t('editor.paste')}
            </ContextItem>
            <ContextSeparator />
            <ContextItem onSelect={() => runAi('fix')}>
              <Wand2 size={14} /> {t('assistant.actions.fix')}
            </ContextItem>
            <ContextItem onSelect={() => runAi('professional')}>
              <Briefcase size={14} /> {t('assistant.actions.professional')}
            </ContextItem>
            <ContextItem onSelect={() => runAi('shorten')}>
              <Minimize2 size={14} /> {t('assistant.actions.shorten')}
            </ContextItem>
            <ContextSub label={t('assistant.actions.translate')} icon={<Languages size={14} />}>
              <ContextItem onSelect={() => runAi('translate', { lang: 'en' })}>English</ContextItem>
              <ContextItem onSelect={() => runAi('translate', { lang: 'ru' })}>Русский</ContextItem>
              <ContextItem onSelect={() => runAi('translate', { lang: 'tg' })}>Тоҷикӣ</ContextItem>
            </ContextSub>
            <ContextItem onSelect={() => runAi('summarize')}>
              <Sparkles size={14} /> {t('assistant.actions.summarize')}
            </ContextItem>
          </ContextContent>
        </ContextMenu>

        <footer className="material hairline-t flex h-7 shrink-0 items-center justify-end gap-4 px-4 text-[11.5px] text-muted">
          <span>{t('editor.words', { count: words })}</span>
          <span>{t('editor.characters', { count: chars })}</span>
        </footer>
      </div>

      <AnimatePresence>{aiOpen && editor && <AiPanel ref={aiRef} editor={editor} docId={docId} onClose={() => setAiOpen(false)} />}</AnimatePresence>

      <VersionsDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        docId={docId}
        currentText={editor?.getText({ blockSeparator: '\n' }) ?? ''}
        onSnapshot={async () => {
          await flush()
          await api().documents.snapshot(docId, 'manual')
        }}
        onRestore={async (vid) => {
          await flush()
          const restored = await api().documents.restoreVersion(vid)
          if (restored && editor) {
            editor.commands.setContent(restored.content as object, { emitUpdate: false })
            toast.success(t('editor.versionRestored'))
          }
        }}
      />

      <Dialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        title={t('editor.saveAsTemplate')}
        footer={
          <>
            <Button onClick={() => setTemplateOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!editor) return
                await api().templates.create({ name: templateName || title, description: '', category: 'custom', content: editor.getJSON() })
                setTemplateOpen(false)
                toast.success(t('editor.templateSaved'))
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Input autoFocus value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder={t('templates.nameLabel')} />
      </Dialog>
    </div>
  )
}
