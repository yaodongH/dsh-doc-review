/**
 * DocReviewPanel: the composer-chain takeover for document-shaped question
 * waits (see claim.ts for the claim). A document review is one decision over
 * one rendered markdown body, so it takes a full review window: a modal that
 * auto-opens with the rendered document, a fixed header (document title,
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
 * `{ selected: [], custom }`, and dismiss rejects the wait as cancelled so
 * the composer returns and the user can simply say what they want. The one
 * busy latch locks every affordance until the host's resolved frame lands;
 * a failed send re-arms it and says why.
 */

import { useMemo, useState } from 'react'
import {
  Button, IconCloseOutline16, IconFullscreenOutline16, MarkdownText, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentReview, DocumentReviewWait } from './claim.ts'
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
  const { wait, review } = matched
  // The modal opens on arrival; closing it never dismisses the request.
  const [expanded, setExpanded] = useState(true)
  // One-shot latch shaped like the built-in takeover's: the panel leaves only
  // when the host's resolved frame lands, so until then a second click must
  // not re-fire. A failed send re-arms it and shows why.
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [custom, setCustom] = useState('')

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

  /** Deliver one answer batch; a rejected carrier receipt throws. */
  const answer = async (item: { selected: string[]; custom?: string }): Promise<void> => {
    const receipt = await wait.respond({
      ok: true,
      value: { sessionId: wait.sessionId, answer: { answers: [{ id: review.id, ...item }] } },
    })
    if (!receipt.accepted) {
      throw new Error(`question response rejected: ${receipt.reason}`)
    }
  }

  /** Reject the whole wait (the host resolves the tool call as cancelled); a rejected receipt throws. */
  const dismiss = async (): Promise<void> => {
    const receipt = await wait.respond({
      ok: false,
      error: { code: 'cancelled', message: 'the user closed this question request', details: {} },
    })
    if (!receipt.accepted) {
      throw new Error(`question cancellation rejected: ${receipt.reason}`)
    }
  }

  const decide = (label: string): void => settle(() => answer({ selected: [label] }))
  // The submit button is disabled while the draft is empty (the disabled
  // affordance IS the validation, as in the built-in question composer).
  const submitCustom = (): void => settle(() => answer({ selected: [], custom: custom.trim() }))
  const cancel = (): void => settle(dismiss)

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
    onDismiss: cancel,
  }

  return (
    <div className="dr-frame" data-doc-review-key={wait.key}>
      <section className="dr-bar" aria-label={review.question}>
        <div className="dr-bar-head">
          <span className="dr-bar-dot" aria-hidden="true" />
          <span className="dr-bar-title">{title}</span>
          {!expanded && (
            <button
              type="button"
              className="dr-bar-expand"
              aria-label={t('doc.expand')}
              title={t('doc.expand')}
              disabled={busy}
              onClick={() => { setExpanded(true) }}
            >
              <IconFullscreenOutline16 size={16} />
            </button>
          )}
        </div>
        {!expanded && (
          <div className="dr-bar-body">
            <DecisionRow {...row} withCustom={false} />
          </div>
        )}
      </section>
      <Modal
        open={expanded}
        onClose={() => { setExpanded(false) }}
        headless
        title={title}
        closeLabel={t('doc.close')}
        className="dr-modal"
      >
        <div className="dr-modal-head">
          <div className="dr-modal-titles">
            {review.header !== undefined && <span className="dr-modal-kicker">{review.header}</span>}
            <h2 className="dr-modal-title">{title}</h2>
          </div>
          <button type="button" className="dr-modal-close" aria-label={t('doc.close')} onClick={() => { setExpanded(false) }}>
            <IconCloseOutline16 size={14} />
          </button>
        </div>
        <p className="dr-modal-question">{review.question}</p>
        <div className="dr-modal-body" data-doc-review-scroll>
          <MarkdownText text={review.detail} />
        </div>
        <div className="dr-modal-footer">
          <DecisionRow {...row} withCustom />
        </div>
      </Modal>
    </div>
  )
}
