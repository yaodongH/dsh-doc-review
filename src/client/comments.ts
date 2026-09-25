/**
 * Comment data layer for the review tab's block comments: the data model,
 * pure CRUD reducers, and the aggregation formatter. Pure logic with no
 * React/DOM/storage dependencies — persistence lives in the shared review
 * store (engine persistence), so this module stays side-effect free.
 */

/** One comment, anchored to the block starting at source line `line`. */
export interface DocComment {
  /** Unique id (crypto.randomUUID() when available, else timestamp+random). */
  id: string
  /** 1-based source line the comment anchors to: its block's first line. */
  line: number
  /**
   * 1-based source line the anchor block ends on; the quoted 原文 spans
   * line…endLine. Absent for single-line anchors and for states persisted by
   * an older schema.
   */
  endLine?: number
  /** Comment body, trimmed and non-empty at creation. */
  text: string
  /** Epoch ms of creation. */
  createdAt: number
  /** Epoch ms of the last edit. */
  updatedAt: number
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
export function createComment(
  anchor: { readonly line: number; readonly endLine?: number },
  text: string,
  now: number,
): DocComment {
  if (!Number.isInteger(anchor.line) || anchor.line < 1) throw new RangeError('comment line must be >= 1')
  const trimmed = text.trim()
  if (trimmed === '') throw new Error('comment text must be non-empty')
  const comment: DocComment = {
    id: generateId(now),
    line: anchor.line,
    text: trimmed,
    createdAt: now,
    updatedAt: now,
  }
  if (anchor.endLine !== undefined && anchor.endLine >= anchor.line) comment.endLine = anchor.endLine
  return comment
}

/** Immutable append; returns a new array. */
export function addComment(
  comments: readonly DocComment[],
  anchor: { readonly line: number; readonly endLine?: number },
  text: string,
  now: number,
): DocComment[] {
  return [...comments, createComment(anchor, text, now)]
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

/** The minimal block shape the aggregation reads. */
export interface SourceBlockLike {
  /** 1-based source line the block starts on. */
  readonly startLine: number
  /** 1-based source line the block ends on (inclusive). */
  readonly endLine: number
  /** The block's raw source, verbatim. */
  readonly source: string
}

/**
 * Aggregate comments into the review-feedback text, one line per comment:
 * `对于第N行{原文}，我认为应{评论}` — sorted by anchor line (then createdAt,
 * then id), whitespace-only comments excluded, joined with `\n`. The quoted
 * 原文 is the anchor block's raw source, trimmed; an anchor that no longer
 * matches a block still contributes, with an empty quote.
 *
 * @param comments - every comment of the review.
 * @param blocks - the parsed block model of the reviewed document.
 * @returns The aggregated feedback, or '' when nothing qualifies.
 */
export function buildFeedback(
  comments: readonly DocComment[],
  blocks: readonly SourceBlockLike[],
): string {
  const kept = comments
    .filter(comment => comment.text.trim() !== '')
    .sort((a, b) => a.line - b.line || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (kept.length === 0) return ''
  return kept
    .map((comment) => {
      const quote = quotedSourceOf(comment, blocks)
      return `对于第${comment.line}行${quote}，我认为应${comment.text}`
    })
    .join('\n')
}

/** The 原文 of one comment's anchor block, trimmed. */
function quotedSourceOf(
  comment: DocComment,
  blocks: readonly SourceBlockLike[],
): string {
  const endLine = comment.endLine ?? comment.line
  const block = blocks.find(candidate =>
    candidate.startLine === comment.line && candidate.endLine === endLine)
    ?? blocks.find(candidate => comment.line >= candidate.startLine && comment.line <= candidate.endLine)
  return (block?.source ?? '').trim()
}

/** FNV-1a 32-bit hash of the document, base36 — the persisted comment state's
 * content guard against a wait key reused across changed documents. */
export function detailHashOf(detail: string): string {
  let hash = 0x811c9dc5
  for (const char of detail) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}