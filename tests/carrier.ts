/**
 * Shared spec fixture: one pending question carrier, shaped as the composer
 * chain dispatches it. `PendingQuestion` owns private settlement state, so a
 * stub is asserted into its type in this one place; both specs then drive the
 * real claim predicate, the real panel and the real chain types over it.
 */
import { vi, type Mock } from 'vitest'
import type { PendingQuestion } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { QuestionCarrier } from '../src/client/claim.ts'

/** One answer batch as the carrier receives it. */
export type AnswerBatch = Parameters<QuestionCarrier['answer']>[0]

/** The carrier stub plus the spies its answer surface records. */
export interface CarrierFixture {
  /** The carrier, typed as the chain hands it to the selector. */
  interaction: PendingQuestion
  /** Records every answer batch the takeover delivers. */
  answer: Mock<(batch: AnswerBatch) => Promise<void>>
  /** Records every cancellation the takeover delivers. */
  cancel: Mock<() => Promise<void>>
}

/** The fixture key, in the carrier's own `question:<n>` form. */
export const CARRIER_KEY = 'question:q-1'

/**
 * Build one pending question carrier over a question batch.
 * @param questions - the request's whole batch.
 * @param spies - optional answer/cancel implementations (default: resolve).
 * @returns The carrier plus its recording spies.
 */
export function questionCarrier(
  questions: QuestionCarrier['questions'],
  spies: {
    answer?: (batch: AnswerBatch) => Promise<void>
    cancel?: () => Promise<void>
  } = {},
): CarrierFixture {
  const answer = vi.fn(spies.answer ?? (async (_batch: AnswerBatch): Promise<void> => {}))
  const cancel = vi.fn(spies.cancel ?? (async (): Promise<void> => {}))
  const interaction = {
    key: CARRIER_KEY,
    kind: 'question',
    questions,
    answer,
    cancel,
  } as unknown as PendingQuestion
  return { interaction, answer, cancel }
}
