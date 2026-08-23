// @vitest-environment jsdom
/**
 * Claim-matrix and markdown-helper unit tests: which pending question waits
 * the document-review takeover claims, and the pure helpers the panel trusts
 * (first heading, recommendation suffix). The claim predicate is the
 * invariant this package owns — the chain selector and the panel both rely on
 * it, and every acceptance path is pinned here.
 */
import { describe, expect, it } from 'vitest'
import { PendingWait } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { RpcId } from '@deepseek-ai/dsh-client-connection/client'
import { documentReviewOf, selectDocumentReview } from '../src/client/claim.ts'
import { firstHeading, parseRecommendedLabel } from '../src/client/DocReviewPanel.tsx'

/** The question carrier type under test (PendingWait narrowed to questions). */
type QuestionWait = PendingWait<'question'>

const SID = 's1' as SessionId

const DOC = '# 概要设计：仓库管理\n\n## 架构\n\n- 模块 A\n- 模块 B\n'

const questions = (): QuestionWait['payload']['questions'] => [{
  id: 'doc-1',
  question: '请审阅以上设计文档',
  header: '概要设计 · 阶段提问',
  detail: DOC,
  options: [
    { label: '确认' },
    { label: '需要修改' },
  ],
}]

function wait(payload: QuestionWait['payload'] = { questions: questions() }): PendingWait<'question'> {
  return new PendingWait('question', RpcId('q-1'), SID, payload, async () => ({ accepted: true }))
}

describe('documentReviewOf', () => {
  it('claims a single document-shaped question with its options and stage header', () => {
    const match = documentReviewOf(wait())
    expect(match).not.toBeNull()
    expect(match?.review).toEqual({
      id: 'doc-1',
      question: '请审阅以上设计文档',
      header: '概要设计 · 阶段提问',
      detail: DOC,
      options: [{ label: '确认' }, { label: '需要修改' }],
      approveLabel: undefined,
    })
  })

  it('claims a plan-review intent and carries its approve label', () => {
    const [question] = questions()
    const match = documentReviewOf(wait({ questions: [{
      ...question as object,
      intent: { kind: 'plan-review', approve: 'Approve' },
      options: [{ label: 'Approve' }, { label: 'Keep planning' }],
    }] as never }))
    expect(match?.review.approveLabel).toBe('Approve')
  })

  it('claims a question with no options at all', () => {
    const [question] = questions()
    const match = documentReviewOf(wait({ questions: [{ ...question as object, options: undefined }] as never }))
    expect(match?.review.options).toEqual([])
  })

  it.each([
    ['an empty batch', () => []],
    ['more than one question', () => [...questions(), ...questions()]],
    ['no detail at all', () => [{ ...questions()[0] as object, detail: undefined }]],
    ['a detail without any heading', () => [{ ...questions()[0] as object, detail: '请直接修改' }]],
    ['a detail that is not a string', () => [{ ...questions()[0] as object, detail: 42 }]],
    ['a multi-select decision', () => [{ ...questions()[0] as object, multiSelect: true }]],
    ['an unknown presentation intent', () => [{ ...questions()[0] as object, intent: { kind: 'other' } }]],
    ['a fourth option the decision row cannot render', () => [{
      ...questions()[0] as object,
      options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }],
    }]],
  ])('leaves %s to the built-in question composer', (_case, build) => {
    expect(documentReviewOf(wait({ questions: build() as never }))).toBeNull()
  })

  it('accepts a heading after leading prose', () => {
    const [question] = questions()
    const match = documentReviewOf(wait({ questions: [{
      ...question as object, detail: '说明：\n# 正式标题\n正文',
    }] as never }))
    expect(match).not.toBeNull()
  })
})

describe('selectDocumentReview', () => {
  it('claims the pending question wait when it is a document review', () => {
    const carrier = wait()
    const match = selectDocumentReview({ interactions: [carrier], session: undefined })
    expect(match?.wait).toBe(carrier)
  })

  it('leaves non-question interactions to the chain', () => {
    const approval = new PendingWait('approval', RpcId('a-1'), SID, {} as never, async () => ({ accepted: true }))
    expect(selectDocumentReview({ interactions: [approval], session: undefined })).toBeNull()
  })

  it('returns null when nothing is pending', () => {
    expect(selectDocumentReview({ interactions: [], session: undefined })).toBeNull()
  })
})

describe('firstHeading', () => {
  it('takes the first ATX heading of any level', () => {
    expect(firstHeading('# 概要设计\n正文')).toBe('概要设计')
    expect(firstHeading('前言\n## 详细设计\n正文')).toBe('详细设计')
    expect(firstHeading('### 三级')).toBe('三级')
  })

  it('strips surrounding whitespace and returns undefined without a heading', () => {
    expect(firstHeading('#   带空格标题  \n')).toBe('带空格标题')
    expect(firstHeading('没有标题的正文')).toBeUndefined()
    expect(firstHeading('')).toBeUndefined()
  })
})

describe('parseRecommendedLabel', () => {
  it('strips the conventional suffix in either script and keeps the rest verbatim', () => {
    expect(parseRecommendedLabel('需要修改（推荐）')).toEqual({ label: '需要修改', recommended: true })
    expect(parseRecommendedLabel('Revise (recommended)')).toEqual({ label: 'Revise', recommended: true })
    expect(parseRecommendedLabel('确认')).toEqual({ label: '确认', recommended: false })
  })
})
