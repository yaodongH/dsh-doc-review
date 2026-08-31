/**
 * The line grid renderer: the review body as 1-based source lines with a
 * clickable gutter, inline markdown subset rendering, published comment
 * blocks, inline comment editors and the right-click "add comment" popup.
 *
 * This replaces MarkdownText inside the review modal so comments can anchor
 * to deterministic source lines (`data-line`). The inline renderer is a
 * deliberately small subset (headings, emphasis, inline code, links, delete,
 * list markers) with code fences and tables kept as raw block rows — the
 * fidelity loss (KaTeX, syntax highlighting, complex tables) is a documented
 * limitation. Only primitives' main entry is imported (no internal markdown
 * paths, matching the browser-bundle externalization contract).
 */

import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  Button, IconEditOutline16, IconPlusOutline16, IconTrashOutline16, useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DocComment } from './comments.ts'
import type { DocReviewKey } from './locales.ts'

/** Row classification of one source line. */
export type LineKind = 'codeFence' | 'table' | 'heading' | 'listItem' | 'blockquote' | 'hr' | 'paragraph' | 'blank'

/** One source line of the grid, 1-based. */
export interface LineRow {
  /** 1-based source line number. */
  line: number
  kind: LineKind
  /** The original source line, verbatim. */
  raw: string
  /** heading: ATX level. */
  level?: 1 | 2 | 3 | 4 | 5 | 6
  /** listItem: the raw marker text (`- `, `1. `). */
  marker?: string
  /** listItem: whether the marker was ordered. */
  ordered?: boolean
  /** listItem: task-list check state when present. */
  task?: ' ' | 'x'
  /** Inline nodes for heading/listItem/blockquote/paragraph rows. */
  inline: InlineNode[]
}

/** The inline-markdown subset node. */
export type InlineNode =
  | { t: 'text'; s: string }
  | { t: 'strong'; c: InlineNode[] }
  | { t: 'em'; c: InlineNode[] }
  | { t: 'code'; s: string }
  | { t: 'del'; c: InlineNode[] }
  | { t: 'link'; href: string; c: InlineNode[] }

const FENCE = /^(```|~~~)(.*)$/
const HEADING = /^(#{1,6})\s+(.+?)\s*$/
const LIST_ITEM = /^(\s*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?(.*)$/
const BLOCKQUOTE = /^\s*>\s?(.*)$/
const HR = /^\s*([-*_])\1{2,}\s*$/

/** Whether a line looks like a GFM table separator row (`|---|---|`). */
function isTableSeparator(line: string): boolean {
  if (!line.includes('|')) return false
  const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell !== '')
  return cells.length >= 1 && cells.every(cell => /^:?-+:?$/.test(cell))
}

/**
 * Classify every source line into grid rows with 1-based line numbers: code
 * fences (``` / ~~~, unclosed runs to the end) and GFM table runs become
 * block rows keeping their raw text; headings keep ATX levels; list items,
 * blockquotes, thematic breaks, paragraphs and blank lines get inline
 * content. One row per source line — a deterministic 1:1 line↔row mapping.
 */
export function classifyLines(markdown: string): LineRow[] {
  const rawLines = markdown.split('\n')
  const rows: LineRow[] = []
  let fence: '```' | '~~~' | null = null
  let tableRun = 0
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? ''
    const trimmed = line.trim()
    const row: LineRow = { line: i + 1, kind: 'paragraph', raw: line, inline: [] }
    const fenceMatch = FENCE.exec(trimmed)

    if (fence !== null) {
      row.kind = 'codeFence'
      if (fenceMatch !== null && fenceMatch[1] === fence) fence = null
    } else if (fenceMatch !== null) {
      row.kind = 'codeFence'
      fence = fenceMatch[1] as '```' | '~~~'
    } else if (tableRun > 0) {
      row.kind = 'table'
      tableRun--
    } else if (line.includes('|') && i + 1 < rawLines.length && isTableSeparator(rawLines[i + 1] ?? '')) {
      row.kind = 'table'
      let end = i + 2
      while (end < rawLines.length && (rawLines[end] ?? '').includes('|')) end++
      tableRun = end - i - 1
    } else {
      const heading = HEADING.exec(trimmed)
      if (heading !== null) {
        row.kind = 'heading'
        row.level = (heading[1]?.length ?? 1) as 1 | 2 | 3 | 4 | 5 | 6
        row.inline = parseInline((heading[2] ?? '').trimEnd())
      } else {
        const list = LIST_ITEM.exec(line)
        if (list !== null) {
          row.kind = 'listItem'
          row.marker = `${list[2] ?? ''} `
          row.ordered = /^\d+\.$/.test(list[2] ?? '')
          const taskText = (list[3] ?? '').trim()
          if (taskText !== '') row.task = /^\[[xX]\]/.test(taskText) ? 'x' : ' '
          row.inline = parseInline(list[4] ?? '')
        } else {
          const quote = BLOCKQUOTE.exec(line)
          if (quote !== null) {
            row.kind = 'blockquote'
            row.inline = parseInline(quote[1] ?? '')
          } else if (HR.test(trimmed)) {
            row.kind = 'hr'
          } else if (trimmed === '') {
            row.kind = 'blank'
          } else {
            row.inline = parseInline(line)
          }
        }
      }
    }
    rows.push(row)
  }
  return rows
}

/** Append a text node, merging into a trailing text node. */
function pushText(out: InlineNode[], s: string): void {
  if (s === '') return
  const last = out[out.length - 1]
  if (last !== undefined && last.t === 'text') {
    out[out.length - 1] = { t: 'text', s: last.s + s }
  } else {
    out.push({ t: 'text', s })
  }
}

const INLINE_TOKEN = /(\*\*\*|___|\*\*|__|~~|`|\*|_|\[([^\]]*)\]\(([^)]*)\))/g

/**
 * Parse the inline-markdown subset: `**bold**`/`__bold__`, `*em*`/`_em_`,
 * `***both***`, `` `code` ``, `~~del~~` and `[label](url)` for http(s)/mailto
 * links (other protocols render the label as plain text). Unpaired markers
 * fall back to plain text; no images, HTML or other extensions.
 */
export function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = []
  let last = 0
  INLINE_TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INLINE_TOKEN.exec(text)) !== null) {
    if (match.index > last) pushText(out, text.slice(last, match.index))
    const token = match[0]
    const rest = text.slice(match.index + token.length)
    const close = rest.indexOf(token)

    const wrap = (t: 'strong' | 'em' | 'del', inner: InlineNode[]): void => {
      out.push({ t, c: inner } as InlineNode)
    }
    const consume = (end: number): void => {
      last = match!.index + end
      INLINE_TOKEN.lastIndex = last
    }

    if (token === '`') {
      if (close !== -1) {
        out.push({ t: 'code', s: rest.slice(0, close) })
        consume(token.length + close + token.length)
      } else {
        pushText(out, token)
        consume(token.length)
      }
    } else if (token === '***' || token === '___') {
      if (close !== -1) {
        wrap('strong', [{ t: 'em', c: parseInline(rest.slice(0, close)) }])
        consume(token.length + close + token.length)
      } else {
        pushText(out, token)
        consume(token.length)
      }
    } else if (token === '**' || token === '__') {
      if (close !== -1) {
        wrap('strong', parseInline(rest.slice(0, close)))
        consume(token.length + close + token.length)
      } else {
        pushText(out, token)
        consume(token.length)
      }
    } else if (token === '~~') {
      if (close !== -1) {
        wrap('del', parseInline(rest.slice(0, close)))
        consume(token.length + close + token.length)
      } else {
        pushText(out, token)
        consume(token.length)
      }
    } else if (token === '*' || token === '_') {
      if (close !== -1) {
        wrap('em', parseInline(rest.slice(0, close)))
        consume(token.length + close + token.length)
      } else {
        pushText(out, token)
        consume(token.length)
      }
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const url = match[3]
      if (/^(https?:\/\/|mailto:)/.test(url)) {
        out.push({ t: 'link', href: url, c: parseInline(match[2]) })
      } else {
        pushText(out, match[2])
      }
      consume(token.length)
    } else {
      pushText(out, token)
      consume(token.length)
    }
  }
  if (last < text.length) pushText(out, text.slice(last))
  return out
}

/**
 * Resolve the anchor line for a right-click: a non-empty selection anchors at
 * its start node's `[data-line]` row; otherwise the right-clicked row is
 * used. Returns null when neither resolves (the caller suppresses the popup).
 */
export function anchorLineOf(selection: Selection | null, fallbackRow: Element | null): number | null {
  let row: Element | null = null
  if (selection !== null && selection.toString().trim() !== '') {
    const anchor = selection.anchorNode
    if (anchor !== null && anchor.parentElement !== null) {
      row = anchor.parentElement.closest('[data-line]')
    }
  }
  if (row === null && fallbackRow !== null) {
    row = fallbackRow.closest('[data-line]')
  }
  if (row === null) return null
  const raw = (row as HTMLElement).dataset.line
  const n = raw === undefined ? Number.NaN : Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/** Render one inline tree. */
function renderInline(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.t) {
      case 'text':
        return node.s
      case 'strong':
        return <strong key={index}>{renderInline(node.c)}</strong>
      case 'em':
        return <em key={index}>{renderInline(node.c)}</em>
      case 'code':
        return <code key={index}>{node.s}</code>
      case 'del':
        return <del key={index}>{renderInline(node.c)}</del>
      case 'link':
        return (
          <a key={index} href={node.href} target="_blank" rel="noreferrer">{renderInline(node.c)}</a>
        )
    }
  })
}

/** Render one classified row to its semantic element. */
function renderRow(row: LineRow): ReactNode {
  switch (row.kind) {
    case 'heading': {
      const Tag = `h${row.level ?? 1}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      return <Tag className="dr-line-heading">{renderInline(row.inline)}</Tag>
    }
    case 'listItem':
      return (
        <div className="dr-line-list-item">
          {row.marker}
          {row.task !== undefined && <span className="dr-line-task">[{row.task}] </span>}
          {renderInline(row.inline)}
        </div>
      )
    case 'blockquote':
      return <blockquote className="dr-line-quote">{renderInline(row.inline)}</blockquote>
    case 'paragraph':
      return <p className="dr-line-para">{renderInline(row.inline)}</p>
    case 'blank':
      return <span className="dr-line-blank" aria-hidden="true" />
    case 'codeFence':
      return <pre className="dr-line-code"><code>{row.raw}</code></pre>
    case 'table':
      return <div className="dr-line-table">{row.raw}</div>
    case 'hr':
      return <hr className="dr-line-hr" />
  }
}

/** Right-click popup state (screen coordinates + anchor line). */
export interface ContextMenuState {
  x: number
  y: number
  line: number
}

/** The line grid's full contract with the panel. */
export interface LineGridProps {
  detail: string
  comments: DocComment[]
  draftLine: number | null
  editingId: string | null
  draftText: string
  busy: boolean
  contextMenu: ContextMenuState | null
  t: (key: DocReviewKey) => string
  onContextMenuOpen(line: number, x: number, y: number): void
  onContextMenuClose(): void
  onDraftOpen(line: number): void
  onDraftChange(text: string): void
  onDraftPublish(): void
  onDraftCancel(): void
  onEditOpen(id: string): void
  onEditSave(id: string): void
  onEditCancel(): void
  onDelete(id: string): void
}

/**
 * Render the document as a line grid: a clickable line-number gutter, the
 * per-line content, published comment blocks (edit/delete icons), an inline
 * editor for new and edited comments, and the right-click "add comment"
 * popup. The gutter and all mutating affordances are disabled while busy.
 */
export function LineGrid({
  detail, comments, draftLine, editingId, draftText, busy, contextMenu, t,
  onContextMenuOpen, onContextMenuClose, onDraftOpen, onDraftChange,
  onDraftPublish, onDraftCancel, onEditOpen, onEditSave, onEditCancel, onDelete,
}: LineGridProps) {
  const rows = useMemo(() => classifyLines(detail), [detail])
  const popupRef = useRef<HTMLDivElement | null>(null)
  useDismissOnOutsidePointer(popupRef, contextMenu !== null, onContextMenuClose)

  return (
    <div className="dr-line-grid">
      {rows.map((row) => {
        const lineComments = comments.filter(comment => comment.line === row.line)
        const commented = lineComments.length > 0
        return (
          <div
            key={row.line}
            className={commented ? 'dr-line-row dr-line-commented' : 'dr-line-row'}
            data-line={row.line}
            onContextMenu={(event) => {
              event.preventDefault()
              const line = anchorLineOf(window.getSelection(), event.currentTarget as Element)
              if (line !== null) onContextMenuOpen(line, event.clientX, event.clientY)
            }}
          >
            <div className="dr-line-main">
              <div className="dr-line-gutter">
                <button
                  type="button"
                  className="dr-line-gutter-num"
                  data-line={row.line}
                  aria-label={commented ? t('comment.lineMark') : `${row.line} ${t('doc.line')}`}
                  disabled={busy}
                  onClick={() => { onDraftOpen(row.line) }}
                >
                  {row.line}
                </button>
              </div>
              <div className="dr-line-content">{renderRow(row)}</div>
            </div>
            {lineComments.map(comment => (
              editingId === comment.id
                ? (
                  <div key={comment.id} className="dr-comment-editor">
                    <textarea
                      className="dr-comment-editor-input"
                      rows={1}
                      value={draftText}
                      disabled={busy}
                      placeholder={t('comment.placeholder')}
                      onChange={(event) => { onDraftChange(event.target.value) }}
                    />
                    <div className="dr-comment-editor-actions">
                      <Button variant="primary" size="sm" disabled={busy || draftText.trim() === ''} onClick={() => { onEditSave(comment.id) }}>
                        {t('comment.save')}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={onEditCancel}>
                        {t('comment.cancelEdit')}
                      </Button>
                    </div>
                  </div>
                )
                : (
                  <div key={comment.id} className="dr-comment">
                    <div className="dr-comment-text">{comment.text}</div>
                    <div className="dr-comment-actions">
                      <button
                        type="button"
                        className="dr-comment-icon-btn"
                        aria-label={t('comment.edit')}
                        disabled={busy}
                        onClick={() => { onEditOpen(comment.id) }}
                      >
                        <IconEditOutline16 />
                      </button>
                      <button
                        type="button"
                        className="dr-comment-icon-btn"
                        aria-label={t('comment.delete')}
                        disabled={busy}
                        onClick={() => { onDelete(comment.id) }}
                      >
                        <IconTrashOutline16 />
                      </button>
                    </div>
                  </div>
                )
            ))}
            {draftLine === row.line && (
              <div className="dr-comment-editor">
                <textarea
                  className="dr-comment-editor-input"
                  rows={1}
                  value={draftText}
                  disabled={busy}
                  placeholder={t('comment.placeholder')}
                  onChange={(event) => { onDraftChange(event.target.value) }}
                />
                <div className="dr-comment-editor-actions">
                  <Button variant="primary" size="sm" disabled={busy || draftText.trim() === ''} onClick={onDraftPublish}>
                    {t('comment.publish')}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={onDraftCancel}>
                    {t('comment.cancelEdit')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {contextMenu !== null && (
        <div
          ref={popupRef}
          className="dr-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="dr-context-menu-item"
            onClick={() => { onDraftOpen(contextMenu.line); onContextMenuClose() }}
          >
            <IconPlusOutline16 />
            {t('comment.add')}
          </button>
        </div>
      )}
    </div>
  )
}
