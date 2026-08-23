/**
 * Claim logic for the document-review takeover: which pending question waits
 * this plugin renders. A document review is ONE question whose detail is a
 * rendered markdown document (it carries an ATX heading) with at most three
 * single-select options and either no presentation intent or the plan-review
 * intent. Every other request stays on the built-in question composer, so the
 * plugin only changes the surface for document-shaped materials.
 */
import type { PendingWait } from '@deepseek-ai/dsh-client-runtime/client'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** One question item of the carrier payload, as the wire carries it. */
type QuestionItem = PendingWait<'question'>['payload']['questions'][number]

/** The document test: an ATX heading line anywhere in the detail. */
const HEADING = /^#{1,6}\s+\S/m

/** Max options the decision row can render as one-tap buttons. */
const MAX_OPTIONS = 3

/** One option the asker offered on the question. */
export interface DocumentReviewOption {
  label: string
  description?: string
}

/** The narrowed document-review facts the panel renders and answers with. */
export interface DocumentReview {
  /** The reviewed question's id, echoed in the answer. */
  id: string
  /** The question text, kept as the surfaces' accessible name. */
  question: string
  /** The stage-scoped group label (e.g. `概要设计 · 阶段提问`), when present. */
  header: string | undefined
  /** The document markdown under review. */
  detail: string
  /** The asker's option list (at most MAX_OPTIONS). */
  options: readonly DocumentReviewOption[]
  /** The plan-review intent's approve label, when the request carries one. */
  approveLabel: string | undefined
}

/** The chain-match result: the carrier plus the narrowed review. */
export interface DocumentReviewWait {
  wait: PendingWait<'question'>
  review: DocumentReview
}

/** Whether the detail is a renderable markdown document (has a heading). */
function isDocument(detail: unknown): detail is string {
  return typeof detail === 'string' && detail.trim() !== '' && HEADING.test(detail)
}

/**
 * Narrow a question wait to a document review, or return null to leave it to
 * the built-in question composer.
 *
 * The takeover claims a request only when it can render every answer that
 * request allows, so the batch must be a single question that carries a
 * document-shaped detail and at most three single-select options; anything
 * the modal's decision row cannot express stays on the generic flow.
 *
 * @param wait - the pending question carrier.
 * @returns The narrowed review, or null when the generic flow owns it.
 */
export function documentReviewOf(wait: PendingWait<'question'>): DocumentReviewWait | null {
  const questions = wait.payload.questions
  if (questions.length !== 1) return null
  // Length-checked above; the index read is the narrowing tax, not a guess.
  const question = questions[0] as QuestionItem
  if (question.multiSelect === true) return null
  if (question.intent !== undefined && question.intent.kind !== 'plan-review') return null
  if (!isDocument(question.detail)) return null
  const options = question.options ?? []
  if (options.length > MAX_OPTIONS) return null
  return {
    wait,
    review: {
      id: question.id,
      question: question.question,
      header: question.header,
      detail: question.detail,
      options,
      approveLabel: question.intent?.approve,
    },
  }
}

/**
 * Composer-chain selector: claim the first pending question wait that is a
 * document review. Runs at priority -1 (before the built-in question
 * composer's default 0), so document reviews get the modal surface and every
 * other pending question falls through unchanged.
 *
 * @param owner - the composer chain currency dispatched by ConversationRoot.
 * @returns The narrowed document review, or null to leave the chain to the next entry.
 */
export function selectDocumentReview({ interactions }: ComposerChainProps): DocumentReviewWait | null {
  const wait = interactions.find(
    (interaction): interaction is PendingWait<'question'> => interaction.kind === 'question',
  )
  return wait === undefined ? null : documentReviewOf(wait)
}
