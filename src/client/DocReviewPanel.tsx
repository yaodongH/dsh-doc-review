/**
 * DocReviewPanel: the composer-chain takeover for document-shaped question
 * carriers (see claim.ts for the claim). A document review is one decision
 * over one rendered markdown body, so it takes a full review window: a modal
 * that auto-opens with the rendered document, a fixed header (document title,
 * stage header, question text) and a fixed decision footer (option buttons,
 * custom answer, "chat about it"), with a scrollable markdown body between.
 *
 * Closing the modal (X / Escape / mask) collapses the takeover to a compact
 * control bar in the composer seat — the same title, option buttons and
 * dismiss affordance — so the decision never depends on the modal being open.
 * Closing is NOT a dismissal: the request stays pending until an option, the
 * custom answer, or the dismiss button answers it.
 *
 * The three answer paths are the whole decision surface: an option click
 * answers with the asker's own label verbatim (single-select submits at
 * once, as the built-in flow does), the custom field answers with
 * `{ selected: [], custom }`, and dismiss cancels the request so the composer
 * returns and the user can simply say what they want. The one busy latch locks
 * every affordance until the request settles; a rejected answer or cancel
 * re-arms it and says why.
 *
 * Line comments (the "文档行内评论" feature) layer a second decision mode on
 * top: while any comment exists, both footers swap to 提交评论 / 取消 —
 * options, the custom input and dismiss are hidden so a half-finished review
 * can never be approved. 提交评论 aggregates every comment into one custom
 * answer; 取消 clears them locally after a secondary confirmation, without
 * answering. Comments persist under `dsh-doc-review:v1:comments:<key>` and
 * are cleared on submit and dismiss.
 */

import { useMemo, useState } from 'react'
import {
  Button, IconCloseOutlineRegular, IconFullscreenOutlineRegular, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentReview, DocumentReviewWait } from './claim.ts'
import {
  addComment, buildFeedback, clearComments, deleteComment, detailHashOf,
  loadComments, saveComments, splitLines, updateComment, type DocComment,
} from './comments.ts'
import { LineGrid, type ContextMenuState } from './lines.tsx'
import type { DocReviewKey } from './locales.ts'

/** Full panel props: the framework runtime share plus the chain `matched` share plus the locale seat. */
export type DocReviewPanelProps =
  PropsRuntime<'conversation.composer'> & { matched: DocumentReviewWait } & PropsLocale<'doc-review'>

/** One option as rendered: display label, recommendation state, asker description. */
interface RenderedOption {
  /** The answer-carrying label (verbatim, suffix included). */
  label: string
  /** Display label with the conventional recommendation suffix stripped. */
  display: string
  /** Whether the option carried the recommendation suffix. */
  recommended: boolean
  description: string | undefined
}

/**
 * Split the conventional recommendation suffix without changing the answer
 * value (mirrors the built-in question composer's label parsing).
 * @param label - the option label, returned verbatim on selection.
 * @returns display label plus recommendation state.
 */
export function parseRecommendedLabel(label: string): { label: string; recommended: boolean } {
  const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i
  return suffix.test(label)
    ? { label: label.replace(suffix, ''), recommended: true }
    : { label, recommended: false }
}

/**
 * The document's first markdown heading (any level), or undefined when it has
 * none (mirrors the plan-mode host's own helper, so titles agree across
 * surfaces).
 * @param markdown - the document source.
 * @returns the first heading text, or undefined.
 */
export function firstHeading(markdown: string): string | undefined {
  for (const line of markdown.split('\n')) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    if (match) return match[1]
  }
  return undefined
}

/** Whether a label is Latin-script (English) — the signal for localizing a
 * plan-review intent's buttons; Chinese labels (adaptive pipeline's 确认定稿)
 * stay verbatim. */
function isLatinLabel(label: string): boolean {
  return /^[A-Za-z]/.test(label)
}

/** The shared decision row: feedback, one button line (options + dismiss),
 * and the custom-feedback line (modal only). Rendered in exactly one surface
 * at a time — the modal while expanded, the control bar while collapsed — so
 * the same decision never appears twice. */
function DecisionRow(props: {
  options: readonly RenderedOption[]
  primaryLabel: string | undefined
  /** Whether the two intent buttons render localized copy (English labels only). */
  localizeLabels: boolean
  approveLabel: string | undefined
  busy: boolean
  error: string | null
  withCustom: boolean
  custom: string
  t: (key: DocReviewKey) => string
  onChoose: (label: string) => void
  onCustomChange: (value: string) => void
  onSubmitCustom: () => void
  onDismiss: () => void
}) {
  const {
    options, primaryLabel, localizeLabels, approveLabel, busy, error,
    withCustom, custom, t, onChoose, onCustomChange, onSubmitCustom, onDismiss,
  } = props
  return (
    <>
      <div className="dr-feedback" role="status">{error}</div>
      <div className="dr-actions-row">
        {options.length > 0 && (
          <div className="dr-options">
            {options.map(option => {
              // The answer still carries the asker's label verbatim; only the
              // button COPY is localized for the plan-review intent's two
              // English labels (Approve / Keep planning).
              const localized = localizeLabels
                ? (option.label === approveLabel ? t('doc.approve') : t('doc.decline'))
                : undefined
              return (
                <Button
                  key={option.label}
                  size="sm"
                  variant={option.label === primaryLabel ? 'primary' : 'outline'}
                  title={option.description}
                  disabled={busy}
                  onClick={() => { onChoose(option.label) }}
                >
                  {localized ?? option.display}
                  {localized === undefined && option.recommended && (
                    <span className="dr-badge">{t('option.recommended')}</span>
                  )}
                </Button>
              )
            })}
          </div>
        )}
        <Button variant="ghost" size="sm" className="dr-cancel" disabled={busy} onClick={onDismiss}>
          {t('action.cancel')}
        </Button>
      </div>
      {withCustom && (
        <div className="dr-custom">
          <textarea
            className="dr-custom-input"
            rows={1}
            value={custom}
            disabled={busy}
            placeholder={t('custom.placeholder')}
            onChange={(event) => { onCustomChange(event.target.value) }}
          />
          <Button variant="primary" size="sm" disabled={busy || custom.trim() === ''} onClick={onSubmitCustom}>
            {t('action.submit')}
          </Button>
        </div>
      )}
    </>
  )
}

/**
 * Render the document review: the control bar always, the review modal while
 * expanded.
 *
 * @param props - the chain match (carrier + narrowed review) plus the locale seat.
 * @returns The takeover for this request.
 */
export function DocReviewPanel({ matched, t }: DocReviewPanelProps) {
  const { interaction, review } = matched
  // The modal opens on arrival; closing it never dismisses the request.
  const [expanded, setExpanded] = useState(true)
  // One-shot latch shaped like the built-in takeover's: the panel leaves only
  // when the request settles and the chain re-elects, so until then a second
  // click must not re-fire. A rejected answer or cancel re-arms it and shows why.
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [custom, setCustom] = useState('')

  // --- line comments -----------------------------------------------------
  const sourceLines = useMemo(() => splitLines(review.detail), [review.detail])
  const hash = useMemo(() => detailHashOf(review.detail), [review.detail])
  const [comments, setComments] = useState<DocComment[]>(() => loadComments(interaction.key, hash))
  const [draftLine, setDraftLine] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [confirming, setConfirming] = useState(false)
  const hasComments = comments.length > 0

  const title = useMemo(() => firstHeading(review.detail) ?? t('doc.header'), [review.detail, t])
  const options = useMemo<RenderedOption[]>(
    () => review.options.map(option => {
      const parsed = parseRecommendedLabel(option.label)
      return {
        label: option.label,
        display: parsed.label,
        recommended: parsed.recommended,
        description: option.description,
      }
    }),
    [review.options],
  )
  // Primary button: the plan-review intent's approve label when present, else
  // the option the asker recommended, else none (the custom submit is primary).
  const primaryLabel = review.approveLabel
    ?? options.find(option => option.recommended)?.label
  // Localize the two intent buttons only for the plan-review intent's standard
  // shape with English labels (Approve / Keep planning); Chinese labels stay
  // verbatim, and anything wider keeps the asker's own copy.
  const localizeLabels = review.approveLabel !== undefined
    && options.length === 2
    && options.some(option => option.label === review.approveLabel)
    && isLatinLabel(review.approveLabel)

  const settle = (send: () => Promise<void>): void => {
    setBusy(true)
    setError(null)
    void send().catch((cause: unknown) => {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  /** Deliver one answer batch through the carrier; a settled carrier rejects. */
  const answer = async (item: { selected: string[]; custom?: string }): Promise<void> => {
    await interaction.answer({ answers: [{ id: review.id, ...item }] })
  }

  /** Cancel the whole request (the host resolves the tool call as cancelled); a settled carrier rejects. */
  const dismiss = async (): Promise<void> => {
    await interaction.cancel()
  }

  const decide = (label: string): void => settle(() => answer({ selected: [label] }))
  // The submit button is disabled while the draft is empty (the disabled
  // affordance IS the validation, as in the built-in question composer).
  const submitCustom = (): void => settle(() => answer({ selected: [], custom: custom.trim() }))
  const cancel = (): void => settle(dismiss)

  // --- comment handlers ---------------------------------------------------
  /** Every mutating comment action is ignored while a send is in flight. */
  const guard = <A extends unknown[]>(fn: (...args: A) => void): ((...args: A) => void) =>
    (...args: A) => { if (busy) return; fn(...args) }

  /** Persist the next comment state (setState + localStorage in one commit). */
  const commit = (next: DocComment[]): void => {
    setComments(next)
    saveComments(interaction.key, next, hash)
  }

  /** Clear the in-memory and persisted comment state. */
  const clearAll = (): void => {
    setComments([])
    clearComments(interaction.key)
  }

  const resetEditor = (): void => {
    setDraftLine(null)
    setEditingId(null)
    setDraftText('')
  }

  const openContextMenu = guard((line: number, x: number, y: number) => { setContextMenu({ x, y, line }) })
  const closeContextMenu = (): void => { setContextMenu(null) }
  const openDraft = guard((line: number) => {
    closeContextMenu()
    setDraftLine(line)
    setEditingId(null)
    setDraftText('')
  })
  const changeDraft = (text: string): void => { setDraftText(text) }
  const publishDraft = guard(() => {
    if (draftLine === null || draftText.trim() === '') return
    commit(addComment(comments, { line: draftLine, text: draftText }, Date.now()))
    setDraftLine(null)
    setDraftText('')
  })
  const openEdit = guard((id: string) => {
    const comment = comments.find(item => item.id === id)
    if (comment === undefined) return
    closeContextMenu()
    setEditingId(id)
    setDraftLine(null)
    setDraftText(comment.text)
  })
  const saveEdit = guard((id: string) => {
    if (draftText.trim() === '') return
    commit(updateComment(comments, id, draftText, Date.now()))
    setEditingId(null)
    setDraftText('')
  })
  const cancelEdit = (): void => {
    setEditingId(null)
    setDraftText('')
  }
  const deleteOne = guard((id: string) => { commit(deleteComment(comments, id)) })

  /** 提交评论: one aggregated feedback answer; success clears the comments. */
  const submitComments = guard(() => {
    settle(async () => {
      await answer({ selected: [], custom: buildFeedback(comments, sourceLines) })
      clearAll()
      resetEditor()
    })
  })
  const openConfirm = guard(() => { setConfirming(true) })
  /** 确定: clear locally only — no answer is sent, the review stays open. */
  const confirmClear = (): void => {
    clearAll()
    resetEditor()
    setConfirming(false)
  }
  const cancelConfirm = (): void => { setConfirming(false) }
  /** dismiss 去聊天里说: existing cancelled envelope + defensive persistence clear. */
  const dismissReview = (): void => settle(async () => {
    await dismiss()
    clearComments(interaction.key)
  })

  /** The review modal's close path: first the context menu, then the confirm
   * dialog, only then collapse — so Escape never skips a nested surface. */
  const closeReview = (): void => {
    if (contextMenu !== null) { setContextMenu(null); return }
    if (confirming) { setConfirming(false); return }
    setExpanded(false)
  }

  /** The comment-mode footer shared by the modal footer and the collapsed bar. */
  const CommentFooter = (): JSX.Element => (
    <div className="dr-review-actions">
      <Button variant="primary" size="sm" disabled={busy} onClick={submitComments}>
        {t('comment.submitAll')}
      </Button>
      <Button variant="ghost" size="sm" className="dr-cancel" disabled={busy} onClick={openConfirm}>
        {t('comment.cancelAll')}
      </Button>
    </div>
  )

  const row = {
    options,
    primaryLabel,
    localizeLabels,
    approveLabel: review.approveLabel,
    busy,
    error,
    custom,
    t,
    onChoose: decide,
    onCustomChange: (value: string) => { setCustom(value); setError(null) },
    onSubmitCustom: submitCustom,
    onDismiss: dismissReview,
  }

  return (
    <div className="dr-frame" data-doc-review-key={interaction.key}>
      <section className="dr-bar" aria-label={review.question}>
        <div className="dr-bar-head">
          <span className="dr-bar-dot" aria-hidden="true" />
          <span className="dr-bar-title">{title}</span>
          {hasComments && (
            <span className="dr-bar-count">{t('comment.count').replace('{n}', String(comments.length))}</span>
          )}
          {!expanded && (
            <button
              type="button"
              className="dr-bar-expand"
              aria-label={t('doc.expand')}
              title={t('doc.expand')}
              disabled={busy}
              onClick={() => { setExpanded(true) }}
            >
              <IconFullscreenOutlineRegular size={16} />
            </button>
          )}
        </div>
        {!expanded && (
          <div className="dr-bar-body">
            {hasComments ? <CommentFooter /> : <DecisionRow {...row} withCustom={false} />}
          </div>
        )}
      </section>
      <Modal
        open={expanded}
        onClose={closeReview}
        headless
        title={title}
        className="dr-modal"
      >
        <div className="dr-modal-head">
          <div className="dr-modal-titles">
            {review.header !== undefined && <span className="dr-modal-kicker">{review.header}</span>}
            <h2 className="dr-modal-title">{title}</h2>
          </div>
          <button type="button" className="dr-modal-close" aria-label={t('doc.close')} onClick={closeReview}>
            <IconCloseOutlineRegular size={14} />
          </button>
        </div>
        <p className="dr-modal-question">{review.question}</p>
        <div className="dr-modal-body" data-doc-review-scroll>
          <LineGrid
            detail={review.detail}
            comments={comments}
            draftLine={draftLine}
            editingId={editingId}
            draftText={draftText}
            busy={busy}
            contextMenu={contextMenu}
            t={t}
            onContextMenuOpen={openContextMenu}
            onContextMenuClose={closeContextMenu}
            onDraftOpen={openDraft}
            onDraftChange={changeDraft}
            onDraftPublish={publishDraft}
            onDraftCancel={() => { setDraftLine(null); setDraftText('') }}
            onEditOpen={openEdit}
            onEditSave={saveEdit}
            onEditCancel={cancelEdit}
            onDelete={deleteOne}
          />
        </div>
        <div className="dr-modal-footer">
          {hasComments
            ? (
              <>
                <div className="dr-feedback" role="status">{error}</div>
                <CommentFooter />
              </>
            )
            : <DecisionRow {...row} withCustom />}
        </div>
      </Modal>
      <Modal
        open={confirming}
        onClose={cancelConfirm}
        headless
        title={t('comment.confirmTitle')}
        className="dr-confirm"
      >
        <div className="dr-confirm-body">
          <h2>{t('comment.confirmTitle')}</h2>
          <p>{t('comment.confirmBody')}</p>
        </div>
        <div className="dr-confirm-actions">
          <Button variant="ghost" size="sm" onClick={cancelConfirm}>
            {t('comment.confirmCancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={confirmClear}>
            {t('comment.confirmOk')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
