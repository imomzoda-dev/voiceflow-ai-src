/**
 * Debounced autosave with a crash-recovery journal:
 *  - every change marks the doc dirty and (throttled) writes a draft to localStorage;
 *  - 900 ms after the last change the JSON is saved through IPC (one transaction);
 *  - failures keep the draft and retry with backoff;
 *  - on unmount / app quit pending changes are flushed.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { api } from '@/lib/utils'
import { registerFlusher } from './flush-registry'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

const DRAFT_PREFIX = 'vf.draft.'

export function readDraft(docId: string): { content: unknown; at: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + docId)
    return raw ? (JSON.parse(raw) as { content: unknown; at: number }) : null
  } catch {
    return null
  }
}

export function clearDraft(docId: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + docId)
  } catch {
    /* ignore */
  }
}

function writeDraft(docId: string, content: unknown) {
  try {
    localStorage.setItem(DRAFT_PREFIX + docId, JSON.stringify({ content, at: Date.now() }))
  } catch {
    /* quota or disabled storage: autosave still works */
  }
}

export function useAutosave(docId: string, editor: Editor | null, delay = 900) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<void> | null>(null)
  const retries = useRef(0)

  const save = useCallback(async (): Promise<void> => {
    if (!editor || editor.isDestroyed || !dirty.current) return
    // Snapshot synchronously: the editor may be destroyed while we await an in-flight save.
    const content = editor.getJSON()
    const contentText = editor.getText({ blockSeparator: '\n' })
    const words = editor.storage.characterCount?.words?.() as number | undefined
    dirty.current = false
    if (inflight.current) await inflight.current
    setStatus('saving')
    const p = api()
      .documents.update(docId, { content, contentText, wordCount: words })
      .then(() => {
        retries.current = 0
        if (!dirty.current) {
          setStatus('saved')
          clearDraft(docId)
        }
      })
      .catch(() => {
        dirty.current = true
        setStatus('error')
        const backoff = Math.min(30_000, 2000 * 2 ** retries.current++)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(), backoff)
      })
      .finally(() => {
        inflight.current = null
      })
    inflight.current = p
    await p
  }, [docId, editor])

  const markDirty = useCallback(() => {
    dirty.current = true
    setStatus((s) => (s === 'error' ? s : 'dirty'))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), delay)
    if (!draftTimer.current && editor) {
      draftTimer.current = setTimeout(() => {
        draftTimer.current = null
        if (editor && !editor.isDestroyed && dirty.current) writeDraft(docId, editor.getJSON())
      }, 300)
    }
  }, [delay, docId, editor, save])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    await save()
  }, [save])

  useEffect(() => {
    if (!editor) return
    const onUpdate = ({ transaction }: { transaction: { docChanged: boolean; getMeta(k: string): unknown } }) => {
      if (transaction.docChanged && !transaction.getMeta('vf-load')) markDirty()
    }
    editor.on('update', onUpdate)
    const unregister = registerFlusher(flush)
    const onHide = () => void flush()
    window.addEventListener('beforeunload', onHide)
    return () => {
      editor.off('update', onUpdate)
      unregister()
      window.removeEventListener('beforeunload', onHide)
      if (draftTimer.current) clearTimeout(draftTimer.current)
      void flush()
    }
  }, [editor, flush, markDirty])

  return { status, flush, markDirty }
}
