/*
 * =============================================================================
 * FILE: src/lib/geo.mjs
 *
 * DESCRIPTION:
 * A utility module for handling geographic data extracted from the Cloudflare
 * request object (`request.cf`).
 * =============================================================================
 */

/**
 * Creates a concatenated geographic identifier string from the Cloudflare `cf` object.
 * This provides a single, rich dimension for geographic analysis in the
 * Workers Analytics Engine.
 *
 * @param {object | undefined} cf - The Cloudflare `cf` object from the request.
 * @returns {string | null} The geographic ID (e.g., "NA-US-NY-New York-10001") or null.
 *
 * @example
 * const cf = {
 * continent: 'NA',
 * country: 'US',
 * regionCode: 'NY',
 * city: 'New York',
 * postalCode: '10001'
 * };
 * const geoId = buildGeoId(cf);
 * // -> "NA-US-NY-New York-10001"
 */
export function buildGeoId(cf) {
    if (!cf) return null;
    return [cf.continent, cf.country, cf.regionCode, cf.city, cf.postalCode].filter(Boolean).join('-') || null;
}