// @vitest-environment jsdom
// The document-review takeover, driven through the panel component directly:
// a claimed document question must open the review modal with the rendered
// markdown, answer with the asker's own option labels (or a custom answer),
// cancel the request on dismiss, and re-arm after a rejected send — while the
// control bar keeps every decision reachable once the modal is closed.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { QuestionCarrier } from '../src/client/claim.ts'
import { documentReviewOf, type DocumentReviewWait } from '../src/client/claim.ts'
import { storageKey } from '../src/client/comments.ts'
import { DocReviewPanel, type DocReviewPanelProps } from '../src/client/DocReviewPanel.tsx'
import { en, zh } from '../src/client/locales.ts'
import { CARRIER_KEY, questionCarrier, type AnswerBatch } from './carrier.ts'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

/** Seat stub over one dictionary, mirroring the real lookup chain's first stop. */
const seatOver = (dict: Record<string, string>): DocReviewPanelProps['t'] =>
  (key => dict[key] ?? key)

/**
 * Framework standard-kit stubs. The panel reads only the matched carrier and
 * the locale seat; the surrounding Session kit reaches it from the renderer at
 * runtime and is not this component's contract, so the stub declares the owner
 * props it must carry and asserts the rest.
 */
const kit = {
  pendingInteraction: undefined,
  sessionId: 's1' as DocReviewPanelProps['sessionId'],
  session: undefined,
  t: seatOver(zh),
} as unknown as Omit<DocReviewPanelProps, 'matched'>

const DOC = '# 概要设计：仓库管理\n\n## 架构\n\n- 模块 A\n- 模块 B\n'

/** The adaptive-pipeline request shape: one question, the document as detail, stage-scoped header. */
const questions = (): QuestionCarrier['questions'] => [{
  id: 'doc-1',
  header: '概要设计 · 阶段提问',
  question: '请审阅以上设计文档',
  detail: DOC,
  options: [
    { label: '确认' },
    { label: '需要修改' },
  ],
}]

/**
 * Carrier fixture narrowed to a document review: `answer` and `cancel` are the
 * spies the panel's decision paths must reach, over a scripted settlement.
 */
function match(
  batch: QuestionCarrier['questions'] = questions(),
  answer = vi.fn(async (_batch: AnswerBatch): Promise<void> => {}),
  cancel = vi.fn(async (): Promise<void> => {}),
): { matched: DocumentReviewWait; answer: typeof answer; cancel: typeof cancel } {
  const pending = questionCarrier(batch, { answer, cancel })
  const review = documentReviewOf(pending.interaction)
  if (review === null) throw new Error('fixture must be a claimable document review')
  return { matched: review, answer, cancel }
}

/** The answer batch an option decision must deliver. */
function decided(label: string): AnswerBatch {
  return { answers: [{ id: 'doc-1', selected: [label] }] }
}

/** The answer batch a custom answer must deliver. */
function custom(text: string): AnswerBatch {
  return { answers: [{ id: 'doc-1', selected: [], custom: text }] }
}

/** The fixture carrier's comment-store key. */
const KEY = storageKey(CARRIER_KEY)

/** Publish one comment through the UI on a (currently uncommented) line. */
function publishComment(text: string, line = 5) {
  fireEvent.click(screen.getByRole('button', { name: `${line} 行` }))
  const input = screen.getByPlaceholderText(zh['comment.placeholder']) as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: zh['comment.publish'] }))
}

/** Seed persisted comments for one wait key (restored on mount). */
function seedComments(comments: unknown[]) {
  localStorage.setItem(KEY, JSON.stringify({ version: 1, comments }))
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
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['doc.close'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // The bar keeps the title, the expand affordance, the options and the
    // dismiss verb; the request is still pending (nothing answered yet).
    expect(screen.getByText('概要设计：仓库管理')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['doc.expand'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认' })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['action.cancel'] })).toBeTruthy()
    expect(answer).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: zh['doc.expand'] }))
    expect(screen.getByRole('dialog', { name: '概要设计：仓库管理' })).toBeTruthy()
  })

  it('collapses on Escape without answering', () => {
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(answer).not.toHaveBeenCalled()
  })

  it('answers with the asker\'s own label verbatim and locks once', () => {
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(answer).toHaveBeenCalledWith(decided('确认'))
    // One-shot: every action locks until the host's resolved frame lands.
    expect(screen.getByRole('button', { name: '需要修改' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '需要修改' }))
    expect(answer).toHaveBeenCalledTimes(1)
  })

  it('submits a custom answer', () => {
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '把模块 B 去掉' } })
    fireEvent.click(screen.getByRole('button', { name: zh['action.submit'] }))
    expect(answer).toHaveBeenCalledWith(custom('把模块 B 去掉'))
  })

  it('disables the custom submit while the draft is empty', () => {
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    const submit = screen.getByRole('button', { name: zh['action.submit'] })
    expect(submit.hasAttribute('disabled')).toBe(true)
    fireEvent.click(submit)
    expect(answer).not.toHaveBeenCalled()
  })

  it('dismisses the request so the composer returns for a plain message', () => {
    const { matched, answer, cancel } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['action.cancel'] }))
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(answer).not.toHaveBeenCalled()
  })

  it('re-arms the actions and says why when the decision does not land', async () => {
    const { matched, answer } = match(
      questions(),
      vi.fn(async (_batch: AnswerBatch): Promise<void> => {
        throw new Error('pending question question:q-1 is already settled')
      }),
    )
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    const failure = await screen.findByText('pending question question:q-1 is already settled')
    expect(failure.getAttribute('role')).toBe('status')
    // Re-armed for the retry: a lost click must not leave a dead surface.
    expect(screen.getByRole('button', { name: '确认' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(answer).toHaveBeenCalledTimes(2)
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
    const { matched, answer } = match([{
      ...question as object,
      intent: { kind: 'plan-review', approve: 'Approve' },
      options: [{ label: 'Approve', description: 'Carry out the plan.' }, { label: 'Keep planning' }],
    }] as never)
    render(<DocReviewPanel matched={matched} {...kit} />)

    // English labels render as localized copy, the asker's description as the tooltip.
    const approve = screen.getByRole('button', { name: '确认执行' })
    expect(approve.getAttribute('title')).toBe('Carry out the plan.')
    expect(screen.getByRole('button', { name: '拒绝' })).toBeTruthy()
    fireEvent.click(approve)
    // The answer still carries the asker's label verbatim.
    expect(answer).toHaveBeenCalledWith(decided('Approve'))
  })

  it('keeps Chinese intent labels verbatim (adaptive pipeline shape)', () => {
    const [question] = questions()
    const { matched } = match([{
      ...question as object,
      intent: { kind: 'plan-review', approve: '确认定稿' },
      options: [
        { label: '确认定稿', description: '确认内容无误，将保存为定稿文件并推进流水线。' },
        { label: '继续修改', description: '需要修改，可在补充回答中填写修改意见。' },
      ],
    }] as never)
    render(<DocReviewPanel matched={matched} {...kit} />)

    expect(screen.getByRole('button', { name: '确认定稿' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '继续修改' })).toBeTruthy()
  })

  it('renders the intent buttons in English under the en locale', () => {
    const [question] = questions()
    const { matched } = match([{
      ...question as object,
      intent: { kind: 'plan-review', approve: 'Approve' },
      options: [{ label: 'Approve' }, { label: 'Keep planning' }],
    }] as never)
    render(<DocReviewPanel matched={matched} {...kit} t={seatOver(en)} />)

    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refuse' })).toBeTruthy()
  })
  it('opens the inline editor from the gutter without touching the decision footer', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: '5 行' }))
    expect(screen.getByPlaceholderText(zh['comment.placeholder'])).toBeTruthy()
    // No comments yet: the decision footer stays untouched; the footer custom
    // input and the new comment editor are the only two textboxes.
    expect(screen.getByRole('button', { name: '确认' })).toBeTruthy()
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
  })

  it('opens the right-click popup with 添加评论 and a draft editor pre-filled empty', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.contextMenu(document.querySelector('[data-line="5"]') as HTMLElement, { clientX: 120, clientY: 180 })
    expect(screen.getByRole('button', { name: zh['comment.add'] })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['comment.add'] }))
    // Popup closes and the line-5 draft editor opens pre-filled empty.
    expect(screen.queryByRole('button', { name: zh['comment.add'] })).toBeNull()
    const input = screen.getByPlaceholderText(zh['comment.placeholder']) as HTMLTextAreaElement
    expect(input.value).toBe('')
    expect(screen.getByRole('button', { name: zh['comment.publish'] })).toBeTruthy()
  })

  it('publishes a comment: block + edit/delete icons + persisted store', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('拆成两子模块')

    expect(screen.getByText('拆成两子模块')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['comment.edit'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['comment.delete'] })).toBeTruthy()
    expect(document.querySelector('[data-line="5"]')?.classList.contains('dr-line-commented')).toBe(true)
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { version: number; comments: Array<{ line: number; text: string }> }
    expect(saved.version).toBe(1)
    expect(saved.comments).toHaveLength(1)
    expect(saved.comments[0]).toMatchObject({ line: 5, text: '拆成两子模块' })
  })

  it('swaps both footers to 提交评论/取消 and hides the decision surface while comments exist', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('拆成两子模块')

    // Comment mode in the modal footer.
    expect(screen.getByRole('button', { name: zh['comment.submitAll'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['comment.cancelAll'] })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '确认' })).toBeNull()
    expect(screen.queryByRole('button', { name: '需要修改' })).toBeNull()
    expect(screen.queryByRole('button', { name: zh['action.cancel'] })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('mirrors the comment footer and count badge in the collapsed control bar', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('拆成两子模块')
    fireEvent.click(screen.getByRole('button', { name: zh['doc.close'] }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('1 条评论')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['comment.submitAll'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['comment.cancelAll'] })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '确认' })).toBeNull()
    expect(screen.queryByRole('button', { name: zh['action.cancel'] })).toBeNull()
  })

  it('edits a comment: pre-fills the textarea, saves the update, persists it', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('旧')
    fireEvent.click(screen.getByRole('button', { name: zh['comment.edit'] }))
    const input = screen.getByPlaceholderText(zh['comment.placeholder']) as HTMLTextAreaElement
    expect(input.value).toBe('旧')

    fireEvent.change(input, { target: { value: '新' } })
    fireEvent.click(screen.getByRole('button', { name: zh['comment.save'] }))
    expect(screen.getByText('新')).toBeTruthy()
    expect(screen.queryByText('旧')).toBeNull()
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { comments: Array<{ text: string }> }
    expect(saved.comments[0]?.text).toBe('新')
  })

  it('cancelling an edit restores the published text', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('旧')
    fireEvent.click(screen.getByRole('button', { name: zh['comment.edit'] }))
    const input = screen.getByPlaceholderText(zh['comment.placeholder']) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '临时' } })
    // The footer cancel (取消 all) is also named 取消 — scope to the editor.
    const editor = document.querySelector('.dr-comment-editor') as HTMLElement
    fireEvent.click(within(editor).getByRole('button', { name: zh['comment.cancelEdit'] }))

    expect(screen.getByText('旧')).toBeTruthy()
    expect(screen.queryByText('临时')).toBeNull()
  })

  it('deletes a comment immediately and restores the decision footer', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('拆成两子模块')
    fireEvent.click(screen.getByRole('button', { name: zh['comment.delete'] }))

    expect(screen.queryByText('拆成两子模块')).toBeNull()
    expect(screen.getByRole('button', { name: '确认' })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['action.cancel'] })).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { comments: unknown[] }
    expect(saved.comments).toHaveLength(0)
  })

  it('submits the aggregated feedback envelope and clears comments on success', async () => {
    seedComments([
      { id: 'c1', line: 5, text: 'A意见', createdAt: 2, updatedAt: 2 },
      { id: 'c2', line: 3, text: 'C意见', createdAt: 1, updatedAt: 1 },
      { id: 'c3', line: 5, text: '   ', createdAt: 3, updatedAt: 3 },
    ])
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['comment.submitAll'] }))
    // Sorted by line, whitespace-only excluded, verbatim sentence per line.
    expect(answer).toHaveBeenCalledWith(custom(
      '对于第3行## 架构，我认为应C意见\n对于第5行- 模块 A，我认为应A意见',
    ))
    // Success clears persisted + in-memory state; the decision footer returns.
    await screen.findByRole('button', { name: '确认' })
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('opens the secondary confirmation dialog from 取消', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('拆成两子模块')
    fireEvent.click(screen.getByRole('button', { name: zh['comment.cancelAll'] }))

    expect(screen.getByRole('dialog', { name: zh['comment.confirmTitle'] })).toBeTruthy()
    expect(screen.getByText(zh['comment.confirmBody'])).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['comment.confirmCancel'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['comment.confirmOk'] })).toBeTruthy()
  })

  it('keeps the comments when the confirmation says 再想想 (no answer)', () => {
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('拆成两子模块')
    fireEvent.click(screen.getByRole('button', { name: zh['comment.cancelAll'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['comment.confirmCancel'] }))

    expect(screen.queryByRole('dialog', { name: zh['comment.confirmTitle'] })).toBeNull()
    expect(screen.getByText('拆成两子模块')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['comment.submitAll'] })).toBeTruthy()
    expect(answer).not.toHaveBeenCalled()
  })

  it('clears comments locally on 确定 — no answer, decision footer restored', () => {
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('拆成两子模块')
    fireEvent.click(screen.getByRole('button', { name: zh['comment.cancelAll'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['comment.confirmOk'] }))

    expect(screen.queryByRole('dialog', { name: zh['comment.confirmTitle'] })).toBeNull()
    expect(screen.queryByText('拆成两子模块')).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(answer).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '确认' })).toBeTruthy()
  })

  it('closes only the confirm dialog on Escape (review modal stays, no answer)', () => {
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('拆成两子模块')
    fireEvent.click(screen.getByRole('button', { name: zh['comment.cancelAll'] }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: zh['comment.confirmTitle'] })).toBeNull()
    expect(screen.getByRole('dialog', { name: '概要设计：仓库管理' })).toBeTruthy()
    expect(answer).not.toHaveBeenCalled()
  })

  it('closes only the context menu on Escape', () => {
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.contextMenu(document.querySelector('[data-line="5"]') as HTMLElement, { clientX: 10, clientY: 10 })
    expect(screen.getByRole('button', { name: zh['comment.add'] })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('button', { name: zh['comment.add'] })).toBeNull()
    expect(screen.getByRole('dialog', { name: '概要设计：仓库管理' })).toBeTruthy()
    expect(answer).not.toHaveBeenCalled()
  })

  it('restores persisted comments on remount for the same wait key', () => {
    const { matched } = match()
    const { unmount } = render(<DocReviewPanel matched={matched} {...kit} />)

    publishComment('拆成两子模块')
    unmount()
    render(<DocReviewPanel matched={matched} {...kit} />)

    expect(screen.getByText('拆成两子模块')).toBeTruthy()
    expect(screen.getByText('1 条评论')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['comment.submitAll'] })).toBeTruthy()
  })

  it('does not restore comments after a successful submit', async () => {
    seedComments([{ id: 'c1', line: 3, text: '意见', createdAt: 1, updatedAt: 1 }])
    const { matched } = match()
    const { unmount } = render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['comment.submitAll'] }))
    await screen.findByRole('button', { name: '确认' })
    unmount()
    render(<DocReviewPanel matched={matched} {...kit} />)

    expect(screen.queryByText('意见')).toBeNull()
    expect(screen.queryByRole('button', { name: zh['comment.submitAll'] })).toBeNull()
    expect(screen.getByRole('button', { name: '确认' })).toBeTruthy()
  })

  it('clears persisted comments defensively on dismiss (去聊天里说)', async () => {
    const { matched, answer, cancel } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    // A stale persisted entry from an earlier session is cleared by dismiss.
    seedComments([{ id: 'old', line: 3, text: '旧', createdAt: 1, updatedAt: 1 }])
    fireEvent.click(screen.getByRole('button', { name: zh['action.cancel'] }))

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(answer).not.toHaveBeenCalled()
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull())
  })

  it('disables every comment affordance while a send is in flight', () => {
    seedComments([
      { id: 'c1', line: 3, text: '意见', createdAt: 1, updatedAt: 1 },
      { id: 'c2', line: 5, text: '意见2', createdAt: 2, updatedAt: 2 },
    ])
    const { matched } = match(questions(), vi.fn(async (_batch: AnswerBatch) => new Promise<void>(() => {})))
    render(<DocReviewPanel matched={matched} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['comment.submitAll'] }))
    expect(screen.getByRole('button', { name: zh['comment.submitAll'] }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: zh['comment.cancelAll'] }).hasAttribute('disabled')).toBe(true)
    for (const button of screen.getAllByRole('button', { name: zh['comment.delete'] })) {
      expect(button.hasAttribute('disabled')).toBe(true)
    }
    for (const button of screen.getAllByRole('button', { name: zh['comment.edit'] })) {
      expect(button.hasAttribute('disabled')).toBe(true)
    }
    expect(screen.getByRole('button', { name: '1 行' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps an out-of-range comment in the count and the aggregated feedback', () => {
    seedComments([{ id: 'far', line: 99, text: '越界意见', createdAt: 1, updatedAt: 1 }])
    const { matched, answer } = match()
    render(<DocReviewPanel matched={matched} {...kit} />)

    expect(screen.getByText('1 条评论')).toBeTruthy()
    expect(screen.queryByText('越界意见')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh['comment.submitAll'] }))
    expect(answer).toHaveBeenCalledWith(custom('对于第99行，我认为应越界意见'))
  })

  it('renders the new copy in English under the en locale', () => {
    const { matched } = match()
    render(<DocReviewPanel matched={matched} {...kit} t={seatOver(en)} />)

    fireEvent.contextMenu(document.querySelector('[data-line="5"]') as HTMLElement, { clientX: 10, clientY: 10 })
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    const input = screen.getByPlaceholderText('Type your comment') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'split it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))

    expect(screen.getByText('split it')).toBeTruthy()
    expect(screen.getByText('1 comments')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Submit comments' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('dialog', { name: 'Clear all comments?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeTruthy()
  })
})
