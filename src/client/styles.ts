/**
 * Injected stylesheet for the review tab's takeover. A plain CSS string (no
 * CSS-module pipeline in this external plugin), installed once with a
 * data-attribute guard and removed with the plugin fiber. Every `drr-` class
 * is prefixed, and colors use only the theme's `--dsw-*`/`--dsh-*` tokens —
 * no hardcoded values.
 */
export const DOC_REVIEW_CSS = `
.drr-root {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: var(--dsw-alias-label-primary);
}

/* The document body is the whole tab content; the seat scrolls it. The
   wrapper is the positioned host of the hover affordance, which lives in
   content coordinates and scrolls with the document. */
.drr-body {
  position: relative;
  flex: 1 0 auto;
  padding: 12px 20px 24px;
}

/* Each segment wraps one native MarkdownText instance; with no comments the
   document is one segment and the body IS the native preview. */
.drr-segment {
  min-width: 0;
}

/* Seam spacing: a MarkdownText instance zeroes its first/last child margins,
   so the plugin supplies the gap a seam needs. Most seams are covered by the
   comment card standing there. */
.drr-segment + .drr-segment {
  margin-top: 16px;
}

.drr-seam {
  margin: 8px 0;
}

.drr-orphan {
  margin-top: 12px;
}

/* Hover affordance: a floating + button at the anchored block's top-right
   corner; content coordinates (the wrapper is positioned). */
.drr-afford {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 50%;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  box-shadow: var(--dsw-shadow-lv1);
}

.drr-afford:hover,
.drr-afford:focus-visible {
  color: var(--dsw-alias-link);
  border-color: var(--dsw-alias-border-l3);
}

/* One published comment: a quiet card riding the seam under its block. */
.drr-comment {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-markdown-inline-code, var(--dsw-specific-input-minor));
}

.drr-comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.drr-comment-anchor {
  font: var(--dsw-font-markdown-base-strong, inherit);
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}

.drr-comment-actions {
  display: flex;
  gap: 4px;
}

.drr-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}

.drr-icon-btn:hover:not(:disabled),
.drr-icon-btn:focus-visible {
  background: var(--dsw-alias-fill-secondary);
  color: var(--dsw-alias-label-primary);
}

.drr-icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Inline comment editor (new draft and edits) — the compact card form. */
.drr-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-left: 2px solid var(--dsw-alias-state-business-primary);
  border-radius: 8px;
  background: var(--dsw-specific-input-major);
}

.drr-editor-input {
  width: 100%;
  min-height: 24px;
  padding: 4px 6px;
  border: none;
  border-radius: 6px;
  background: none;
  color: inherit;
  font: var(--dsw-font-markdown-base);
  resize: vertical;
}

.drr-editor-input:focus-visible {
  outline: none;
}

.drr-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

/* Sticky footer while the review is answerable: submit/clear at the bottom of
   the tab's scrollport. */
.drr-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-elevated, var(--dsw-specific-input-major));
}

.drr-feedback {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--dsw-alias-state-failure-primary, var(--dsw-alias-label-secondary));
}

.drr-count {
  flex: none;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}

.drr-footer-actions {
  display: flex;
  gap: 6px;
}

/* Read-only / unavailable states, mirroring the native preview's messages. */
.drr-state {
  padding: 32px 20px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
}

/* The decision-card badge: unsubmitted comments next to the approve button. */
.drr-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.drr-badge-error {
  font-size: 12px;
  color: var(--dsw-alias-state-failure-primary, var(--dsw-alias-label-secondary));
}

/* Secondary confirmation for clearing every comment. */
.drr-confirm .drr-confirm-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.drr-confirm .drr-confirm-body h2 {
  margin: 0;
  font: var(--dsw-font-markdown-h3, inherit);
  color: var(--dsw-alias-label-primary);
}

.drr-confirm .drr-confirm-body p {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
}

.drr-confirm .drr-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 0 16px 12px;
}

.drr-title-icon {
  margin-right: 4px;
  color: var(--dsw-alias-label-secondary);
}
`
/**
 * Install the stylesheet once per document, guarded by a data attribute, and
 * return the disposer the plugin's effect removes it with.
 * @returns The style element's removal callback.
 */
export function installDocReviewStyles(): () => void {
  const id = 'dsh-doc-review-styles'
  if (document.querySelector(`style[data-${id}]`) === null) {
    const style = document.createElement('style')
    style.setAttribute(`data-${id}`, '')
    style.textContent = DOC_REVIEW_CSS
    document.head.append(style)
    return () => { style.remove() }
  }
  return () => {}
}
