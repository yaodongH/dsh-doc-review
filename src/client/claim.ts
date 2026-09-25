/**
 * Narrowing for the pending carriers this plugin's review tab can serve: a
 * document review is ONE question whose detail is a renderable markdown
 * document (it carries an ATX heading) with at most three single-select
 * options and either no presentation intent or the plan-review intent. The
 * pure predicate is shared by the tab body and the decision-card badge, which
 * both receive the Session's effective pending interaction and re-read its
 * domain discriminator at runtime — the assembled Client unions every domain's
 * carrier, and this program compiles against the question member alone.
 */

import type { PendingQuestion } from '@deepseek-ai/dsh-client-ui-user-questions/client'

/**
 * The pending-question facts the review surfaces render and answer with: the
 * question domain's own carrier, narrowed to the five members the comment
 * store and the submit surface touch.
 */
export type QuestionCarrier = Pick<
  PendingQuestion, 'key' | 'kind' | 'sessionId' | 'questions' | 'answer' | 'cancel'
>

/** One question item of the carrier, as the wire carries it. */
type QuestionItem = QuestionCarrier['questions'][number]

/** The document test: an ATX heading line anywhere in the detail. */
const HEADING = /^#{1,6}\s+\S/m

/** Max options the decision row can render as one-tap buttons. */
const MAX_OPTIONS = 3

/** One option the asker offered on the question. */
export interface DocumentReviewOption {
  label: string
  description?: string
}

/** The narrowed document-review facts the review tab renders and answers with. */
export interface DocumentReview {
  /** The reviewed question's id, echoed in the answer. */
  id: string
  /** The question text, kept as the surfaces' accessible name. */
  question: string
  /** The document markdown under review. */
  detail: string
  /** Logged plan invocation backing the review, when the request carries one. */
  callId: string | undefined
  /** The plan-review intent's approve label, when the request carries one. */
  approveLabel: string | undefined
}

/** The narrowed review together with its carrier. */
export interface DocumentReviewWait {
  /** The pending question this tab answers. */
  interaction: QuestionCarrier
  /** The narrowed review. */
  review: DocumentReview
}

/** Whether the detail is a renderable markdown document (has a heading). */
function isDocument(detail: unknown): detail is string {
  return typeof detail === 'string' && detail.trim() !== '' && HEADING.test(detail)
}

/**
 * Narrow a pending question carrier to a document review, or return null to
 * leave it to the built-in flows.
 *
 * The narrowing accepts a request only when it can express every answer it
 * allows: one single-select question with a document-shaped detail and at
 * most three options. Anything wider stays on the generic question flow.
 *
 * @param interaction - the Session's effective pending interaction.
 * @returns The narrowed review, or null when this plugin does not apply.
 */
export function documentReviewOf(interaction: QuestionCarrier): DocumentReviewWait | null {
  // The assembled Client unions every domain's carrier (approvals included);
  // this program compiles against the question member alone, so the domain
  // discriminator is re-read here rather than trusted from the type.
  if (interaction.kind !== 'question' && interaction.kind !== 'plan-review') return null
  const questions = interaction.questions
  if (questions.length !== 1) return null
  // Length-checked above; the index read is the narrowing tax, not a guess.
  const question = questions[0] as QuestionItem
  if (question.multiSelect === true) return null
  if (question.intent !== undefined && question.intent.kind !== 'plan-review') return null
  if (!isDocument(question.detail)) return null
  const options = question.options ?? []
  if (options.length > MAX_OPTIONS) return null
  return {
    interaction,
    review: {
      id: question.id,
      question: question.question,
      detail: question.detail,
      callId: question.intent?.callId,
      approveLabel: question.intent?.approve,
    },
  }
}