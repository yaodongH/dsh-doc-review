/**
 * The decision-card badge: one `conversation.plan-review.actions` entry that
 * keeps the user's unsubmitted comments visible next to the native approve
 * button — the native card itself cannot hide that button, so the badge is
 * the review's "you still have work to send" signal, and its 提交评论 action
 * delivers the aggregated feedback even while the sidebar is closed.
 *
 * The badge shares the review tab's comment store (both registrations are
 * session-scoped, so the framework caches one live instance) and reaches the
 * carrier through the Session's effective pending interaction, matched by the
 * request key the slot's owner shares.
 */

import { useMemo, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { parseBlocks } from './blocks.ts'
import { documentReviewOf } from './claim.ts'
import { buildFeedback, detailHashOf } from './comments.ts'
import { commentsOf, type DocReviewStore } from './review-store.ts'
import type { DocReviewKey } from './locales.ts'

/** Full badge props: the actions slot's runtime share, the shared comment
 * store, and the locale seat. */
export type PlanReviewBadgeProps =
  PropsRuntime<'conversation.plan-review.actions'>
  & PropsStore<DocReviewStore>
  & PropsLocale<'doc-review'>

/**
 * Render the unsubmitted-comments badge and its submit action for one pending
 * review; nothing while the review carries no comments.
 *
 * @param props - the slot's owner data (review + request key), the session
 * standard kit, the shared store, and copy.
 * @returns The badge, or null when there is nothing to flag.
 */
export function PlanReviewBadge({
  review, requestKey, sessionId, useSessionStatus, useStore, actions, t,
}: PlanReviewBadgeProps) {
  const pending = useSessionStatus(snapshot => snapshot.get(sessionId)?.pendingInteraction)
  // The slot's request key IS the carrier's key while this review is the
  // Session's effective interaction; a different pending interaction (an
  // approval outranking it) leaves the badge visible but inert.
  const answerable = pending !== undefined && pending.key === requestKey
  const hash = useMemo(() => detailHashOf(review.plan), [review.plan])
  const comments = useStore(state => commentsOf(state, requestKey, hash))
  const blocks = useMemo(() => parseBlocks(review.plan), [review.plan])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const settle = (send: () => Promise<void>): void => {
    setBusy(true)
    setError(null)
    void send().catch((cause: unknown) => {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }
  const submit = (): void => {
    if (!answerable || comments.length === 0) return
    // Key equality plus the runtime discriminator check inside the narrowing:
    // the assembled Client unions every domain's carrier, and this program
    // compiles against the question member alone.
    const wait = documentReviewOf(pending)
    if (wait === null) return
    settle(async () => {
      await wait.interaction.answer({
        answers: [{ id: wait.review.id, selected: [], custom: buildFeedback(comments, blocks) }],
      })
      actions.drop(requestKey)
    })
  }

  if (comments.length === 0) return null
  return (
    <span className="drr-badge" data-doc-review-badge={requestKey}>
      {error !== null && <span className="drr-badge-error" role="status">{error}</span>}
      <Button variant="outline" size="sm" disabled={busy || !answerable} onClick={submit}>
        {t('comment.unsubmitted').replace('{n}', String(comments.length))}
      </Button>
    </span>
  )
}