/**
 * Parsing for the two sidebar review addresses this plugin takes over, both
 * minted by the native plan flow: the logged plan resource
 * (`dsh-resource://plan/…`, from a submitted `exit_plan_mode` invocation) and
 * the temporary review preview (`dsh-resource://plan-review/…`, whose document
 * rides the open's navigation parameters). The grammar mirrors the native
 * minting so an extension claim sees exactly the addresses the flow produces.
 */

/** One parsed review address: its session and its document identity. */
export interface ReviewAddress {
  /** The session the review belongs to (address segment, already decoded). */
  readonly sessionId: string
  /** Logged plans: the reviewed tool invocation id. */
  readonly callId?: string
  /**
   * Temporary reviews: the pending question key, recovered from the address's
   * `<window>:<requestKey>` tail (the per-load window prefix is ignored).
   */
  readonly requestKey?: string
}

const PLAN = /^dsh-resource:\/\/plan\/([^?#]+)$/
const REVIEW = /^dsh-resource:\/\/plan-review\/([^/?#]+)\/([^/?#]+)$/

/**
 * Parse one review address into its session and document identity.
 * @param address - the sidebar navigation address.
 * @returns The parsed identity, or undefined for anything else.
 */
export function parseReviewAddress(address: string): ReviewAddress | undefined {
  const review = REVIEW.exec(address)
  if (review !== null) {
    // The FIRST ':' separates the per-load window prefix (a colon-free
    // random UUID) from the pending key; the prefix must never leak into
    // matching, and the key itself carries colons.
    const tail = review[2] ?? ''
    const separator = tail.indexOf(':')
    const requestKey = separator >= 0 ? tail.slice(separator + 1) : undefined
    return requestKey === '' ? undefined : { sessionId: decode(review[1] ?? ''), requestKey }
  }
  const plan = PLAN.exec(address)
  if (plan === null) return undefined
  const parts = (plan[1] ?? '').split('/').map(decodeURIComponent)
  if (parts.some(part => part === '')) return undefined
  if (parts.length === 2) {
    return { sessionId: parts[0] ?? '', callId: parts[1] }
  }
  if (parts.length === 5 && parts[0] === 'subagent'
    && (parts[3] === 'one-shot' || parts[3] === 'continuable' || parts[3] === 'unknown')) {
    // A subagent plan belongs to its parent session: the pending interaction
    // lives on the session that owns the subagent's review.
    return { sessionId: parts[1] ?? '', callId: parts[4] }
  }
  return undefined
}

/** Decode one URI segment; a malformed escape keeps the raw text. */
function decode(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}