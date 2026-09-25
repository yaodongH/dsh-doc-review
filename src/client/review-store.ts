/**
 * The shared review-comment store: one entry-declared store handle, mounted
 * under the review tab's body and the decision card's badge registration (both
 * session-scoped), so the two surfaces read and write the same live comment
 * state. The engine's persistence keeps the state across page reloads while a
 * review is still pending; a per-key content hash guards against a wait key
 * reused across changed documents.
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { DocComment } from './comments.ts'

/** One persisted key's comment state: content guard plus comments. */
export interface KeyedComments {
  /** FNV-1a hash of the document the comments belong to. */
  readonly hash: string
  readonly comments: readonly DocComment[]
}

/** Live comment state, keyed by the pending carrier's key. The record is
 * mutable: store actions mutate the engine draft in place. */
export interface DocReviewCommentsState {
  byKey: Record<string, KeyedComments | undefined>
}

/** The review tab's own actions on the shared comment state. */
export type DocReviewCommentsActions = {
  /** Replace one key's comments (and its content guard). */
  set: (draft: DocReviewCommentsState, waitKey: string, hash: string, comments: readonly DocComment[]) => void
  /** Drop one key's state entirely (submitted, or its carrier settled). */
  drop: (draft: DocReviewCommentsState, waitKey: string) => void
}

/** The store handle's full shape, as registrations receive it. */
export type DocReviewStore = EngineStoreHandle<DocReviewCommentsState, DocReviewCommentsActions>

/** The stable empty comment list: a selector's snapshot between changes. */
const EMPTY: readonly DocComment[] = []

/**
 * Read one key's comments, honoring the content guard.
 * @param state - the shared store state.
 * @param waitKey - the pending carrier's key.
 * @param hash - the reviewed document's content hash.
 * @returns The comments, or the stable empty list when the key is unset or
 * the guard disagrees.
 */
export function commentsOf(
  state: DocReviewCommentsState,
  waitKey: string,
  hash: string,
): readonly DocComment[] {
  const keyed = state.byKey[waitKey]
  return keyed !== undefined && keyed.hash === hash ? keyed.comments : EMPTY
}

/**
 * Create the shared comment-store handle.
 * @returns The handle to pass to every registration that reads or writes
 * review comments.
 */
export function createDocReviewStore(): DocReviewStore {
  return defineStore<DocReviewCommentsState, DocReviewCommentsActions>({
    init: (): DocReviewCommentsState => ({ byKey: {} }),
    persist: 'dsh-doc-review:comments',
    actions: {
      set: (draft, waitKey, hash, comments) => {
        draft.byKey[waitKey] = { hash, comments }
      },
      drop: (draft, waitKey) => {
        delete draft.byKey[waitKey]
      },
    },
  })
}