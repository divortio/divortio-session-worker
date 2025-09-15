/*
 * =============================================================================
 * FILE: src/wae/schema.mjs
 *
 * DESCRIPTION:
 * Defines the formal schema for data points sent to the Workers Analytics
 * Engine (WAE). This module uses JSDoc typedefs to create a clear "contract"
 * for the analytics data, ensuring consistency and making the data easier to
 * query and understand.
 * =============================================================================
 */

/**
 * @typedef {object} AnalyticsDataPoint
 * @property {string[]} indexes - An array containing a single, high-cardinality
 * string used as the sampling key. For this schema, it is the Client ID (cID).
 * @property {string[]} blobs - An array of low-to-medium cardinality strings
 * used as dimensions for filtering and grouping.
 * @property {number[]} doubles - An array of numeric values representing the
 * metrics to be aggregated for this event.
 */

/**
 * Defines the specific structure and order of the `blobs` array for an
 * analytics data point.
 *
 * @typedef {Array<string>} SessionEventBlobs
 * @property {string} 0 - The two-letter country code from the request (e.g., "US").
 * @property {string} 1 - The Cloudflare colo ID from the request (e.g., "EWR").
 * @property {string} 2 - A concatenated geographic ID (e.g., "NA-US-NY-New York-10001").
 * @property {string} 3 - The Client ID (cID).
 * @property {string} 4 - The Session ID (sID).
 * @property {string} 5 - The Event ID (eID).
 * @property {string} 6 - The domain from the request URL.
 * @property {string} 7 - The path from the request URL.
 * @property {string} 8 - The HTTP method of the request.
 * @property {string} 9 - The `Accept` header from the request.
 * @property {string} 10 - The browser fingerprint ID (fpID).
 */

/**
 * Defines the specific structure and order of the `doubles` array for an
 * analytics data point.
 *
 * @typedef {Array<number>} SessionEventDoubles
 * @property {number} 0 - A flag (1 or 0) indicating if this was a new client.
 * @property {number} 1 - A flag (1 or 0) indicating if the fingerprint has changed.
 * @property {number} 2 - A flag (1 or 0) indicating if this was a new session.
 * @property {number} 3 - A flag (1 or 0) indicating if the session context was a
 * fallback due to a service error.
 */