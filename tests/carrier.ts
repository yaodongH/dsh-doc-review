/**
 * Shared spec fixture: one pending question carrier, shaped as the Session's
 * pending-interaction registry hands it to a slot component. `PendingQuestion`
 * owns private settlement state, so a stub is asserted into its type in this
 * one place; every spec then drives the real narrowing predicate, the real
 * review tab and the real slot types over it.
 */
import { vi, type Mock } from 'vitest'
import type { PendingQuestion } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { QuestionCarrier } from '../src/client/claim.ts'

/** One answer batch as the carrier receives it. */
export type AnswerBatch = Parameters<QuestionCarrier['answer']>[0]

/** The carrier stub plus the spies its answer surface records. */
export interface CarrierFixture {
  /** The carrier, typed as the pending registry hands it to a consumer. */
  interaction: PendingQuestion
  /** Records every answer batch the review delivers. */
  answer: Mock<(batch: AnswerBatch) => Promise<void>>
  /** Records every cancellation the review delivers. */
  cancel: Mock<() => Promise<void>>
}

/** The fixture key, in the carrier's own `question:<n>` form. */
export const CARRIER_KEY = 'question:1'

/** The fixture carrier's session. */
export const CARRIER_SESSION = 's1' as PendingQuestion['sessionId']

/**
 * Build one pending question carrier over a question batch.
 * @param questions - complete question batch.
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
    sessionId: CARRIER_SESSION,
    questions,
    answer,
    cancel,
  } as unknown as PendingQuestion
  return { interaction, answer, cancel }
}

/** The reviewed document fixture: headings, paragraphs, lists, a table, a fence. */
export const REVIEW_DOC = [
  '# 概要设计：仓库管理',
  '',
  '## 架构',
  '',
  '前端使用 React，后端使用 Node。',
  '',
  '## 风险',
  '',
  '- 依赖升级风险',
  '- 兼容性风险',
  '',
  '| 模块 | 说明 |',
  '| --- | --- |',
  '| 存储 | SQLite |',
  '',
  '```ts',
  'const ready = true',
  '```',
  '',
].join('\n')

/** The request shape over {@link REVIEW_DOC}: two single-select options. */
export function reviewQuestions(detail: string = REVIEW_DOC): QuestionCarrier['questions'] {
  return [{
    id: 'doc-1',
    header: '概要设计 · 阶段提问',
    question: '请审阅以上设计文档',
    detail,
    options: [
      { label: '确认定稿', description: '确认内容无误，将保存为定稿文件并推进流水线。' },
      { label: '需要修改', description: '需要修改，可在补充回答中填写修改意见。' },
    ],
    intent: { kind: 'plan-review', approve: '确认定稿' },
  }]
}