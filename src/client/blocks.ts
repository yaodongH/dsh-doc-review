/**
 * The block model behind the review tab's comment anchors: the reviewed
 * markdown parsed with the same OSS mdast stack the native `MarkdownText`
 * renders with, one record per top-level node carrying its exact source line
 * range, plus the DOM alignment that maps a rendered segment's top-level
 * elements back onto those records.
 *
 * The parse exists only to place anchors and to cut segments; rendering is
 * always the native `MarkdownText`. Where this parse and DSH's own grammar
 * could disagree (DSH's two local micromark extensions are not reproducible
 * here), the alignment self-check catches the drift and the affected segment
 * degrades to "no comment affordance" instead of ever anchoring a comment to
 * the wrong text.
 */

import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { mathFromMarkdown } from 'mdast-util-math'
import { gfm } from 'micromark-extension-gfm'
import { math } from 'micromark-extension-math'
import type { RootContent } from 'mdast'

/** One top-level block of the reviewed document, 1-based source lines. */
export interface SourceBlock {
  /** 1-based source line the block starts on. */
  readonly startLine: number
  /** 1-based source line the block ends on (inclusive). */
  readonly endLine: number
  /** Byte offsets of the block's source span in the full document. */
  readonly startOffset: number
  readonly endOffset: number
  /** mdast node type (`paragraph`, `heading`, `list`, `table`, …). */
  readonly type: string
  /**
   * The DOM signature one rendered instance of this block surfaces as, per
   * the native renderer's switch; `undefined` when the block renders nothing
   * (definitions) or as raw text (top-level HTML), or when the alignment
   * does not know the shape — such blocks are never anchorable.
   */
  readonly sig: string | undefined
  /** The block's raw source, verbatim, without its trailing line terminator. */
  readonly source: string
  /** Collapsed plain-text projection, the alignment check's expectation. */
  readonly plain: string
}

/** The renderable top-level signatures, mirroring the native renderer's switch. */
function signatureOf(node: RootContent): string | undefined {
  switch (node.type) {
    case 'paragraph':
      return 'p'
    case 'heading':
      return `h${String(node.depth)}`
    case 'list':
      return 'list'
    case 'blockquote':
      return 'blockquote'
    case 'thematicBreak':
      return 'hr'
    case 'code':
      // A settled `math`-lang fence flattens into KaTeX like a `$$` block does.
      return node.lang === 'math' ? 'math' : 'codeBlock'
    case 'table':
      return 'table'
    case 'math':
      return 'math'
    default:
      // definition/footnoteDefinition render null; raw HTML renders as a text
      // node; unknown types render nothing — none yields an alignable element.
      return undefined
  }
}

/**
 * Parse the review markdown into its top-level blocks.
 *
 * The extensions match `MarkdownText`'s settled grammar (gfm + math); DSH's
 * two local extensions (`cjkFriendlyStrong`, `mathCompatibility`) are inline
 * constructs and TeX-delimiter aliases whose absence can only shift
 * boundaries around `\[…\]` spans — a drift the alignment self-check gates,
 * never the rendering.
 *
 * @param markdown - the reviewed document source.
 * @returns One record per top-level node, in document order.
 */
export function parseBlocks(markdown: string): readonly SourceBlock[] {
  const root = fromMarkdown(markdown, {
    extensions: [gfm(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  })
  return root.children.map(node => {
    const position = node.position
    // fromMarkdown stamps positions on every node it returns; the fallbacks
    // keep the record total for the hand-built-tree case the types allow.
    const startOffset = position?.start.offset ?? 0
    const endOffset = position?.end.offset ?? startOffset
    const startLine = position?.start.line ?? 1
    const endLine = position?.end.line ?? startLine
    const source = markdown.slice(startOffset, endOffset).replace(/\n$/, '')
    return {
      startLine,
      endLine,
      startOffset,
      endOffset,
      type: node.type,
      sig: signatureOf(node),
      source,
      plain: plainTextOf(source),
    }
  })
}

/** The source slice covering the blocks `first` through `last`, inclusive. */
export function sliceBetween(
  markdown: string,
  first: SourceBlock,
  last: SourceBlock,
): string {
  return markdown.slice(first.startOffset, last.endOffset)
}

/**
 * The block containing source line `n`, or undefined. Anchoring only lands on
 * blocks the alignment knows how to recognize (`sig` present).
 */
export function blockAtLine(
  blocks: readonly SourceBlock[],
  line: number,
): SourceBlock | undefined {
  return blocks.find(block => line >= block.startLine && line <= block.endLine && block.sig !== undefined)
}

/**
 * Whether the document carries reference-style or footnote definitions — the
 * cross-segment risk signal: splitting at a comment between a usage and its
 * definition renders the usage's end literally (the definition resolves only
 * within its own `MarkdownText` instance).
 */
export function hasCrossBlockReferences(blocks: readonly SourceBlock[]): boolean {
  return blocks.some(block => block.type === 'definition' || block.type === 'footnoteDefinition')
}

/**
 * Collapsed plain text of a block's source: markdown inline syntax stripped so
 * the value can be compared with a rendered element's `textContent`.
 * Approximate by design — it is the verification's own expectation, consulted
 * only for paragraph and heading blocks.
 */
export function plainTextOf(source: string): string {
  return normalize(source
    .replace(/^#{1,6}\s+/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*\*([^*]*)\*\*\*/g, '$1')
    .replace(/___([^_]*)___/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1'))
}

/** Whitespace-collapsed comparison form. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Alignment result for one rendered segment. */
export interface SegmentAlignment {
  /** Count, kind, and (paragraph/heading) text all agreed. */
  readonly ok: boolean
  /** Rendered element → block; empty unless {@link SegmentAlignment.ok}. */
  readonly byElement: ReadonlyMap<HTMLElement, SourceBlock>
}

/**
 * Align one rendered segment's top-level elements onto its blocks.
 *
 * The container is the segment's `.markdown` root; its element children
 * (text separators and the trailing footnote section excluded) must match
 * the blocks' renderable sequence one for one, by kind signature and — for
 * paragraphs and headings — by collapsed text. Any disagreement degrades the
 * whole segment: affordances disappear and the comment flow falls back to the
 * segment's seams, while the existing comments keep rendering.
 *
 * @param container - the segment's rendered `.markdown` element.
 * @param blocks - the segment's blocks, in order.
 * @returns The alignment map, or a degraded result.
 */
export function alignSegment(
  container: Element,
  blocks: readonly SourceBlock[],
): SegmentAlignment {
  const children = [...container.children]
  const footnoteSection = children.find(child =>
    child.tagName === 'SECTION' && child.hasAttribute('data-footnotes'))
  const elements = children
    .filter(child => child !== footnoteSection && child.nodeType === 1)
  const expected = blocks.filter(block => block.sig !== undefined)
  if (elements.length !== expected.length) return { ok: false, byElement: new Map() }
  const byElement = new Map<HTMLElement, SourceBlock>()
  for (const [index, element] of elements.entries()) {
    const block = expected[index]
    if (block === undefined || !matches(element, block)) return { ok: false, byElement: new Map() }
    const textChecked = block.sig === 'p' || (block.sig !== undefined && /^h[1-6]$/.test(block.sig))
    if (textChecked && normalize(element.textContent ?? '') !== block.plain) {
      return { ok: false, byElement: new Map() }
    }
    byElement.set(element as HTMLElement, block)
  }
  return { ok: true, byElement }
}

/** Whether one rendered element carries the block's expected signature. */
function matches(element: Element, block: SourceBlock): boolean {
  switch (block.sig) {
    case 'p':
      return element.tagName === 'P'
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return element.tagName === block.sig.toUpperCase()
    case 'list':
      return element.tagName === 'UL' || element.tagName === 'OL'
    case 'blockquote':
      return element.tagName === 'BLOCKQUOTE'
    case 'hr':
      return element.tagName === 'HR'
    case 'codeBlock':
      // Empty fences render as a bare <pre>; real fences as the CodeBlock card
      // (whose `md-code-block` class is global and survives CSS-module hashing).
      return element.tagName === 'PRE' || element.classList.contains('md-code-block')
    case 'table':
      // The table renders inside its scroll wrapper; the wrapper's module
      // class is hashed, so the table element itself is the identity.
      return element.tagName === 'DIV' && element.querySelector(':scope > table') !== null
    case 'math':
      // KaTeX writes its own class names, unhashed.
      return element.classList.contains('katex-display')
    default:
      return false
  }
}