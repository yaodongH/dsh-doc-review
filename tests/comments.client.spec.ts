// The comment data layer, v2 block anchors: id generation, immutable CRUD,
// the aggregation formatter quoting anchor blocks, and the content hash.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addComment, buildFeedback, createComment, deleteComment, detailHashOf,
  updateComment, type DocComment,
} from '../src/client/comments.ts'
import { parseBlocks } from '../src/client/blocks.ts'
import { REVIEW_DOC } from './carrier.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

const NOW = 1_700_000_000_000

/** The parsed block model of the fixture document. */
const BLOCKS = parseBlocks(REVIEW_DOC)

describe('createComment', () => {
  it('anchors at the block and records its end line', () => {
    const comment = createComment({ line: 3, endLine: 3 }, '  这里的架构描述太薄了  ', NOW)
    expect(comment).toMatchObject({ line: 3, endLine: 3, createdAt: NOW, updatedAt: NOW })
    expect(comment.text).toBe('这里的架构描述太薄了')
    expect(comment.id).not.toBe('')
  })

  it('keeps single-line anchors without an end line', () => {
    const comment = createComment({ line: 5 }, '意见', NOW)
    expect(comment.endLine).toBeUndefined()
  })

  it('rejects empty text and bad lines', () => {
    expect(() => createComment({ line: 3 }, '   ', NOW)).toThrow()
    expect(() => createComment({ line: 0 }, '文本', NOW)).toThrow()
  })
})

describe('comment CRUD', () => {
  const base = createComment({ line: 5, endLine: 5 }, '初版意见', NOW)

  it('updateComment rewrites the text and bumps updatedAt', () => {
    const next = updateComment([base], base.id, '修改后的意见', NOW + 5)
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ text: '修改后的意见', updatedAt: NOW + 5, createdAt: NOW })
    expect(next[0]?.id).toBe(base.id)
  })

  it('updateComment ignores empty text and unknown ids', () => {
    const held = [base]
    expect(updateComment(held, base.id, '  ', NOW)).toBe(held)
    expect(updateComment(held, 'nope', 'x', NOW)).toBe(held)
  })

  it('deleteComment removes only the matched comment', () => {
    expect(deleteComment([base], base.id)).toEqual([])
    const held = [base]
    expect(deleteComment(held, 'nope')).toBe(held)
  })
})

describe('buildFeedback', () => {
  it('quotes each anchor block in line order', () => {
    const comments: DocComment[] = [
      createComment({ line: 9, endLine: 10 }, '请补充风险缓解措施', NOW),
      createComment({ line: 3, endLine: 3 }, '标题层级再斟酌', NOW + 1),
    ]
    expect(buildFeedback(comments, BLOCKS)).toBe([
      '对于第3行## 架构，我认为应标题层级再斟酌',
      '对于第9行- 依赖升级风险\n- 兼容性风险，我认为应请补充风险缓解措施',
    ].join('\n'))
  })

  it('drops whitespace-only comments and keeps unmatched anchors with an empty quote', () => {
    const comments = [
      createComment({ line: 3 }, '有效意见', NOW),
      { id: 'blank', line: 4, text: '   ', createdAt: NOW, updatedAt: NOW },
    ]
    expect(buildFeedback(comments, BLOCKS)).toBe('对于第3行## 架构，我认为应有效意见')
    expect(buildFeedback([createComment({ line: 404 }, '文档已变更的锚点', NOW)], BLOCKS))
      .toBe('对于第404行，我认为应文档已变更的锚点')
  })

  it('returns empty for nothing to send', () => {
    expect(buildFeedback([], BLOCKS)).toBe('')
  })
})

describe('detailHashOf', () => {
  it('is deterministic and separates documents', () => {
    expect(detailHashOf(REVIEW_DOC)).toBe(detailHashOf(REVIEW_DOC))
    expect(detailHashOf(REVIEW_DOC)).not.toBe(detailHashOf('另一份文档'))
  })
})

/** Identity helper keeping the no-op expectations explicit. */
function comments(value: readonly DocComment[]): readonly DocComment[] {
  return value
}