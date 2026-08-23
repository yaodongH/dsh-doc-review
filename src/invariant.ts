/**
 * Invariant companion for dsh-doc-review. The package owns one runtime
 * relationship — the composer-chain takeover claim — and its invariant is
 * asserted in tests against the claim predicate (`documentReviewOf`), which is
 * the pure function both the chain selector and the panel trust. There is no
 * host-side state to audit at runtime.
 */
export const name = 'dsh-doc-review-invariant'
