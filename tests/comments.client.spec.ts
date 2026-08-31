// @vitest-environment jsdom
// The comment data layer and line-model pure logic: key construction,
// localStorage persistence (round-trip, version/JSON/shape guards, storage
// failure degradation), immutable comment CRUD, aggregation formatting, and
// the line classifier / inline parser / selection-to-line anchor.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STORAGE_VERSION,
  addComment,
  buildFeedback,
  clearComments,
  createComment,
  deleteComment,
  detailHashOf,
  lineTextAt,
  loadComments,
  saveComments,
  splitLines,
  storageKey,
  updateComment,
  type DocComment,
} from '../src/client/comments.ts'
import { anchorLineOf, classifyLines, parseInline, type InlineNode } from '../src/client/lines.tsx'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

/** Flatten a parsed inline tree into every node (nested included). */
function flatten(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = []
  for (const node of nodes) {
    out.push(node)
    if ('c' in node) out.push(...flatten(node.c))
  }
  return out
}

/** Inner plain text of a subtree. */
function innerText(nodes: InlineNode[]): string {
  return nodes.map(n => n.t === 'text' ? n.s : innerText('c' in n ? n.c : [])).join('')
}

describe('storage key', () => {
  it('storageKey 拼键', () => {
    expect(storageKey('q:q-1')).toBe('dsh-doc-review:v1:comments:q:q-1')
  })
})

describe('persistence', () => {
  const COMMENT: DocComment = { id: 'c1', line: 5, text: '拆成两子模块', createdAt: 1, updatedAt: 1 }

  it('save/load/clear round-trip', () => {
    saveComments('q:q-1', [COMMENT], 'h1')
    expect(loadComments('q:q-1', 'h1')).toEqual([COMMENT])
    clearComments('q:q-1')
    expect(loadComments('q:q-1', 'h1')).toEqual([])
  })

  it('version!==1 整盘丢弃', () => {
    localStorage.setItem(storageKey('q:q-1'), JSON.stringify({ version: 2, comments: [COMMENT] }))
    expect(loadComments('q:q-1', 'h1')).toEqual([])
  })

  it('损坏 JSON 丢弃', () => {
    localStorage.setItem(storageKey('q:q-1'), '{not json')
    expect(loadComments('q:q-1')).toEqual([])
  })

  it('comments 非数组丢弃', () => {
    localStorage.setItem(storageKey('q:q-1'), JSON.stringify({ version: 1, comments: 'x' }))
    expect(loadComments('q:q-1')).toEqual([])
  })

  it('非法 shape 逐条过滤保留合法', () => {
    localStorage.setItem(storageKey('q:q-1'), JSON.stringify({
      version: 1,
      comments: [
        { id: 'c1', line: 5, text: 'ok', createdAt: 1, updatedAt: 1 },
        { id: '', line: 5, text: 'bad', createdAt: 1, updatedAt: 1 },
      ],
    }))
    expect(loadComments('q:q-1')).toEqual([{ id: 'c1', line: 5, text: 'ok', createdAt: 1, updatedAt: 1 }])
  })

  it('line<1 丢弃', () => {
    localStorage.setItem(storageKey('q:q-1'), JSON.stringify({
      version: 1,
      comments: [
        { id: 'c1', line: 0, text: 'ok', createdAt: 1, updatedAt: 1 },
        { id: 'c2', line: 3, text: 'ok', createdAt: 1, updatedAt: 1 },
      ],
    }))
    const loaded = loadComments('q:q-1')
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.line).toBe(3)
  })

  it('detailHash 不匹配丢弃', () => {
    localStorage.setItem(storageKey('q:q-1'), JSON.stringify({ version: 1, detailHash: 'old', comments: [COMMENT] }))
    expect(loadComments('q:q-1', 'newHash')).toEqual([])
  })

  it('localStorage getItem 抛→load 返回 []', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadComments('q:q-1')).toEqual([])
  })

  it('localStorage setItem 抛→save 不抛', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => saveComments('q:q-1', [COMMENT], 'h1')).not.toThrow()
  })

  it('localStorage removeItem 抛→clear 不抛', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => clearComments('q:q-1')).not.toThrow()
  })
})

describe('comment CRUD', () => {
  it('addComment 不可变且空文本不入', () => {
    const a: DocComment[] = []
    const b = addComment(a, { line: 5, text: ' t ' }, 100)
    expect(b).not.toBe(a)
    expect(b).toHaveLength(1)
    expect(b[0]?.text).toBe('t')
    expect(a).toEqual([])
    expect(() => createComment(5, '   ', 100)).toThrow('comment text must be non-empty')
  })

  it('createComment 防御 line<1', () => {
    expect(() => createComment(0, 'x', 100)).toThrow('comment line must be >= 1')
  })

  it('updateComment 不可变/未知 id 原引用/更新 text+updatedAt', () => {
    const a: DocComment[] = [{ id: 'c1', line: 5, text: '旧', createdAt: 100, updatedAt: 100 }]
    const b = updateComment(a, 'c1', ' 新 ', 200)
    expect(b[0]?.text).toBe('新')
    expect(b[0]?.updatedAt).toBe(200)
    expect(b[0]?.createdAt).toBe(100)
    expect(b).not.toBe(a)
    const c = updateComment(a, 'nope', 'x', 200)
    expect(c).toBe(a)
    const d = updateComment(a, 'c1', '   ', 200)
    expect(d).toBe(a)
  })

  it('deleteComment 不可变/未知 id 原引用', () => {
    const a: DocComment[] = [
      { id: 'c1', line: 1, text: 'x', createdAt: 1, updatedAt: 1 },
      { id: 'c2', line: 2, text: 'y', createdAt: 1, updatedAt: 1 },
    ]
    const b = deleteComment(a, 'c1')
    expect(b).toHaveLength(1)
    expect(b[0]?.id).toBe('c2')
    expect(a).toHaveLength(2)
    const c = deleteComment(a, 'nope')
    expect(c).toBe(a)
  })

  it('createComment id 唯一且 createdAt=updatedAt', () => {
    const one = createComment(5, 'x', 100)
    const two = createComment(5, 'x', 100)
    expect(one.id).not.toBe(two.id)
    expect(one.line).toBe(5)
    expect(one.text).toBe('x')
    expect(one.createdAt).toBe(100)
    expect(one.updatedAt).toBe(100)
  })
})

describe('buildFeedback 聚合', () => {
  const LINES = splitLines('# 概要\n\n## 架构\n\n- 模块 A\n- 模块 B\n')

  it('单条逐字句式', () => {
    const feedback = buildFeedback(
      [{ id: 'c1', line: 5, text: '拆成两子模块', createdAt: 1, updatedAt: 1 }],
      LINES,
    )
    expect(feedback).toBe('对于第5行- 模块 A，我认为应拆成两子模块')
  })

  it('多条按行升序并以换行拼接', () => {
    const feedback = buildFeedback([
      { id: 'c1', line: 6, text: 'B意见', createdAt: 1, updatedAt: 1 },
      { id: 'c2', line: 5, text: 'A意见', createdAt: 2, updatedAt: 2 },
    ], LINES)
    expect(feedback).toBe('对于第5行- 模块 A，我认为应A意见\n对于第6行- 模块 B，我认为应B意见')
  })

  it('空文本过滤', () => {
    const feedback = buildFeedback([
      { id: 'c1', line: 5, text: '   ', createdAt: 1, updatedAt: 1 },
      { id: 'c2', line: 6, text: '有效', createdAt: 2, updatedAt: 2 },
    ], LINES)
    expect(feedback).toBe('对于第6行- 模块 B，我认为应有效')
  })

  it('空集合返回空串', () => {
    expect(buildFeedback([], LINES)).toBe('')
  })

  it('越界行原文为空但仍包含', () => {
    const feedback = buildFeedback(
      [{ id: 'c1', line: 99, text: '越界意见', createdAt: 1, updatedAt: 1 }],
      LINES,
    )
    expect(feedback).toBe('对于第99行，我认为应越界意见')
  })

  it('不修改入参数组', () => {
    const input = [
      { id: 'c2', line: 6, text: 'B', createdAt: 1, updatedAt: 1 },
      { id: 'c1', line: 5, text: 'A', createdAt: 2, updatedAt: 2 },
    ]
    const original = [...input]
    buildFeedback(input, LINES)
    expect(input).toEqual(original)
  })
})

describe('splitLines / lineTextAt', () => {
  it('splitLines 尾部换行保留空行', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b', ''])
  })

  it('splitLines 空串', () => {
    expect(splitLines('')).toEqual([''])
  })

  it('lineTextAt 取行原文与越界', () => {
    const lines = ['a', 'b', '']
    expect(lineTextAt(lines, 1)).toBe('a')
    expect(lineTextAt(lines, 3)).toBe('')
    expect(lineTextAt(lines, 0)).toBe('')
    expect(lineTextAt(lines, 4)).toBe('')
  })
})

describe('classifyLines', () => {
  it('标题 ## 架构→level2', () => {
    const rows = classifyLines('## 架构')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('heading')
    expect(rows[0]?.level).toBe(2)
    expect(rows[0]?.raw).toBe('## 架构')
  })

  it('列表/任务/引用/分隔线/段落/空行分类与行号连续', () => {
    const rows = classifyLines('- a\n1. b\n- [x] done\n> quote\n---\npara\n\n')
    expect(rows.map(r => r.kind)).toEqual([
      'listItem', 'listItem', 'listItem', 'blockquote', 'hr', 'paragraph', 'blank', 'blank',
    ])
    expect(rows.map(r => r.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(rows[0]?.ordered).toBe(false)
    expect(rows[0]?.marker).toBe('- ')
    expect(rows[1]?.ordered).toBe(true)
    expect(rows[1]?.marker).toBe('1. ')
    expect(rows[2]?.task).toBe('x')
    expect(innerText(rows[3]?.inline ?? [])).toBe('quote')
    expect(innerText(rows[5]?.inline ?? [])).toBe('para')
  })

  it('围栏块含未闭合聚尾', () => {
    const rows = classifyLines('```ts\nconst x=1\n```\ntext\n~~~\n未闭合')
    expect(rows.map(r => r.kind)).toEqual([
      'codeFence', 'codeFence', 'codeFence', 'paragraph', 'codeFence', 'codeFence',
    ])
    expect(rows.map(r => r.line)).toEqual([1, 2, 3, 4, 5, 6])
    expect(rows[0]?.raw).toBe('```ts')
    expect(rows[4]?.raw).toBe('~~~')
    expect(rows[5]?.inline).toEqual([])
  })

  it('表格 run', () => {
    const rows = classifyLines('| a | b |\n|---|---|\n| 1 | 2 |\n段落')
    expect(rows.map(r => r.kind)).toEqual(['table', 'table', 'table', 'paragraph'])
    expect(rows[0]?.raw).toBe('| a | b |')
    expect(rows[1]?.inline).toEqual([])
  })
})

describe('parseInline', () => {
  it('子集解析', () => {
    const nodes = parseInline('**粗** *斜* `码` ~~删~~ [t](https://x) [b](javascript:bad)')
    const all = flatten(nodes)
    expect(all.filter(n => n.t === 'strong')).toHaveLength(1)
    expect(innerText(all.filter(n => n.t === 'strong')[0]?.c ?? [])).toBe('粗')
    expect(all.filter(n => n.t === 'em')).toHaveLength(1)
    expect(innerText(all.filter(n => n.t === 'em')[0]?.c ?? [])).toBe('斜')
    expect(all.filter(n => n.t === 'code')).toHaveLength(1)
    expect(all.filter(n => n.t === 'code')[0]).toMatchObject({ s: '码' })
    expect(all.filter(n => n.t === 'del')).toHaveLength(1)
    expect(all.filter(n => n.t === 'link')).toHaveLength(1)
    expect(all.filter(n => n.t === 'link')[0]).toMatchObject({ href: 'https://x' })
    expect(all.filter(n => n.t === 'link').every(n => n.t !== 'link' || !n.href.startsWith('javascript'))).toBe(true)
    expect(all.filter(n => n.t === 'text').some(n => n.s.includes('b'))).toBe(true)
  })

  it('未配对标记退化为纯文本', () => {
    const nodes = parseInline('~~未闭合')
    expect(flatten(nodes).filter(n => n.t === 'del')).toHaveLength(0)
    expect(innerText(nodes)).toBe('~~未闭合')
  })
})

describe('detailHashOf', () => {
  it('确定性', () => {
    expect(detailHashOf('doc')).toBe(detailHashOf('doc'))
    expect(detailHashOf('doc')).not.toBe(detailHashOf('doc2'))
    expect(typeof detailHashOf('doc')).toBe('string')
  })
})

describe('anchorLineOf', () => {
  it('选区起点行', () => {
    const row = document.createElement('div')
    row.setAttribute('data-line', '5')
    const textNode = document.createTextNode('模块A')
    row.appendChild(textNode)
    const selection = { toString: () => '模块A', anchorNode: textNode } as unknown as Selection
    expect(anchorLineOf(selection, null)).toBe(5)
  })

  it('空选区 fallbackRow', () => {
    const fallback = document.createElement('div')
    fallback.setAttribute('data-line', '7')
    const selection = { toString: () => '', anchorNode: null } as unknown as Selection
    expect(anchorLineOf(selection, fallback)).toBe(7)
  })

  it('都不在行→null', () => {
    expect(anchorLineOf({ toString: () => '', anchorNode: null } as unknown as Selection, null)).toBeNull()
  })
})
