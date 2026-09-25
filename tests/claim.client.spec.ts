// The narrowing predicate: which pending carriers the review tab can serve —
// the domain discriminator re-read at runtime, the single-question document
// shape, the option ceiling, and the plan-review intent's passthrough fields.
import { describe, expect, it } from 'vitest'
import { documentReviewOf } from '../src/client/claim.ts'
import { questionCarrier, reviewQuestions, REVIEW_DOC } from './carrier.ts'

describe('documentReviewOf', () => {
  it('narrow a plan-review question to its review facts', () => {
    const { interaction } = questionCarrier(reviewQuestions())
    const wait = documentReviewOf(interaction)
    expect(wait).not.toBeNull()
    expect(wait?.review).toMatchObject({
      id: 'doc-1',
      detail: REVIEW_DOC,
      callId: undefined,
      approveLabel: '确认定稿',
    })
  })

  it('carries the logged plan invocation when the intent has one', () => {
    const questions = reviewQuestions().map(question => ({
      ...question,
      intent: { kind: 'plan-review' as const, approve: 'Approve', callId: 'call-7' },
    }))
    const { interaction } = questionCarrier(questions)
    expect(documentReviewOf(interaction)?.review.callId).toBe('call-7')
  })

  it('rejects other domains, batches, multiselect and option ceilings', () => {
    const approval = questionCarrier(reviewQuestions(), {}).interaction
    const wrongKind = { ...approval, kind: 'approval' } as unknown as typeof approval
    expect(documentReviewOf(wrongKind)).toBeNull()

    const twoQuestions = [...reviewQuestions(), ...reviewQuestions()]
    expect(documentReviewOf(questionCarrier(twoQuestions).interaction)).toBeNull()

    const multiSelect = reviewQuestions().map(question => ({ ...question, multiSelect: true }))
    expect(documentReviewOf(questionCarrier(multiSelect).interaction)).toBeNull()

    const tooManyOptions = reviewQuestions().map(question => ({
      ...question,
      options: [
        { label: '一' }, { label: '二' }, { label: '三' }, { label: '四' },
      ],
    }))
    expect(documentReviewOf(questionCarrier(tooManyOptions).interaction)).toBeNull()

    const otherIntent = reviewQuestions().map(question => ({
      ...question,
      intent: { kind: 'other' as const },
    }))
    expect(documentReviewOf(questionCarrier(otherIntent).interaction)).toBeNull()

    const notADocument = reviewQuestions('一句话的问题，没有标题')
    expect(documentReviewOf(questionCarrier(notADocument).interaction)).toBeNull()
  })
})