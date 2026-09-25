// @vitest-environment jsdom
// The block model and the review address grammar: the mdast parse's top-level
// records (line ranges, sources, renderability), the exact segment slicing,
// the anchor lookup, and the alignment self-check over synthetic DOM, plus the
// address parsing both review forms and their rejects.
import { describe, expect, it } from 'vitest'
import {
  alignSegment, blockAtLine, hasCrossBlockReferences, normalize, parseBlocks,
  plainTextOf, sliceBetween,
} from '../src/client/blocks.ts'
import { partitionSegments } from '../src/client/review-tab.tsx'
import { parseReviewAddress } from '../src/client/review-address.ts'
import { REVIEW_DOC } from './carrier.ts'

describe('parseBlocks', () => {
  const blocks = parseBlocks(REVIEW_DOC)

  it('records 1-based line ranges and exact sources', () => {
    expect(blocks[0]).toMatchObject({ type: 'heading', sig: 'h1', startLine: 1, endLine: 1 })
    expect(blocks[0]?.source).toBe('# 概要设计：仓库管理')
    const paragraph = blocks.find(block => block.source === '前端使用 React，后端使用 Node。')
    expect(paragraph).toMatchObject({ type: 'paragraph', sig: 'p', startLine: 5, endLine: 5 })
  })

  it('keeps multi-line runs as one block and knows their signatures', () => {
    const list = blocks.find(block => block.type === 'list')
    expect(list).toMatchObject({ sig: 'list', startLine: 9, endLine: 10 })
    expect(list?.source).toBe('- 依赖升级风险\n- 兼容性风险')
    const table = blocks.find(block => block.type === 'table')
    expect(table).toMatchObject({ sig: 'table', startLine: 12, endLine: 14 })
    const fence = blocks.find(block => block.type === 'code')
    expect(fence).toMatchObject({ sig: 'codeBlock', startLine: 16, endLine: 18 })
  })

  it('marks definitions and raw html unrenderable', () => {
    const doc = '文本段落。\n\n[ref]: https://example.com\n'
    const parsed = parseBlocks(doc)
    expect(parsed.find(block => block.type === 'definition')).toMatchObject({ sig: undefined })
    expect(parsed.find(block => block.type === 'paragraph')).toMatchObject({ sig: 'p' })
  })

  it('maps math blocks to the katex signature', () => {
    const parsed = parseBlocks('前言。\n\n$$\nE = mc^2\n$$\n')
    expect(parsed.find(block => block.type === 'math')).toMatchObject({ sig: 'math' })
  })
})

describe('blockAtLine / sliceBetween', () => {
  const blocks = parseBlocks(REVIEW_DOC)

  it('resolves containment to the covering block', () => {
    expect(blockAtLine(blocks, 9)?.type).toBe('list')
    expect(blockAtLine(blocks, 12)?.type).toBe('table')
    expect(blockAtLine(blocks, 9999)).toBeUndefined()
  })

  it('slices the exact source span including inter-block blank lines', () => {
    const list = blockAtLine(blocks, 9)
    const table = blockAtLine(blocks, 12)
    expect(list).toBeDefined()
    expect(table).toBeDefined()
    expect(sliceBetween(REVIEW_DOC, list as NonNullable<typeof list>, table as NonNullable<typeof table>))
      .toBe('- 依赖升级风险\n- 兼容性风险\n\n| 模块 | 说明 |\n| --- | --- |\n| 存储 | SQLite |')
  })
})

describe('partitionSegments', () => {
  const blocks = parseBlocks(REVIEW_DOC)

  it('keeps an uncommented document as one segment', () => {
    const segments = partitionSegments(REVIEW_DOC, blocks, new Set())
    expect(segments).toHaveLength(1)
    expect(segments[0]?.source).toBe(REVIEW_DOC.slice(0, -1))
  })

  it('ends a segment at every anchored block and drops the seam blank lines', () => {
    const anchors = new Set([3, 7])
    const segments = partitionSegments(REVIEW_DOC, blocks, anchors)
    expect(segments.map(segment => segment.blocks.at(-1)?.startLine)).toEqual([3, 7, 16])
    // The seam blank lines between segments are not part of either neighbor.
    expect(segments[0]?.source).toBe('# 概要设计：仓库管理\n\n## 架构')
    expect(segments[1]?.source).toBe('前端使用 React，后端使用 Node。\n\n## 风险')
  })
})

describe('alignSegment', () => {
  const element = (tag: string, text = '', className = ''): HTMLElement => {
    const node = document.createElement(tag)
    if (className !== '') node.className = className
    if (tag === 'UL' || tag === 'OL' || tag === 'TABLE' || tag === 'PRE' || tag === 'HR') {
      // Structural elements carry no text of their own.
    } else {
      node.textContent = text
    }
    return node
  }

  it('aligns verified paragraphs and degrades on a text mismatch', () => {
    const container = document.createElement('div')
    container.append(element('P', '前端使用 React'), element('P', '后端使用 Node'))
    const blocks = parseBlocks('前端使用 React\n\n后端使用 Node')
    expect(alignSegment(container, blocks).ok).toBe(true)

    const wrong = document.createElement('div')
    wrong.append(element('P', '完全不同的一段话'), element('P', '后端使用 Node'))
    expect(alignSegment(wrong, blocks).ok).toBe(false)
  })

  it('degrades on a count or kind mismatch', () => {
    const blocks = parseBlocks('# 标题\n\n段落')
    const kinds = document.createElement('div')
    kinds.append(element('H1', '标题'), element('H2', '标题'))
    expect(alignSegment(kinds, blocks).ok).toBe(false)
    const count = document.createElement('div')
    count.append(element('H1', '标题'))
    expect(alignSegment(count, blocks).ok).toBe(false)
  })

  it('aligns a table block through its scroll wrapper', () => {
    const container = document.createElement('div')
    const wrapper = element('DIV', '', 'tableScroll')
    wrapper.append(element('TABLE'))
    container.append(wrapper)
    const blocks = parseBlocks('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(alignSegment(container, blocks).ok).toBe(true)
  })

  it('skips the trailing footnote section', () => {
    const container = document.createElement('div')
    container.append(element('P', '正文'), element('SECTION', '脚注', 'footnotes'))
    ;(container.children[1] as HTMLElement).setAttribute('data-footnotes', '')
    const blocks = parseBlocks('正文')
    expect(alignSegment(container, blocks).ok).toBe(true)
  })
})

describe('block model helpers', () => {
  it('hasCrossBlockReferences detects definition blocks', () => {
    expect(hasCrossBlockReferences(parseBlocks('正文。\n\n[ref]: https://example.com'))).toBe(true)
    expect(hasCrossBlockReferences(parseBlocks('正文。'))).toBe(false)
  })

  it('plainTextOf strips inline syntax and normalizes whitespace', () => {
    expect(plainTextOf('## 使用 **React** 框架')).toBe(normalize('使用 React 框架'))
    expect(plainTextOf('见 [文档](https://example.com) 与 `代码`')).toBe('见 文档 与 代码')
  })
})

describe('parseReviewAddress', () => {
  it('parses a temporary review address and strips the window prefix', () => {
    const parsed = parseReviewAddress('dsh-resource://plan-review/s1/ab12cd:question:3')
    expect(parsed).toMatchObject({ sessionId: 's1', requestKey: 'question:3' })
  })

  it('parses logged plan addresses, including the subagent form', () => {
    expect(parseReviewAddress('dsh-resource://plan/s1/call-1'))
      .toMatchObject({ sessionId: 's1', callId: 'call-1' })
    expect(parseReviewAddress('dsh-resource://plan/subagent/s1/c9/one-shot/call-2'))
      .toMatchObject({ sessionId: 's1', callId: 'call-2' })
  })

  it('rejects everything else', () => {
    expect(parseReviewAddress('dsh-resource://file/s1/home/x.md')).toBeUndefined()
    expect(parseReviewAddress('sidebar://guide')).toBeUndefined()
    expect(parseReviewAddress('dsh-resource://plan-review/s1')).toBeUndefined()
  })
})