/**
 * Injected stylesheet for the document-review surfaces. A plain CSS string
 * (no CSS-module pipeline in this external plugin), installed once with a
 * data-attribute guard and removed with the plugin fiber. Every `dr-` class
 * is prefixed, and colors use only the theme's `--dsw-*`/`--dsh-*` tokens —
 * no hardcoded values.
 */
export const DOC_REVIEW_CSS = `
.dr-frame {
  display: flex;
  justify-content: center;
  padding: 6px 24px 10px;
}

/* Compact control bar: the composer seat's occupant while the modal is
   closed. Neutral document-review language (no warn tint). */
.dr-bar {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--dsh-chat-content-width, 720px);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 20px;
  background: var(--dsw-specific-input-major);
  box-shadow: var(--dsw-shadow-lv2);
  color: var(--dsw-alias-label-primary);
}

.dr-bar-head {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.dr-bar-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-label-secondary);
}

.dr-bar-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
}

.dr-bar-expand {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary);
}

.dr-bar-expand:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dr-bar-body {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 4px;
  padding: 4px 16px 8px;
}

.dr-feedback {
  min-height: 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 11px;
  line-height: 16px;
}

/* One decision line: option buttons left, dismiss right. */
.dr-actions-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dr-cancel {
  margin-left: auto;
}

.dr-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.dr-badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--dsw-alias-state-warn-secondary);
  color: var(--dsw-alias-state-warn-label);
  font-size: 10px;
  line-height: 14px;
}

.dr-custom {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dr-custom-input {
  flex: 1 1 auto;
  min-width: 0;
  box-sizing: border-box;
  min-height: 24px;
  padding: 2px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  resize: none;
}

.dr-custom-input:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}

/* Full-document modal: fixed header/footer around a scrollable markdown body. */
.dr-modal {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: min(880px, 100%);
  height: min(84vh, 960px);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}

.dr-modal-head {
  display: flex;
  align-items: flex-start;
  flex-shrink: 0;
  gap: 8px;
  padding: 20px 14px 4px 24px;
}

.dr-modal-titles {
  flex: 1 1 auto;
  min-width: 0;
}

.dr-modal-kicker {
  display: block;
  margin-bottom: 2px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}

.dr-modal-title {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}

.dr-modal-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary);
}

.dr-modal-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dr-modal-question {
  flex-shrink: 0;
  margin: 0;
  padding: 0 24px 10px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}

.dr-modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 24px 12px;
  font-size: 14px;
  line-height: 22px;
}

.dr-modal-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 24px 8px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}


/* Line grid: the review body as source lines with a clickable gutter, comment
   blocks and inline comment editors (compact, token-only). */
.dr-line-grid { display: flex; flex-direction: column; }
.dr-line-row { display: flex; flex-direction: column; position: relative; padding: 1px 0; }
.dr-line-main { display: flex; align-items: flex-start; gap: 8px; }
.dr-line-gutter { flex: none; width: 32px; text-align: right; user-select: none; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 22px; }
.dr-line-gutter-num { appearance: none; background: transparent; border: none; cursor: pointer; color: inherit; font: inherit; font-size: 12px; line-height: 20px; padding: 0 4px; border-radius: 4px; }
.dr-line-gutter-num:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dr-line-gutter-num:focus-visible { outline: none; color: var(--dsw-alias-brand-primary); }
.dr-line-content { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); }
.dr-line-heading { margin: 6px 0 2px; }
h1.dr-line-heading { font-size: 18px; line-height: 26px; }
h2.dr-line-heading { font-size: 16px; line-height: 24px; }
h3.dr-line-heading { font-size: 15px; line-height: 22px; }
h4.dr-line-heading, h5.dr-line-heading, h6.dr-line-heading { font-size: 14px; line-height: 22px; }
.dr-line-para { margin: 0; }
.dr-line-list-item { margin: 0; }
.dr-line-quote { margin: 0; padding: 2px 10px; border-left: 3px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.dr-line-hr { margin: 6px 0; border: none; border-top: 1px solid var(--dsw-alias-border-l2); }
.dr-line-blank { display: block; min-height: 4px; }
.dr-line-code { margin: 2px 0; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-specific-input-major); color: var(--dsw-alias-label-primary); font-family: var(--dsh-font-mono, monospace); font-size: 12px; line-height: 18px; overflow-x: auto; white-space: pre; }
.dr-line-code code { font-family: inherit; }
.dr-line-table { margin: 2px 0; padding: 4px 10px; border-left: 2px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; overflow-x: auto; white-space: pre; }
.dr-line-commented { background: var(--dsw-alias-interactive-bg-hover); }
.dr-line-commented > .dr-line-main { border-left: 2px solid var(--dsw-alias-brand-primary); padding-left: 8px; }
.dr-comment { display: flex; align-items: flex-start; gap: 8px; margin: 2px 0 4px 40px; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l2); border-left: 2px solid var(--dsw-alias-brand-primary); border-radius: 8px; background: var(--dsw-specific-input-major); }
.dr-comment-text { flex: 1 1 auto; min-width: 0; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 18px; overflow-wrap: anywhere; }
.dr-comment-actions { flex: none; display: inline-flex; gap: 4px; align-items: center; }
.dr-comment-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: none; border-radius: 4px; background: transparent; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.dr-comment-icon-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dr-comment-icon-btn:disabled { opacity: 0.5; cursor: default; }
.dr-comment-editor { display: flex; flex-direction: column; gap: 6px; margin: 2px 0 4px 40px; padding: 6px 10px; border-left: 2px solid var(--dsw-alias-brand-primary); border-radius: 0 8px 8px 0; background: var(--dsw-specific-input-major); }
.dr-comment-editor-input { box-sizing: border-box; min-height: 28px; max-height: 160px; overflow-y: auto; padding: 4px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-specific-input-major); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 18px; resize: none; }
.dr-comment-editor-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.dr-comment-editor-actions { display: flex; gap: 8px; justify-content: flex-end; }
.dr-context-menu { position: fixed; z-index: 1000; min-width: 120px; padding: 4px; border-radius: 8px; background: var(--dsw-specific-input-major); border: 1px solid var(--dsw-alias-border-l2); box-shadow: var(--dsw-shadow-lv2); }
.dr-context-menu-item { display: flex; width: 100%; align-items: center; gap: 8px; padding: 6px 8px; border: none; border-radius: 4px; background: transparent; cursor: pointer; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; text-align: left; }
.dr-context-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dr-review-actions { display: flex; align-items: center; gap: 8px; }
.dr-confirm { width: min(420px, 100%); background: var(--dsw-specific-input-major); }
.dr-confirm-body h2 { margin: 0 0 4px; font-size: 15px; line-height: 22px; color: var(--dsw-alias-label-primary); }
.dr-confirm-body p { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dr-confirm-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.dr-bar-count { flex: none; margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: var(--dsw-alias-state-warn-secondary); color: var(--dsw-alias-state-warn-label); font-size: 11px; line-height: 16px; }

`
/** Install the stylesheet once; the returned disposer removes it. */
export function installDocReviewStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.querySelector('style[data-dsh-doc-review]') !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.dshDocReview = 'true'
  tag.textContent = DOC_REVIEW_CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}
