/** Built-in document templates (Tiptap JSON). Names are localised in the UI by id. */

type Node = Record<string, unknown>
const t = (text: string, marks?: string[]): Node => (marks ? { type: 'text', text, marks: marks.map((m) => ({ type: m })) } : { type: 'text', text })
const p = (...parts: (string | Node)[]): Node => ({
  type: 'paragraph',
  content: parts.filter((x) => x !== '').map((x) => (typeof x === 'string' ? t(x) : x))
})
const empty = (): Node => ({ type: 'paragraph' })
const h = (level: 1 | 2 | 3, text: string): Node => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const li = (text: string): Node => ({ type: 'listItem', content: [p(text)] })
const ul = (...items: string[]): Node => ({ type: 'bulletList', content: items.map(li) })
const ol = (...items: string[]): Node => ({ type: 'orderedList', attrs: { start: 1 }, content: items.map(li) })
const cell = (text: string, header = false): Node => ({ type: header ? 'tableHeader' : 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [text ? p(text) : empty()] })
const table = (head: string[], rows: number): Node => ({
  type: 'table',
  content: [
    { type: 'tableRow', content: head.map((c) => cell(c, true)) },
    ...Array.from({ length: rows }, () => ({ type: 'tableRow', content: head.map(() => cell('')) }))
  ]
})
const doc = (...content: Node[]) => ({ type: 'doc', content })
const hr = (): Node => ({ type: 'horizontalRule' })

export interface BuiltinTemplate {
  id: string
  name: string
  description: string
  category: string
  content: unknown
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-business-letter',
    name: 'Business Letter',
    description: 'Formal letter with sender, recipient, subject and signature blocks.',
    category: 'business',
    content: doc(
      p(t('[Your company]', ['bold'])),
      p('[Street address], [City]'),
      p('[Date]'),
      empty(),
      p('[Recipient name]'),
      p('[Recipient company]'),
      empty(),
      p(t('Subject: ', ['bold']), '[Subject]'),
      empty(),
      p('Dear [Name],'),
      p('[Opening paragraph — purpose of the letter.]'),
      p('[Main paragraph — details.]'),
      p('[Closing paragraph — next steps.]'),
      empty(),
      p('Sincerely,'),
      p('[Your name]'),
      p('[Position]')
    )
  },
  {
    id: 'builtin-email',
    name: 'Email',
    description: 'Clear email with greeting, body, action items and sign-off.',
    category: 'business',
    content: doc(p(t('Subject: ', ['bold']), '[Subject]'), empty(), p('Hello [Name],'), p('[Message]'), h(3, 'Action items'), ul('[Item]'), p('Best regards,'), p('[Your name]'))
  },
  {
    id: 'builtin-report',
    name: 'Report',
    description: 'Structured report with summary, findings, table and recommendations.',
    category: 'business',
    content: doc(
      h(1, '[Report title]'),
      p(t('Prepared by: ', ['bold']), '[Name] · ', t('Date: ', ['bold']), '[Date]'),
      h(2, 'Executive summary'),
      p('[Two or three sentences with the main conclusion.]'),
      h(2, 'Background'),
      p('[Context and goals.]'),
      h(2, 'Findings'),
      table(['Metric', 'Value', 'Comment'], 3),
      h(2, 'Recommendations'),
      ol('[Recommendation]', '[Recommendation]'),
      h(2, 'Conclusion'),
      p('[Closing remarks.]')
    )
  },
  {
    id: 'builtin-meeting-notes',
    name: 'Meeting Notes',
    description: 'Attendees, agenda, decisions and action items.',
    category: 'work',
    content: doc(
      h(1, 'Meeting notes — [Topic]'),
      p(t('Date: ', ['bold']), '[Date] · ', t('Attendees: ', ['bold']), '[Names]'),
      h(2, 'Agenda'),
      ol('[Item]', '[Item]'),
      h(2, 'Discussion'),
      p('[Notes]'),
      h(2, 'Decisions'),
      ul('[Decision]'),
      h(2, 'Action items'),
      table(['Task', 'Owner', 'Due'], 3)
    )
  },
  {
    id: 'builtin-academic-notes',
    name: 'Academic Notes',
    description: 'Lecture notes with key concepts, definitions and questions.',
    category: 'education',
    content: doc(
      h(1, '[Course] — [Lecture topic]'),
      p(t('Date: ', ['bold']), '[Date] · ', t('Lecturer: ', ['bold']), '[Name]'),
      h(2, 'Key concepts'),
      ul('[Concept]'),
      h(2, 'Definitions'),
      p(t('[Term]', ['bold']), ' — [definition]'),
      h(2, 'Notes'),
      p('[Notes]'),
      h(2, 'Questions to review'),
      ol('[Question]'),
      h(2, 'Sources'),
      ul('[Source]')
    )
  },
  {
    id: 'builtin-article',
    name: 'Article',
    description: 'Headline, lead paragraph and sections for a blog post or article.',
    category: 'writing',
    content: doc(h(1, '[Headline]'), p(t('[Lead paragraph that hooks the reader.]', ['italic'])), h(2, '[Section]'), p('[Text]'), h(2, '[Section]'), p('[Text]'), {
      type: 'blockquote',
      content: [p('[Quote]')]
    }, h(2, 'Conclusion'), p('[Text]'))
  },
  {
    id: 'builtin-application',
    name: 'Application',
    description: 'Formal application or statement addressed to an organisation.',
    category: 'personal',
    content: doc(
      { type: 'paragraph', attrs: { textAlign: 'right' }, content: [t('To: [Position, organisation]')] },
      { type: 'paragraph', attrs: { textAlign: 'right' }, content: [t('From: [Full name, address]')] },
      empty(),
      { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [t('APPLICATION')] },
      p('[Text of the application.]'),
      empty(),
      p('[Date]                                                  [Signature]')
    )
  },
  {
    id: 'builtin-personal-notes',
    name: 'Personal Notes',
    description: 'A simple page for thoughts, ideas and to-dos.',
    category: 'personal',
    content: doc(h(1, '[Title]'), p('[Thoughts]'), h(3, 'Ideas'), ul('[Idea]'), h(3, 'To do'), ul('[Task]'))
  },
  {
    id: 'builtin-lesson',
    name: 'Lesson Plan',
    description: 'Objectives, materials, activities and homework for a lesson.',
    category: 'education',
    content: doc(
      h(1, 'Lesson: [Topic]'),
      p(t('Class: ', ['bold']), '[Class] · ', t('Duration: ', ['bold']), '[45 min]'),
      h(2, 'Objectives'),
      ul('[Objective]'),
      h(2, 'Materials'),
      ul('[Material]'),
      h(2, 'Lesson flow'),
      table(['Stage', 'Activity', 'Time'], 4),
      h(2, 'Homework'),
      p('[Homework]')
    )
  },
  {
    id: 'builtin-project-docs',
    name: 'Project Documentation',
    description: 'Overview, requirements, architecture, setup and roadmap.',
    category: 'technical',
    content: doc(
      h(1, '[Project name]'),
      p('[One-paragraph overview.]'),
      h(2, 'Goals'),
      ul('[Goal]'),
      h(2, 'Requirements'),
      ol('[Requirement]'),
      h(2, 'Architecture'),
      p('[Components and how they interact.]'),
      h(2, 'Setup'),
      { type: 'codeBlock', attrs: { language: null }, content: [t('npm install\nnpm run dev')] },
      h(2, 'Roadmap'),
      table(['Milestone', 'Status', 'Date'], 3),
      hr(),
      p(t('Maintainers: ', ['bold']), '[Names]')
    )
  }
]
