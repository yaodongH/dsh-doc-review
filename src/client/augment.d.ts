/**
 * Structural type merges for the shared surfaces this plugin reads but whose
 * owning packages do not re-export their augmentations through a public type
 * face: the `plan` resource protocol and the plan-review navigation
 * parameters are minted and consumed inside the native ui-plan package, whose
 * published `/client` entry does not carry them. The shapes mirror the
 * native minting structurally; the runtime contract is the same-process
 * boundary the native flow itself already relies on.
 */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap {
    /** Immutable markdown of one logged plan invocation. */
    plan: PlanDocumentView
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightResourceParamsMap {
    /** Temporary review documents ride the open's navigation parameters. */
    'plan-review': { readonly planReview: PlanDocumentView }
  }
}

/** One plan document as the native flow carries it. */
interface PlanDocumentView {
  /** The complete markdown. */
  readonly markdown: string
  /** The document's heading, as the native flow extracted it. */
  readonly title: string
  /** The logged tool invocation backing the document. */
  readonly callId: string
}