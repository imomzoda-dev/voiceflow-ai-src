import { z } from 'zod'
import { handle, zDocJson, zId, zText } from './guard'
import type { AppContext } from '../main/app-context'

const docQuery = z
  .object({
    search: z.string().max(500).optional(),
    folderId: z.string().max(128).nullable().optional(),
    scope: z.enum(['all', 'favorites', 'trash', 'recent']).optional(),
    sort: z.enum(['updated', 'created', 'title', 'opened']).optional(),
    limit: z.number().int().min(1).max(2000).optional()
  })
  .optional()

const exportReq = z.object({
  format: z.enum(['docx', 'pdf', 'md', 'txt', 'html']),
  title: z.string().max(500),
  content: zDocJson,
  html: zText(60_000_000),
  markdown: zText(20_000_000).optional(),
  text: zText(20_000_000).optional()
})

export function registerDocumentsIpc(ctx: AppContext) {
  const docs = ctx.documents
  handle('documents:list', z.tuple([docQuery]), (_e, q) => docs.list(q ?? {}))
  handle('documents:get', z.tuple([zId]), (_e, id) => docs.get(id))
  handle(
    'documents:create',
    z.tuple([
      z.object({
        title: z.string().max(500).optional(),
        folderId: z.string().max(128).nullable().optional(),
        templateId: z.string().max(128).nullable().optional(),
        content: zDocJson.optional(),
        contentText: zText(20_000_000).optional()
      })
    ]),
    (_e, input) => docs.create(input)
  )
  handle(
    'documents:update',
    z.tuple([zId, z.object({ title: z.string().max(500).optional(), content: zDocJson.optional(), contentText: zText(20_000_000).optional(), wordCount: z.number().int().min(0).optional() })]),
    (_e, id, patch) => docs.update(id, patch)
  )
  handle('documents:duplicate', z.tuple([zId]), (_e, id) => docs.duplicate(id))
  handle('documents:move', z.tuple([zId, z.string().max(128).nullable()]), (_e, id, folderId) => docs.move(id, folderId))
  handle('documents:setFavorite', z.tuple([zId, z.boolean()]), (_e, id, fav) => docs.setFavorite(id, fav))
  handle('documents:trash', z.tuple([zId]), (_e, id) => docs.trash(id))
  handle('documents:restore', z.tuple([zId]), (_e, id) => docs.restore(id))
  handle('documents:deleteForever', z.tuple([zId]), (_e, id) => docs.deleteForever(id))
  handle('documents:emptyTrash', z.tuple([]), () => docs.emptyTrash())
  handle('documents:markOpened', z.tuple([zId]), (_e, id) => docs.markOpened(id))
  handle('documents:snapshot', z.tuple([zId, z.enum(['auto', 'manual', 'restore', 'import', 'ai'])]), (_e, id, reason) => docs.snapshot(id, reason))
  handle('documents:versions', z.tuple([zId]), (_e, id) => docs.versions(id))
  handle('documents:versionContent', z.tuple([zId]), (_e, id) => docs.versionContent(id))
  handle('documents:restoreVersion', z.tuple([zId]), (_e, id) => docs.restoreVersion(id))

  handle('folders:list', z.tuple([]), () => docs.listFolders())
  handle('folders:create', z.tuple([z.string().max(200), z.string().max(128).nullable().optional()]), (_e, name, parent) => docs.createFolder(name, parent ?? null))
  handle('folders:rename', z.tuple([zId, z.string().max(200)]), (_e, id, name) => docs.renameFolder(id, name))
  handle('folders:remove', z.tuple([zId]), (_e, id) => docs.removeFolder(id))

  handle('files:exportDocument', z.tuple([exportReq]), (_e, req) => ctx.files.exportDocument(req))
  handle('files:importDocument', z.tuple([]), () => ctx.files.importDocument())
  handle('files:pickImage', z.tuple([]), () => ctx.files.pickImage())

  handle('templates:list', z.tuple([]), () => ctx.templates.list())
  handle('templates:create', z.tuple([z.object({ name: z.string().max(200), description: z.string().max(2000), category: z.string().max(64), content: zDocJson })]), (_e, t) => ctx.templates.create(t))
  handle(
    'templates:update',
    z.tuple([zId, z.object({ name: z.string().max(200).optional(), description: z.string().max(2000).optional(), category: z.string().max(64).optional(), content: zDocJson.optional() })]),
    (_e, id, t) => ctx.templates.update(id, t)
  )
  handle('templates:remove', z.tuple([zId]), (_e, id) => ctx.templates.remove(id))
}
