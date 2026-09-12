/**
 * Document-review plugin, browser half: DocReviewPanel registered as a
 * selector-routed entry of the conversation-declared composer chain, plus the
 * `doc-review` dictionaries and the surface stylesheet. The selector claims
 * document-shaped question carriers (claim.ts) at priority -1 — before the
 * built-in question composer's default 0 — so design documents and plan
 * reviews open in the review modal, while every other pending interaction
 * falls through to the built-in composer unchanged. The whole behavior
 * surface rides the carrier; copy rides the standard locale seat.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ui-renderer Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ui-conversation SlotMap merge (the
// 'conversation.composer' chain entry) into this program, so the register
// options and PropsRuntime resolve.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DocReviewPanel } from './DocReviewPanel.tsx'
import { selectDocumentReview } from './claim.ts'
import { en, zh, type DocReviewKey } from './locales.ts'
import { installDocReviewStyles } from './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The document-review surfaces' copy. */
    'doc-review': DocReviewKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'doc-review'

/** Required services: the slot registry and the review surfaces' copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the `doc-review` dictionaries, install the
 * surface stylesheet, and register the document-review takeover into the
 * composer chain.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-doc-review: dictionaries')
  ctx.effect(() => installDocReviewStyles(), 'dsh-doc-review: styles')

  ctx.slots.inject('conversation.composer', () => ctx.slots.register(
    { name: 'conversation.composer', select: selectDocumentReview, priority: -1, locale: NS },
    DocReviewPanel,
  ))
}
