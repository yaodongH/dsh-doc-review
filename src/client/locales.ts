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
  'doc.line': '行',
  'comment.add': '添加评论',
  'comment.placeholder': '输入你的评论',
  'comment.publish': '发布',
  'comment.save': '保存',
  'comment.cancelEdit': '取消',
  'comment.edit': '编辑评论',
  'comment.delete': '删除评论',
  'comment.submitAll': '提交评论',
  'comment.cancelAll': '取消',
  'comment.confirmTitle': '确认清空所有评论？',
  'comment.confirmBody': '将清空全部评论且不会发送任何应答，你仍留在审阅页，可继续审阅或重新评论。',
  'comment.confirmOk': '确定',
  'comment.confirmCancel': '再想想',
  'comment.count': '{n} 条评论',
  'comment.lineMark': '本行有评论',
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
  'doc.line': 'Line',
  'comment.add': 'Add comment',
  'comment.placeholder': 'Type your comment',
  'comment.publish': 'Publish',
  'comment.save': 'Save',
  'comment.cancelEdit': 'Cancel',
  'comment.edit': 'Edit comment',
  'comment.delete': 'Delete comment',
  'comment.submitAll': 'Submit comments',
  'comment.cancelAll': 'Cancel',
  'comment.confirmTitle': 'Clear all comments?',
  'comment.confirmBody': 'This clears every comment without sending an answer. You stay on the review and can keep reviewing or comment again.',
  'comment.confirmOk': 'Confirm',
  'comment.confirmCancel': 'Not yet',
  'comment.count': '{n} comments',
  'comment.lineMark': 'This line has comments',
} satisfies Record<DocReviewKey, string>
