// @vitest-environment jsdom
// The decision-card badge: nothing without comments, the unsubmitted count
// with its submit action, the inert state while the carrier is not the
// Session's effective interaction, and the clearing after a successful send.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PendingQuestion } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { PlanReviewBadgeProps } from '../src/client/plan-badge.tsx'
import { PlanReviewBadge } from '../src/client/plan-badge.tsx'
import { commentsOf, createDocReviewStore } from '../src/client/review-store.ts'
import { createComment, detailHashOf } from '../src/client/comments.ts'
import { zh, type DocReviewKey } from '../src/client/locales.ts'
import { CARRIER_KEY, CARRIER_SESSION, questionCarrier, reviewQuestions, REVIEW_DOC } from './carrier.ts'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

/** The decision card's owner data, narrowed to what the badge renders with. */
function badgeOwner(): PlanReviewBadgeProps['review'] {
  return {
    id: 'doc-1',
    question: '请审阅以上设计文档',
    plan: REVIEW_DOC,
    approve: { label: '确认定稿' },
  } as PlanReviewBadgeProps['review']
}

/** The badge's prop stubs over a live store fixture and a status snapshot. */
function badgeProps(options: {
  carrier: PendingQuestion | undefined
  requestKey?: string
}): { props: PlanReviewBadgeProps; instance: ReturnType<ReturnType<typeof createDocReviewStore>['create']> } {
  const handle = createDocReviewStore()
  const instance = handle.create(CARRIER_SESSION)
  const props = {
    review: badgeOwner(),
    requestKey: options.requestKey ?? CARRIER_KEY,
    sessionId: CARRIER_SESSION,
    useSessionStatus: (selector: (snapshot: ReadonlyMap<string, { pendingInteraction: PendingQuestion | undefined }>) => unknown) =>
      selector(new Map([[CARRIER_SESSION, { pendingInteraction: options.carrier }]])),
    useStore: (selector: (state: unknown) => unknown): unknown => useSyncExternalStore(
      instance.subscribe,
      () => selector(instance.getSnapshot()),
      () => selector(instance.getSnapshot()),
    ),
    actions: instance.actions,
    t: (key: DocReviewKey) => zh[key] ?? key,
  } as unknown as PlanReviewBadgeProps
  return { props, instance }
}

/** Seed one comment into the shared store under one wait key. */
function seed(
  instance: ReturnType<ReturnType<typeof createDocReviewStore>['create']>,
  text: string,
  waitKey: string = CARRIER_KEY,
): void {
  instance.actions.set(waitKey, detailHashOf(REVIEW_DOC), [
    createComment({ line: 5, endLine: 5 }, text, Date.now()),
  ])
}

describe('PlanReviewBadge', () => {
  it('renders nothing while the review carries no comments', () => {
    const { props } = badgeProps({ carrier: questionCarrier(reviewQuestions()).interaction })
    const { container } = render(<PlanReviewBadge {...props} />)
    expect(container.childElementCount).toBe(0)
  })

  it('shows the unsubmitted count and submits through the carrier', async () => {
    const answer = vi.fn(async (): Promise<void> => {})
    const fixture = questionCarrier(reviewQuestions(), { answer })
    const { props, instance } = badgeProps({ carrier: fixture.interaction })
    seed(instance, '请把风险写具体')
    render(<PlanReviewBadge {...props} />)

    const button = screen.getByRole('button', { name: '1 条未提交评论' })
    fireEvent.click(button)
    await waitFor(() => expect(fixture.answer).toHaveBeenCalledOnce())
    expect(fixture.answer).toHaveBeenCalledWith({
      answers: [{
        id: 'doc-1',
        selected: [],
        custom: '对于第5行前端使用 React，后端使用 Node。，我认为应请把风险写具体',
      }],
    })
    expect(commentsOf(instance.getSnapshot(), CARRIER_KEY, detailHashOf(REVIEW_DOC))).toHaveLength(0)
  })

  it('stays inert while a different interaction holds the Session', () => {
    const unrelated = questionCarrier(reviewQuestions('另一份文档\n\n正文'), { answer: async () => {} })
    const { props, instance } = badgeProps({ carrier: unrelated.interaction, requestKey: 'question:2' })
    seed(instance, '未提交的意见', 'question:2')
    render(<PlanReviewBadge {...props} />)

    const button = screen.getByRole('button', { name: '1 条未提交评论' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('re-arms and shows the failure after a rejected send', async () => {
    const answer = vi.fn(async (): Promise<void> => { throw new Error('carrier settled') })
    const fixture = questionCarrier(reviewQuestions(), { answer })
    const { props, instance } = badgeProps({ carrier: fixture.interaction })
    seed(instance, '意见')
    render(<PlanReviewBadge {...props} />)

    fireEvent.click(screen.getByRole('button', { name: '1 条未提交评论' }))
    await waitFor(() => expect(screen.getByText('carrier settled')).toBeTruthy())
    expect((screen.getByRole('button', { name: '1 条未提交评论' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
