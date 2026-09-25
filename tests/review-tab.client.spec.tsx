// @vitest-environment jsdom
// The review tab body, driven through the component with live standard-hook
// stubs: the native rendering (headings, paragraphs), the seam partitioning
// around comments, the context-menu and affordance anchoring, edit/delete,
// the aggregate submit through the carrier, the one-shot latch with its
// re-arm on failure, and the read-only fallback when no carrier matches.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PendingQuestion } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { ReviewTabProps } from '../src/client/review-tab.tsx'
import { ReviewTab } from '../src/client/review-tab.tsx'
import { commentsOf, createDocReviewStore } from '../src/client/review-store.ts'
import { detailHashOf } from '../src/client/comments.ts'
import { en, zh, type DocReviewKey } from '../src/client/locales.ts'
import {
  CARRIER_KEY, CARRIER_SESSION, questionCarrier, reviewQuestions,
  REVIEW_DOC, type CarrierFixture,
} from './carrier.ts'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

/** The temporary review address the native flow would auto-open. */
const ADDRESS = 'dsh-resource://plan-review/s1/w1:question:1'

/** One SessionStatus-like entry for the status snapshot stub. */
interface StatusEntry {
  running: boolean
  pendingInteraction: PendingQuestion | undefined
  completionUnread: boolean
}

/** The live store fixture: a real engine instance wired to the component's
 * store seat through a subscription-backed hook stub. */
function storeFixture() {
  const handle = createDocReviewStore()
  const instance = handle.create(CARRIER_SESSION)
  return {
    instance,
    useStore: (selector: (state: unknown) => unknown): unknown => useSyncExternalStore(
      instance.subscribe,
      () => selector(instance.getSnapshot()),
      () => selector(instance.getSnapshot()),
    ),
    actions: instance.actions,
  }
}

/**
 * The body's prop stubs: the framework runtime share (tab info + session and
 * global kit) asserted into the derived props type, exactly as the renderer
 * binds them at runtime.
 */
function tabProps(options: {
  carrier: PendingQuestion | undefined
  address?: string
  params?: Record<string, unknown> | undefined
}): { props: ReviewTabProps; store: ReturnType<typeof storeFixture> } {
  const store = storeFixture()
  const props = {
    useTabInfo: () => ({
      sidebar: { expanded: true, fullscreen: false },
      panel: { id: 'pane-1' },
      tab: {
        id: 'tab-1', kind: 'plan-review', title: '计划', visible: true,
        navigation: {
          address: options.address ?? ADDRESS,
          params: 'params' in options ? options.params : { planReview: { markdown: REVIEW_DOC, title: '概要设计：仓库管理' } },
          revision: 0,
        },
        signal: new AbortController().signal,
        actions: { openResource: vi.fn(), openTab: vi.fn(), close: vi.fn() },
      },
    }),
    useResource: () => ({ status: 'none', value: undefined, failure: undefined }),
    useSessionStatus: (selector: (snapshot: ReadonlyMap<string, StatusEntry>) => unknown) =>
      selector(new Map([[CARRIER_SESSION, {
        running: false, pendingInteraction: options.carrier, completionUnread: false,
      }]])),
    useStore: store.useStore,
    actions: store.actions,
    t: (key: DocReviewKey) => zh[key] ?? key,
  } as unknown as ReviewTabProps
  return { props, store }
}

/** The narrowed match over the fixture request, or null. */
function carrierFixture(
  answer: (batch: Parameters<PendingQuestion['answer']>[0]) => Promise<void> = async () => {},
): CarrierFixture {
  return questionCarrier(reviewQuestions(), { answer })
}

describe('ReviewTab', () => {
  it('renders the document through the native renderer as one segment', () => {
    render(<ReviewTab {...tabProps({ carrier: undefined }).props} />)
    // Native rendering: real heading and paragraph elements.
    expect(screen.getByRole('heading', { name: '概要设计：仓库管理' })).toBeTruthy()
    expect(screen.getByText('前端使用 React，后端使用 Node。')).toBeTruthy()
    expect(screen.getByText('依赖升级风险')).toBeTruthy()
  })

  it('keeps the read-only preview without a footer or affordances when nothing matches', () => {
    render(<ReviewTab {...tabProps({ carrier: undefined }).props} />)
    expect(screen.queryByRole('button', { name: zh['comment.submitAll'] })).toBeNull()
    expect(screen.queryByRole('button', { name: zh['comment.clear'] })).toBeNull()
  })

  it('shows the expired state for a temporary address without parameters', () => {
    const { props } = tabProps({ carrier: undefined, params: undefined })
    render(<ReviewTab {...props} />)
    expect(screen.getByText(zh['preview.expired'])).toBeTruthy()
  })

  it('anchors a draft from the context menu and publishes the comment at the seam', () => {
    const { props, store } = tabProps({ carrier: questionCarrier(reviewQuestions()).interaction })
    render(<ReviewTab {...props} />)

    fireEvent.contextMenu(screen.getByText('前端使用 React，后端使用 Node。'))
    const input = screen.getByPlaceholderText(zh['comment.placeholder']) as HTMLTextAreaElement
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: '这里写清楚依赖版本' } })
    fireEvent.click(screen.getByRole('button', { name: zh['comment.publish'] }))

    // The card renders in the seam under its block, with its anchor chip.
    expect(screen.getByText('这里写清楚依赖版本')).toBeTruthy()
    expect(screen.getByText('第 5 行')).toBeTruthy()
    expect(commentsOf(store.instance.getSnapshot(), CARRIER_KEY, detailHashOf(REVIEW_DOC))).toHaveLength(1)
    // The seam partition: the paragraph's block ends its segment.
    expect(document.querySelectorAll('[data-drr-seg]')).toHaveLength(2)
  })

  it('anchors from the hover affordance button', () => {
    const { props } = tabProps({ carrier: questionCarrier(reviewQuestions()).interaction })
    render(<ReviewTab {...props} />)
    const paragraph = screen.getByText('前端使用 React，后端使用 Node。')
    fireEvent.mouseOver(paragraph)
    const affordance = document.querySelector('.drr-afford') as HTMLButtonElement | null
    expect(affordance).not.toBeNull()
    // jsdom's programmatic .click() does not traverse React's delegated
    // listeners; fireEvent dispatches the real bubbling event.
    fireEvent.click(affordance as HTMLButtonElement)
    expect(screen.getByPlaceholderText(zh['comment.placeholder'])).toBeTruthy()
  })

  it('edits and deletes a published comment', () => {
    const { props } = tabProps({ carrier: questionCarrier(reviewQuestions()).interaction })
    render(<ReviewTab {...props} />)

    fireEvent.contextMenu(screen.getByText('前端使用 React，后端使用 Node。'))
    const input = screen.getByPlaceholderText(zh['comment.placeholder']) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '第一版意见' } })
    fireEvent.click(screen.getByRole('button', { name: zh['comment.publish'] }))

    fireEvent.click(screen.getByRole('button', { name: zh['comment.edit'] }))
    const editing = screen.getByDisplayValue('第一版意见') as HTMLTextAreaElement
    fireEvent.change(editing, { target: { value: '修改后的意见' } })
    fireEvent.click(screen.getByRole('button', { name: zh['comment.save'] }))
    expect(screen.getByText('修改后的意见')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['comment.delete'] }))
    expect(screen.queryByText('修改后的意见')).toBeNull()
  })

  it('submits the aggregated feedback through the carrier and clears the comments', async () => {
    const answer = vi.fn(async (): Promise<void> => {})
    const fixture = questionCarrier(reviewQuestions(), { answer })
    const { props, store } = tabProps({ carrier: fixture.interaction })
    render(<ReviewTab {...props} />)

    fireEvent.contextMenu(screen.getByText('前端使用 React，后端使用 Node。'))
    fireEvent.change(screen.getByPlaceholderText(zh['comment.placeholder']), { target: { value: '意见一' } })
    fireEvent.click(screen.getByRole('button', { name: zh['comment.publish'] }))
    fireEvent.contextMenu(screen.getByText('依赖升级风险'))
    fireEvent.change(screen.getByPlaceholderText(zh['comment.placeholder']), { target: { value: '意见二' } })
    fireEvent.click(screen.getByRole('button', { name: zh['comment.publish'] }))

    fireEvent.click(screen.getByRole('button', { name: zh['comment.submitAll'] }))
    await waitFor(() => expect(fixture.answer).toHaveBeenCalledOnce())
    expect(fixture.answer).toHaveBeenCalledWith({
      answers: [{
        id: 'doc-1',
        selected: [],
        custom: [
          '对于第5行前端使用 React，后端使用 Node。，我认为应意见一',
          '对于第9行- 依赖升级风险\n- 兼容性风险，我认为应意见二',
        ].join('\n'),
      }],
    })
    expect(commentsOf(store.instance.getSnapshot(), CARRIER_KEY, detailHashOf(REVIEW_DOC))).toHaveLength(0)
  })

  it('re-arms after a rejected send and shows the failure', async () => {
    const answer = vi.fn(async (): Promise<void> => { throw new Error('carrier settled') })
    const fixture = questionCarrier(reviewQuestions(), { answer })
    const { props } = tabProps({ carrier: fixture.interaction })
    render(<ReviewTab {...props} />)

    fireEvent.contextMenu(screen.getByText('前端使用 React，后端使用 Node。'))
    fireEvent.change(screen.getByPlaceholderText(zh['comment.placeholder']), { target: { value: '意见' } })
    fireEvent.click(screen.getByRole('button', { name: zh['comment.publish'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['comment.submitAll'] }))

    await waitFor(() => expect(screen.getByText('carrier settled')).toBeTruthy())
    expect((screen.getByRole('button', { name: zh['comment.submitAll'] }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('clears every comment through the secondary confirmation', () => {
    const { props, store } = tabProps({ carrier: questionCarrier(reviewQuestions()).interaction })
    render(<ReviewTab {...props} />)

    fireEvent.contextMenu(screen.getByText('前端使用 React，后端使用 Node。'))
    fireEvent.change(screen.getByPlaceholderText(zh['comment.placeholder']), { target: { value: '意见' } })
    fireEvent.click(screen.getByRole('button', { name: zh['comment.publish'] }))

    fireEvent.click(screen.getByRole('button', { name: zh['comment.clear'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['comment.confirmOk'] }))
    expect(commentsOf(store.instance.getSnapshot(), CARRIER_KEY, detailHashOf(REVIEW_DOC))).toHaveLength(0)
    expect(screen.queryByText('意见')).toBeNull()
  })

  it('keeps comments across store instances through the engine persistence', () => {
    const { props } = tabProps({ carrier: questionCarrier(reviewQuestions()).interaction })
    render(<ReviewTab {...props} />)
    fireEvent.contextMenu(screen.getByText('前端使用 React，后端使用 Node。'))
    fireEvent.change(screen.getByPlaceholderText(zh['comment.placeholder']), { target: { value: '要留存的意见' } })
    fireEvent.click(screen.getByRole('button', { name: zh['comment.publish'] }))

    // A fresh instance under the same scope reads the persisted state back.
    const revived = createDocReviewStore().create(CARRIER_SESSION)
    expect(commentsOf(revived.getSnapshot(), CARRIER_KEY, detailHashOf(REVIEW_DOC))).toHaveLength(1)
  })
})