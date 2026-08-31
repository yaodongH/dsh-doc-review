/**
 * Comment data layer for the document-review line comments: the data model,
 * pure CRUD reducers, the aggregation formatter, and localStorage
 * persistence. Pure logic with no React/DOM dependencies — every storage
 * entry point is try/catch-guarded and degrades silently to in-memory state
 * when localStorage is unavailable, so a hardened webview can never break the
 * panel.
 */

/** Schema version stored in every persisted payload. */
export const STORAGE_VERSION = 1 as const

/**
 * localStorage namespace prefix for persisted comment state. The full key is
 * `STORAGE_PREFIX + wait.key` — wait.key is stable across baseline replay
 * (`q:<rpcId>` for question waits), so comments survive refresh, remount and
 * session switches as long as the review has not been settled.
 */
export const STORAGE_PREFIX = 'dsh-doc-review:v1:comments:' as const

/** One line comment. Lines are 1-based source lines of the reviewed detail. */
export interface DocComment {
  /** Unique id (crypto.randomUUID() when available, else timestamp+random). */
  id: string
  /** 1-based source line the comment anchors to. */
  line: number
  /** Comment body, trimmed and non-empty at creation. */
  text: string
  /** Epoch ms of creation. */
  createdAt: number
  /** Epoch ms of the last edit. */
  updatedAt: number
}

/** The persisted payload shape. `detailHash` is an optional defense-in-depth
 * guard against rpcId reuse across changed documents. */
export interface StoredCommentsState {
  version: 1
  detailHash?: string
  comments: DocComment[]
}

/** 1-based source-line split: index i maps to source line i+1; empty input
 * yields a single empty line. */
export function splitLines(markdown: string): string[] {
  return markdown.split('\n')
}

/** Raw text of the 1-based source line `n`, untrimmed; out of range → ''. */
export function lineTextAt(lines: readonly string[], n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > lines.length) return ''
  return lines[n - 1] ?? ''
}

/** Unique id: crypto.randomUUID() when available, else timestamp+random. */
function generateId(now: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** One comment from a draft; throws on invalid input (defensive — the UI
 * disables empty drafts before this can run). */
export function createComment(line: number, text: string, now: number): DocComment {
  if (!Number.isInteger(line) || line < 1) throw new RangeError('comment line must be >= 1')
  const trimmed = text.trim()
  if (trimmed === '') throw new Error('comment text must be non-empty')
  return { id: generateId(now), line, text: trimmed, createdAt: now, updatedAt: now }
}

/** Immutable append; returns a new array. */
export function addComment(
  comments: readonly DocComment[],
  draft: { line: number; text: string },
  now: number,
): DocComment[] {
  return [...comments, createComment(draft.line, draft.text, now)]
}

/** Immutable edit of one comment's text; empty trimmed text or an unknown id
 * is a no-op returning the input reference. */
export function updateComment(
  comments: readonly DocComment[],
  id: string,
  text: string,
  now: number,
): DocComment[] {
  const trimmed = text.trim()
  if (trimmed === '') return comments as DocComment[]
  let hit = false
  const next = comments.map((comment) => {
    if (comment.id !== id) return comment
    hit = true
    return { ...comment, text: trimmed, updatedAt: now }
  })
  return hit ? next : (comments as DocComment[])
}

/** Immutable removal of one comment; unknown id returns the input reference. */
export function deleteComment(comments: readonly DocComment[], id: string): DocComment[] {
  if (!comments.some(comment => comment.id === id)) return comments as DocComment[]
  return comments.filter(comment => comment.id !== id)
}

/**
 * Aggregate comments into the review-feedback sentence, one line per comment:
 * `对于第N行{原文}，我认为应{评论}` — sorted by line (then createdAt, then id),
 * whitespace-only comments excluded, joined with `\n`. The original line text
 * is the 1-based source line, trimmed but not truncated; an out-of-range line
 * still contributes with an empty 原文.
 */
export function buildFeedback(comments: readonly DocComment[], lines: readonly string[]): string {
  const kept = comments
    .filter(comment => comment.text.trim() !== '')
    .sort((a, b) => a.line - b.line || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (kept.length === 0) return ''
  return kept
    .map(comment => `对于第${comment.line}行${lineTextAt(lines, comment.line).trim()}，我认为应${comment.text}`)
    .join('\n')
}

/** FNV-1a 32-bit hash of the detail, base36 — deterministic, collision-safe
 * enough for the optional detailHash persistence guard. */
export function detailHashOf(detail: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < detail.length; i++) {
    hash ^= detail.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** The localStorage key for one wait's comment state. */
export function storageKey(waitKey: string): string {
  return STORAGE_PREFIX + waitKey
}

/** Per-entry shape validation: filters malformed comments, keeps the rest. */
function isValidComment(value: unknown): value is DocComment {
  if (typeof value !== 'object' || value === null) return false
  const comment = value as Record<string, unknown>
  return typeof comment.id === 'string' && comment.id !== ''
    && typeof comment.line === 'number' && Number.isInteger(comment.line) && comment.line >= 1
    && typeof comment.text === 'string' && comment.text.trim() !== ''
    && typeof comment.createdAt === 'number' && Number.isFinite(comment.createdAt)
    && typeof comment.updatedAt === 'number' && Number.isFinite(comment.updatedAt)
}

/** Load persisted comments; any failure (unavailable storage, corrupt JSON,
 * wrong version, mismatched detail hash, malformed entries) degrades to [] or
 * drops only the malformed entries. Never throws. */
export function loadComments(waitKey: string, expectedHash?: string): DocComment[] {
  try {
    const raw = localStorage.getItem(storageKey(waitKey))
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return []
    const state = parsed as Record<string, unknown>
    if (state.version !== STORAGE_VERSION) return []
    if (expectedHash !== undefined
      && state.detailHash !== undefined
      && state.detailHash !== expectedHash) return []
    if (!Array.isArray(state.comments)) return []
    return state.comments.filter(isValidComment)
  } catch {
    return []
  }
}

/** Persist comment state; storage failures are silent (in-memory state
 * remains usable for the session). Never throws. */
export function saveComments(
  waitKey: string,
  comments: readonly DocComment[],
  detailHash?: string,
): void {
  try {
    const state: StoredCommentsState = { version: STORAGE_VERSION, comments: [...comments] }
    if (detailHash !== undefined) state.detailHash = detailHash
    localStorage.setItem(storageKey(waitKey), JSON.stringify(state))
  } catch {
    // unavailable / quota — degrade silently
  }
}

/** Remove persisted comment state; storage failures are silent. Never throws. */
export function clearComments(waitKey: string): void {
  try {
    localStorage.removeItem(storageKey(waitKey))
  } catch {
    // unavailable — nothing to clear
  }
}
