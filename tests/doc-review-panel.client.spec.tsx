// @vitest-environment jsdom
// The document-review takeover, driven through the panel component directly:
// a claimed document question must open the review modal with the rendered
// markdown, answer with the asker's own option labels (or a custom answer),
// dismiss as cancelled, and re-arm after a failed send — while the control
// bar keeps every decision reachable once the modal is closed.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  ConversationSnapshot, SessionId, SessionListState, WorkspaceListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import { PendingWait } from '@deepseek-ai/dsh-client-runtime/client'
import type { RpcReceipt } from '@deepseek-ai/dsh-client-connection/client'
import { RpcId } from '@deepseek-ai/dsh-client-connection/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { documentReviewOf, type DocumentReviewWait } from '../src/client/claim.ts'
import { DocReviewPanel, type DocReviewPanelProps } from '../src/client/DocReviewPanel.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const SID = 's1' as SessionId

/** Seat stub over one dictionary, mirroring the real lookup chain's first stop. */
const seatOver = (dict: Record<string, string>): DocReviewPanelProps['t'] =>
  (key => dict[key] ?? key)

/** Framework standard-kit stubs: the panel consumes only the locale seat. */
const kit = {
  interactions: [] as never,
  sessionId: SID,
  session: undefined,
  useSession: (() => { throw new Error('unused') }) as unknown as SnapshotSelectorHook<ConversationSnapshot>,
  useSessions: (() => { throw new Error('unused') }) as unknown as SnapshotSelectorHook<SessionListState>,
  useWorkspaces: (() => { throw new Error('unused') }) as unknown as SnapshotSelectorHook<WorkspaceListState>,
  useProjection: (() => undefined) as never,
  useInput: (() => { throw new Error('unused') }) as never,
  inputActions: { setDraft: () => { throw new Error('unused') }, submit: () => { throw new Error('unused') } } as never,
  t: seatOver(zh),
}

const DOC = '# 概要设计：仓库管理\n\n## 架构\n\n- 模块 A\n- 模块 B\n'

/** The adaptive-pipeline request shape: one question, the document as detail, stage-scoped header. */
const questions = (): PendingWait<'question'>['payload']['questions'] => [{
  id: 'doc-1',
  header: '概要设计 · 阶段提问',
  question: '请审阅以上设计文档',
  detail: DOC,
  options: [
    { label: '确认' },
    { label: '需要修改' },
  ],
}]

/** Carrier fixture over a scripted respond carrier, narrowed to a document review. */
function match(
  payload: PendingWait<'question'>['payload'] = { questions: questions() },
  respond = vi.fn(() => Promise.resolve<RpcReceipt>({ accepted: true })),
): { matched: DocumentReviewWait; respond: ReturnType<typeof vi.fn> } {
  const carrier = new PendingWait('question', RpcId('q-1'), SID, payload, respond)
  const review = documentReviewOf(carrier)
  if (review === null) throw new Error('fixture must be a claimable document review')
  return { matched: review, respond }
}

/** The client-response envelope respond must have received for an option decision. */
function decidedEnvelope(label: string) {
  return {
    type: 'client-response', rpcId: RpcId('q-1'),
    result: { ok: true, value: { sessionId: SID, answer: { answers: [{ id: 'doc-1', selected: [label] }] } } },
  }
}

/** The client-response envelope for a custom answer. */
function customEnvelope(text: string) {
  return {
    type: 'client-response', rpcId: RpcId('q-1'),
    result: { ok: true, value: { sessionId: SID, answer: { answers: [{ id: 'doc-1', selected: [], custom: text }] } } },
  }
}

describe('DocReviewPanel', () => {
  it('auto-opens the modal with the rendered document and the full decision surface', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    // The modal opens on arrival, titled by the document's first heading.
    const dialog = screen.getByRole('dialog', { name: '概要设计：仓库管理' })
    expect(dialog).toBeTruthy()
    // The stage header and the question text frame the document.
    expect(screen.getByText('概要设计 · 阶段提问')).toBeTruthy()
    expect(screen.getByText('请审阅以上设计文档')).toBeTruthy()
    // The document renders as markdown: its inner heading is a heading.
    expect(screen.getByRole('heading', { name: '架构' })).toBeTruthy()
    // Options, custom answer and dismiss are all reachable in the modal.
    expect(screen.getByRole('button', { name: '确认' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '需要修改' })).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['action.cancel'] })).toBeTruthy()
  })

  it('collapses to the control bar without dismissing, and reopens', () => {
    const { matched, respond } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['doc.close'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // The bar keeps the title, the expand affordance, the options and the
    // dismiss verb; the request is still pending (nothing answered yet).
    expect(screen.getByText('概要设计：仓库管理')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['doc.expand'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认' })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['action.cancel'] })).toBeTruthy()
    expect(respond).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: zh['doc.expand'] }))
    expect(screen.getByRole('dialog', { name: '概要设计：仓库管理' })).toBeTruthy()
  })

  it('collapses on Escape without answering', () => {
    const { matched, respond } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(respond).not.toHaveBeenCalled()
  })

  it('answers with the asker\'s own label verbatim and locks once', () => {
    const { matched, respond } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(respond).toHaveBeenCalledWith(decidedEnvelope('确认'))
    // One-shot: every action locks until the host's resolved frame lands.
    expect(screen.getByRole('button', { name: '需要修改' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '需要修改' }))
    expect(respond).toHaveBeenCalledTimes(1)
  })

  it('submits a custom answer', () => {
    const { matched, respond } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '把模块 B 去掉' } })
    fireEvent.click(screen.getByRole('button', { name: zh['action.submit'] }))
    expect(respond).toHaveBeenCalledWith(customEnvelope('把模块 B 去掉'))
  })

  it('disables the custom submit while the draft is empty', () => {
    const { matched, respond } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    const submit = screen.getByRole('button', { name: zh['action.submit'] })
    expect(submit.hasAttribute('disabled')).toBe(true)
    fireEvent.click(submit)
    expect(respond).not.toHaveBeenCalled()
  })

  it('dismisses the request so the composer returns for a plain message', () => {
    const { matched, respond } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['action.cancel'] }))
    expect(respond).toHaveBeenCalledWith({
      type: 'client-response', rpcId: RpcId('q-1'),
      result: {
        ok: false,
        error: { code: 'cancelled', message: 'the user closed this question request', details: {} },
      },
    })
  })

  it('re-arms the actions and says why when the decision does not land', async () => {
    const { matched, respond } = match(
      { questions: questions() },
      vi.fn(() => Promise.resolve<RpcReceipt>({ accepted: false, reason: 'not-pending' })),
    )
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    const failure = await screen.findByText('question response rejected: not-pending')
    expect(failure.getAttribute('role')).toBe('status')
    // Re-armed for the retry: a lost click must not leave a dead surface.
    expect(screen.getByRole('button', { name: '确认' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(respond).toHaveBeenCalledTimes(2)
  })

  it('carries the same decision surface in English', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} t={seatOver(en)} />)

    expect(screen.getByRole('dialog', { name: '概要设计：仓库管理' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chat about it' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy()
  })

  it('localizes the plan-review intent\'s English buttons and answers verbatim', () => {
    const [question] = questions()
    const { matched, respond } = match({ questions: [{
      ...question as object,
      intent: { kind: 'plan-review', approve: 'Approve' },
      options: [{ label: 'Approve', description: 'Carry out the plan.' }, { label: 'Keep planning' }],
    }] as never })
    render(<DocReviewPanel matched={matched} {...kit} />)

    // English labels render as localized copy, the asker's description as the tooltip.
    const approve = screen.getByRole('button', { name: '确认执行' })
    expect(approve.getAttribute('title')).toBe('Carry out the plan.')
    expect(screen.getByRole('button', { name: '拒绝' })).toBeTruthy()
    fireEvent.click(approve)
    // The answer still carries the asker's label verbatim.
    expect(respond).toHaveBeenCalledWith({
      type: 'client-response', rpcId: RpcId('q-1'),
      result: { ok: true, value: { sessionId: SID, answer: { answers: [{ id: 'doc-1', selected: ['Approve'] }] } } },
    })
  })

  it('keeps Chinese intent labels verbatim (adaptive pipeline shape)', () => {
    const [question] = questions()
    const { matched } = match({ questions: [{
      ...question as object,
      intent: { kind: 'plan-review', approve: '确认定稿' },
      options: [
        { label: '确认定稿', description: '确认内容无误，将保存为定稿文件并推进流水线。' },
        { label: '继续修改', description: '需要修改，可在补充回答中填写修改意见。' },
      ],
    }] as never })
    render(<DocReviewPanel matched={matched} {...kit} />)

    expect(screen.getByRole('button', { name: '确认定稿' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '继续修改' })).toBeTruthy()
  })

  it('renders the intent buttons in English under the en locale', () => {
    const [question] = questions()
    const { matched } = match({ questions: [{
      ...question as object,
      intent: { kind: 'plan-review', approve: 'Approve' },
      options: [{ label: 'Approve' }, { label: 'Keep planning' }],
    }] as never })
    render(<DocReviewPanel matched={matched} {...kit} t={seatOver(en)} />)

    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refuse' })).toBeTruthy()
  })
})
