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
