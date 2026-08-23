/** `doc-review` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'doc.header': '文档审阅',
  'doc.expand': '展开完整文档',
  'doc.close': '关闭审阅窗口',
  'doc.approve': '确认执行',
  'doc.decline': '拒绝',
  'action.cancel': '去聊天里说',
  'action.submit': '提交',
  'custom.placeholder': '输入你的意见',
  'option.recommended': '推荐',
} satisfies Record<string, string>

/** The doc-review namespace key union. */
export type DocReviewKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'doc.header': 'Document review',
  'doc.expand': 'Expand full document',
  'doc.close': 'Close review window',
  'doc.approve': 'Approve',
  'doc.decline': 'Refuse',
  'action.cancel': 'Chat about it',
  'action.submit': 'Submit',
  'custom.placeholder': 'Type your feedback',
  'option.recommended': 'Recommended',
} satisfies Record<DocReviewKey, string>
