/**
 * Document-review plugin, node half. Pure UI plugin: the empty apply exists so
 * the plugin appears in the profile cordis.yml / Loader; the browser half
 * ships via exports["./client"], discovered through the package.json dsh.client
 * declaration. The claim logic and the review surface live entirely client-side.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
