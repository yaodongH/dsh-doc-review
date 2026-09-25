/**
 * Document-review plugin, browser half: the review tab takeover plus the
 * `doc-review` dictionaries and the surface stylesheet.
 *
 * The native plan-review flow owns the decision surface: its compact card
 * answers the request and its `PlanReviewOpen` entry auto-opens the reviewed
 * document in the right Sidebar. This plugin does not touch that flow. It
 * claims the document tab instead: an extension-band sidebar tab type whose
 * patterns match both review addresses the flow produces (`dsh-resource://
 * plan/**` for a logged plan, `dsh-resource://plan-review/**` for a temporary
 * preview), so every auto-opened review lands on this plugin's commentable
 * body while the builtin preview keeps every other plan tab.
 *
 * The body reaches the answerable carrier without claiming the composer chain:
 * the Session's effective pending interaction (the standard `useSessionStatus`
 * hook) carries it, matched to the tab by request key or plan invocation. The
 * decision card's badge entry shares the comment store and keeps unsubmitted
 * comments visible next to the native approve button. Everything else — the
 * aggregate answer encoding — rides the carrier's own `answer`.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ui-renderer Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the sidebar-right Context merge (ctx.sidebarRightTabs) and
// the tab seats' SlotMap entries this plugin registers under.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { PlanReviewBadge } from './plan-badge.tsx'
import { ReviewTab, ReviewTabTitle } from './review-tab.tsx'
import { parseReviewAddress } from './review-address.ts'
import { createDocReviewStore } from './review-store.ts'
import { en, zh, type DocReviewKey } from './locales.ts'
import { installDocReviewStyles } from './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The review tab's and the badge's copy. */
    'doc-review': DocReviewKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'doc-review'

/** The tab type's and keyed seats' identity in the sidebar tab system. */
const TAB_ID = 'dsh-doc-review'

/** Required services: the slot registry, the review surfaces' copy, and the
 * sidebar tab-type registry this plugin claims its kind through. */
export const inject = ['slots', 'locale', 'sidebarRightTabs']

/**
 * Client plugin body: register the `doc-review` dictionaries, install the
 * surface stylesheet, claim the two review addresses as an extension tab
 * type, and mount the tab body, its chip title, and the decision-card badge.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-doc-review: dictionaries')
  ctx.effect(() => installDocReviewStyles(), 'dsh-doc-review: styles')

  const t = ctx.locale.bind(NS)
  const commentStore = createDocReviewStore()

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: 'plan-review',
    patterns: ['dsh-resource://plan/**', 'dsh-resource://plan-review/**'],
    priority: 'extension',
    canOpen: address => parseReviewAddress(address) !== undefined,
    title: () => t('preview.title'),
  }), 'dsh-doc-review: tab type')

  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
    locale: NS,
    store: commentStore,
  }, ReviewTab))
  ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: TAB_ID,
  }, ReviewTabTitle))
  ctx.slots.inject('conversation.plan-review.actions', () => ctx.slots.register({
    name: 'conversation.plan-review.actions',
    id: TAB_ID,
    locale: NS,
    store: commentStore,
  }, PlanReviewBadge))
}