/**
 * The review tab body: this plugin's takeover of the native plan-review
 * sidebar tab (the extension-band tab type claims the addresses the native
 * flow auto-opens). The document renders through the native `MarkdownText` —
 * full GFM fidelity, exactly the native preview's rendering — while comments
 * ride the seams between its segments.
 *
 * The seam model: the document's top-level mdast blocks (parsed with the same
 * OSS stack the renderer uses, see blocks.ts) are cut into segments; a block
 * carrying a comment (or an open draft) ends its segment, and the comment
 * cards render as ordinary React elements between the segments. With no
 * comments the document is one segment, so the body IS the native preview.
 * Per-block anchoring rides the alignment self-check: only blocks whose
 * rendered element this program could verify offer the comment affordance;
 * a drifted segment renders fully but accepts no new comments.
 *
 * The review is answerable only while the Session's effective pending
 * interaction is this tab's carrier (matched by request key or plan call id);
 * 提交评论 delivers the aggregated feedback through the carrier's own
 * `answer`, one-shot latched, and the read-only fallback renders the document
 * without affordances when no carrier matches.
 */

import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button, FileTypeIcon, IconEditOutlineRegular, IconPlusOutlineRegular,
  IconTrashOutlineRegular, MarkdownText, Modal, type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the global standard hooks this body reads (useResource,
// useSessionStatus) and the sidebar tab share it renders under. The `plan`
// resource protocol and the plan-review navigation parameters come from the
// plugin's own structural merges (augment.d.ts).
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import './augment.d.ts'
import { alignSegment, blockAtLine, parseBlocks, sliceBetween, type SourceBlock } from './blocks.ts'
import { documentReviewOf, type DocumentReviewWait, type QuestionCarrier } from './claim.ts'
import {
  addComment, buildFeedback, deleteComment, detailHashOf, updateComment, type DocComment,
} from './comments.ts'
import { parseReviewAddress, type ReviewAddress } from './review-address.ts'
import { commentsOf, type DocReviewStore } from './review-store.ts'
import type { DocReviewKey } from './locales.ts'

/** Full body props: the framework runtime share (tab info + session/global
 * kit), the shared comment store, and the locale seat. */
export type ReviewTabProps =
  PropsRuntime<'sidebar.right.pane.tab'>
  & PropsStore<DocReviewStore>
  & PropsLocale<'doc-review'>

/** One rendered run of blocks between comment seams. */
export interface SegmentView {
  /** The blocks of the run, in document order. */
  readonly blocks: readonly SourceBlock[]
  /** The exact source slice the segment's `MarkdownText` renders. */
  readonly source: string
}

/**
 * Cut the document's blocks into segments: every block whose start line
 * anchors a comment (or the open draft) ends its segment, so the comment
 * cards can render directly after it; every other block joins its neighbors.
 * A document with no anchors is one segment — the native preview itself.
 *
 * @param markdown - the reviewed document source.
 * @param blocks - the parsed block model.
 * @param anchors - anchor lines (block start lines) that end a segment.
 * @returns The segments, in document order.
 */
export function partitionSegments(
  markdown: string,
  blocks: readonly SourceBlock[],
  anchors: ReadonlySet<number>,
): readonly SegmentView[] {
  const segments: SegmentView[] = []
  let run: SourceBlock[] = []
  const flush = (): void => {
    const first = run[0]
    const last = run[run.length - 1]
    if (first === undefined || last === undefined) return
    segments.push({ blocks: run, source: sliceBetween(markdown, first, last) })
    run = []
  }
  for (const block of blocks) {
    run.push(block)
    if (anchors.has(block.startLine)) flush()
  }
  flush()
  return segments
}

/**
 * Match the Session's effective pending interaction against one review tab
 * address. Identity (pending key / plan invocation) decides; equal document
 * content is the fallback, covering addresses whose window prefix or session
 * keying does not line up.
 *
 * @param pending - the Session's effective pending interaction.
 * @param parsed - the tab's parsed address.
 * @param previewMarkdown - the document the tab was opened with.
 * @returns The matched carrier and review, or null for a read-only tab.
 */
export function matchCarrier(
  pending: QuestionCarrier | undefined,
  parsed: ReviewAddress | undefined,
  previewMarkdown: string | undefined,
): DocumentReviewWait | null {
  if (pending === undefined || parsed === undefined) return null
  const wait = documentReviewOf(pending)
  if (wait === null) return null
  if (parsed.requestKey !== undefined) {
    if (wait.interaction.key === parsed.requestKey && wait.interaction.sessionId === parsed.sessionId) return wait
    return wait.review.detail === previewMarkdown ? wait : null
  }
  if (parsed.callId !== undefined) {
    if (wait.review.callId === parsed.callId && wait.interaction.sessionId === parsed.sessionId) return wait
    return wait.review.detail === previewMarkdown ? wait : null
  }
  return null
}

/** The hover affordance's position (content coordinates) and anchor block. */
interface Affordance {
  readonly x: number
  readonly y: number
  readonly line: number
  readonly endLine: number
}

/** Localized chrome for the `MarkdownText` instances this tab renders. */
export function markdownLabelsOf(t: (key: DocReviewKey) => string): MarkdownLabels {
  return {
    code: {
      copyLabel: t('code.copy'),
      copiedLabel: t('code.copied'),
      toolbarLabels: { codeLabel: t('code.block'), wrapLabel: t('code.wrap'), unwrapLabel: t('code.unwrap') },
    },
    footnotes: t('footnotes'),
  }
}

/**
 * Render the review tab: the segmented, commentable document (or the read-only
 * native preview), the hover affordances, and the pending review's footer.
 *
 * @param props - framework runtime share, shared comment store, and copy.
 * @returns The taken-over review document.
 */
export function ReviewTab({
  useTabInfo, useResource, useSessionStatus, useStore, actions, t,
}: ReviewTabProps) {
  const tab = useTabInfo()
  const address = tab.tab.navigation.address
  const parsed = useMemo(() => parseReviewAddress(address), [address])
  const temporary = parsed?.requestKey !== undefined
  const resource = useResource<'plan'>(address)
  const params = tab.tab.navigation.params
  const paramDoc = params !== undefined && 'planReview' in params ? params.planReview : undefined

  // The carrier is looked up on the address's session — the review may have
  // been minted while another session was selected.
  const pending = useSessionStatus(snapshot =>
    parsed === undefined ? undefined : snapshot.get(parsed.sessionId)?.pendingInteraction)
  const previewMarkdown = temporary ? paramDoc?.markdown : resource.value?.markdown
  const matched = useMemo(
    () => matchCarrier(pending, parsed, previewMarkdown),
    [pending, parsed, previewMarkdown],
  )

  const markdown = matched?.review.detail ?? previewMarkdown
  const blocks = useMemo(() => (markdown === undefined ? [] : parseBlocks(markdown)), [markdown])
  const waitKey = matched?.interaction.key ?? ''
  const hash = useMemo(() => detailHashOf(markdown ?? ''), [markdown])
  const comments = useStore(state => commentsOf(state, waitKey, hash))

  // --- editor state ------------------------------------------------------
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftLine, setDraftLine] = useState<number | null>(null)
  const [draftEndLine, setDraftEndLine] = useState<number | undefined>(undefined)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [hover, setHover] = useState<Affordance | null>(null)
  const [confirming, setConfirming] = useState(false)

  const settle = (send: () => Promise<void>): void => {
    setBusy(true)
    setError(null)
    void send().catch((cause: unknown) => {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  // --- segmentation ------------------------------------------------------
  const anchorLines = useMemo(() => {
    const set = new Set<number>()
    for (const comment of comments) {
      const block = blockAtLine(blocks, comment.line)
      if (block !== undefined) set.add(block.startLine)
    }
    if (draftLine !== null) set.add(draftLine)
    return set
  }, [blocks, comments, draftLine])
  const segments = useMemo(
    () => partitionSegments(markdown ?? '', blocks, anchorLines),
    [markdown, blocks, anchorLines],
  )
  // Cards render after the segment whose LAST block the comment anchors to;
  // comments whose anchor no longer resolves render in the trailing group.
  const { cardsBySegment, orphans } = useMemo(() => {
    const map = new Map<number, readonly DocComment[]>()
    const tail: DocComment[] = []
    for (const comment of comments) {
      const block = blockAtLine(blocks, comment.line)
      const index = block === undefined
      ? -1
      : segments.findIndex(segment => segment.blocks[segment.blocks.length - 1] === block)
      if (index < 0) tail.push(comment)
      else map.set(index, [...map.get(index) ?? [], comment])
    }
    return { cardsBySegment: map, orphans: tail }
  }, [blocks, comments, segments])

  // --- alignment (the affordance map) -----------------------------------
  const contentRef = useRef<HTMLDivElement | null>(null)
  const alignmentsRef = useRef<ReadonlyMap<HTMLElement, SourceBlock>>(new Map())
  useLayoutEffect(() => {
    const merged = new Map<HTMLElement, SourceBlock>()
    const host = contentRef.current
    if (host !== null && matched !== null && !busy) {
      const wrappers = host.querySelectorAll<HTMLElement>('[data-drr-seg]')
      wrappers.forEach(wrapper => {
        const index = Number(wrapper.dataset.drrSeg)
        const segment = segments[index]
        const markdownRoot = wrapper.firstElementChild
        if (segment === undefined || markdownRoot === null) return
        const alignment = alignSegment(markdownRoot, segment.blocks)
        if (alignment.ok) {
          for (const [element, block] of alignment.byElement) merged.set(element, block)
        }
      })
    }
    alignmentsRef.current = merged
    setHover(null)
  }, [segments, matched, busy, tab.tab.navigation.revision])

  // --- comment actions ---------------------------------------------------
  const commit = (next: readonly DocComment[]): void => {
    actions.set(waitKey, hash, next)
  }
  const resetEditor = (): void => {
    setDraftLine(null)
    setDraftEndLine(undefined)
    setEditingId(null)
    setDraftText('')
  }
  const openDraft = (line: number, endLine: number | undefined): void => {
    if (busy) return
    setDraftLine(line)
    setDraftEndLine(endLine)
    setEditingId(null)
    setDraftText('')
    setHover(null)
  }
  const publishDraft = (): void => {
    if (draftLine === null || draftText.trim() === '') return
    actions.set(waitKey, hash, addComment(comments, { line: draftLine, endLine: draftEndLine }, draftText, Date.now()))
    setDraftLine(null)
    setDraftEndLine(undefined)
    setDraftText('')
  }
  const openEdit = (id: string): void => {
    const comment = comments.find(item => item.id === id)
    if (comment === undefined) return
    setEditingId(id)
    setDraftLine(null)
    setDraftEndLine(undefined)
    setDraftText(comment.text)
  }
  const saveEdit = (id: string): void => {
    if (draftText.trim() === '') return
    actions.set(waitKey, hash, updateComment(comments, id, draftText, Date.now()))
    setEditingId(null)
    setDraftText('')
  }
  const deleteOne = (id: string): void => {
    if (busy) return
    actions.set(waitKey, hash, deleteComment(comments, id))
  }

  // --- answer path -------------------------------------------------------
  const submitComments = (): void => {
    if (matched === null || comments.length === 0) return
    settle(async () => {
      await matched.interaction.answer({
        answers: [{ id: matched.review.id, selected: [], custom: buildFeedback(comments, blocks) }],
      })
      actions.drop(waitKey)
      resetEditor()
    })
  }
  const clearAll = (): void => {
    actions.drop(waitKey)
    resetEditor()
    setConfirming(false)
  }

  // --- hover + context-menu anchoring ------------------------------------
  const resolveBlock = (from: Node | null): { readonly element: HTMLElement; readonly block: SourceBlock } | null => {
    let node = from
    while (node !== null) {
      if (node.nodeType === 1) {
        const block = alignmentsRef.current.get(node as HTMLElement)
        if (block !== undefined) return { element: node as HTMLElement, block }
      }
      node = node.parentElement
    }
    return null
  }
  const onHover = (event: React.MouseEvent<HTMLDivElement>): void => {
    // Pointing at the affordance itself must keep it mounted — otherwise the
    // hover that shows it is the same event that removes it under the pointer.
    if (event.target instanceof Element && event.target.closest('.drr-afford') !== null) return
    if (matched === null || busy) {
      if (hover !== null) setHover(null)
      return
    }
    const hit = resolveBlock(event.target instanceof Node ? event.target : null)
    const host = contentRef.current
    if (hit === null || host === null) {
      if (hover !== null) setHover(null)
      return
    }
    const hostRect = host.getBoundingClientRect()
    const rect = hit.element.getBoundingClientRect()
    const next: Affordance = {
      x: rect.right - hostRect.left - 22,
      y: rect.top - hostRect.top - 12,
      line: hit.block.startLine,
      endLine: hit.block.endLine,
    }
    if (hover === null || hover.x !== next.x || hover.y !== next.y) setHover(next)
  }
  const onContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (matched === null || busy) return
    event.preventDefault()
    const selection = window.getSelection()
    const hit = selection !== null && selection.toString().trim() !== ''
      ? resolveBlock(selection.anchorNode)
      : resolveBlock(event.target instanceof Node ? event.target : null)
    if (hit === null) return
    openDraft(hit.block.startLine, hit.block.endLine)
  }

  const markdownLabels = useMemo(() => markdownLabelsOf(t), [t])

  if (markdown === undefined) {
    const message = temporary
      ? t('preview.expired')
      : resource.status === 'none'
        ? t('preview.unavailable')
        : resource.status === 'failed'
          ? t('preview.failed')
          : t('preview.loading')
    return (
      <section className="drr-root" aria-label={t('preview.title')}>
        <div className="drr-state" role="status">
          {message}
          {!temporary && resource.failure !== undefined && <p>{resource.failure.message}</p>}
        </div>
      </section>
    )
  }

  const renderCard = (comment: DocComment): ReactNode => (
    editingId === comment.id
      ? (
        <CommentEditor
          key={`edit-${comment.id}`}
          value={draftText}
          busy={busy}
          autoFocus
          placeholder={t('comment.placeholder')}
          publishLabel={t('comment.save')}
          cancelLabel={t('comment.cancelEdit')}
          onChange={setDraftText}
          onPublish={() => { saveEdit(comment.id) }}
          onCancel={() => { setEditingId(null); setDraftText('') }}
        />
      )
      : (
        <div key={comment.id} className="drr-comment" data-drr-comment={comment.id}>
          <div className="drr-comment-head">
            <span className="drr-comment-anchor">
              {t('comment.anchor').replace('{line}', String(comment.line))}
            </span>
            <span className="drr-comment-actions">
              <button type="button" className="drr-icon-btn" aria-label={t('comment.edit')}
                title={t('comment.edit')} disabled={busy}
                onClick={() => { openEdit(comment.id) }}>
                <IconEditOutlineRegular size={14} />
              </button>
              <button type="button" className="drr-icon-btn" aria-label={t('comment.delete')}
                title={t('comment.delete')} disabled={busy}
                onClick={() => { deleteOne(comment.id) }}>
                <IconTrashOutlineRegular size={14} />
              </button>
            </span>
          </div>
          <div className="drr-comment-text">
            <MarkdownText text={comment.text} labels={markdownLabels} variant="compact" />
          </div>
        </div>
      )
  )

  return (
    <section className="drr-root" data-doc-review-key={waitKey} aria-label={t('preview.title')}>
      <div
        className="drr-body"
        ref={contentRef}
        onMouseOver={onHover}
        onMouseLeave={() => { setHover(null) }}
        onContextMenu={onContextMenu}
      >
        {segments.map((segment, index) => {
          const last = segment.blocks[segment.blocks.length - 1]
          const cards = cardsBySegment.get(index) ?? []
          return (
            <Fragment key={`seg-${index}`}>
              <div className="drr-segment" data-drr-seg={index}>
                <MarkdownText text={segment.source} labels={markdownLabels} />
              </div>
              {last !== undefined && anchorLines.has(last.startLine) && (
                <div className="drr-seam" data-drr-seam={last.startLine}>
                  {cards.map(comment => renderCard(comment))}
                  {draftLine === last.startLine && (
                    <CommentEditor
                      value={draftText}
                      busy={busy}
                      autoFocus
                      placeholder={t('comment.placeholder')}
                      publishLabel={t('comment.publish')}
                      cancelLabel={t('comment.cancelEdit')}
                      onChange={setDraftText}
                      onPublish={publishDraft}
                      onCancel={() => { setDraftLine(null); setDraftEndLine(undefined); setDraftText('') }}
                    />
                  )}
                </div>
              )}
            </Fragment>
          )
        })}
        {orphans.length > 0 && (
          <div className="drr-orphan" data-drr-orphan="">
            {orphans.map(comment => renderCard(comment))}
          </div>
        )}
        {hover !== null && (
          <button
            type="button"
            className="drr-afford"
            style={{ left: hover.x, top: hover.y }}
            aria-label={t('comment.add')}
            title={t('comment.add')}
            onClick={() => { openDraft(hover.line, hover.endLine) }}
          >
            <IconPlusOutlineRegular size={13} />
          </button>
        )}
      </div>
      {matched !== null && (
        <footer className="drr-footer">
          <span className="drr-feedback" role="status">{error}</span>
          {comments.length > 0 && (
            <span className="drr-count">{t('comment.count').replace('{n}', String(comments.length))}</span>
          )}
          <div className="drr-footer-actions">
            <Button variant="ghost" size="sm" disabled={busy || comments.length === 0}
              onClick={() => { setConfirming(true) }}>
              {t('comment.clear')}
            </Button>
            <Button variant="primary" size="sm" disabled={busy || comments.length === 0}
              onClick={submitComments}>
              {t('comment.submitAll')}
            </Button>
          </div>
        </footer>
      )}
      <Modal
        open={confirming}
        onClose={() => { setConfirming(false) }}
        headless
        title={t('comment.confirmTitle')}
        className="drr-confirm"
      >
        <div className="drr-confirm-body">
          <h2>{t('comment.confirmTitle')}</h2>
          <p>{t('comment.confirmBody')}</p>
        </div>
        <div className="drr-confirm-actions">
          <Button variant="ghost" size="sm" onClick={() => { setConfirming(false) }}>
            {t('comment.confirmCancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={clearAll}>{t('comment.confirmOk')}</Button>
        </div>
      </Modal>
    </section>
  )
}

/** The controlled comment textarea shared by the draft and the edit flows. */
function CommentEditor(props: {
  value: string
  busy: boolean
  autoFocus: boolean
  placeholder: string
  publishLabel: string
  cancelLabel: string
  onChange: (text: string) => void
  onPublish: () => void
  onCancel: () => void
}) {
  return (
    <div className="drr-editor">
      <textarea
        autoFocus={props.autoFocus}
        className="drr-editor-input"
        rows={1}
        value={props.value}
        disabled={props.busy}
        placeholder={props.placeholder}
        onChange={(event) => { props.onChange(event.target.value) }}
      />
      <div className="drr-editor-actions">
        <Button variant="primary" size="sm" disabled={props.busy || props.value.trim() === ''}
          onClick={props.onPublish}>
          {props.publishLabel}
        </Button>
        <Button variant="ghost" size="sm" disabled={props.busy} onClick={props.onCancel}>
          {props.cancelLabel}
        </Button>
      </div>
    </div>
  )
}

/**
 * The tab's chip title: the opened document's title (navigation parameters or
 * the logged plan's recovered heading), mirroring the native preview's title.
 * @param props - framework runtime share of the title seat.
 * @returns The file icon plus the current title.
 */
export function ReviewTabTitle({ useTabInfo, useResource }: PropsRuntime<'sidebar.right.pane.tab.title'>) {
  const tab = useTabInfo()
  const address = tab.tab.navigation.address
  const parsed = useMemo(() => parseReviewAddress(address), [address])
  const resource = useResource<'plan'>(address)
  const params = tab.tab.navigation.params
  const paramDoc = params !== undefined && 'planReview' in params ? params.planReview : undefined
  const title = (parsed?.requestKey !== undefined ? paramDoc?.title : resource.value?.title)
    ?? paramDoc?.title
    ?? resource.value?.title
    ?? tab.tab.title
  return <><FileTypeIcon kind="other" size={16} className="drr-title-icon" />{title}</>
}