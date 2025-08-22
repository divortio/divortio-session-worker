/*
 * =============================================================================
 * FILE: src/fingerprint.mjs
 *
 * DESCRIPTION:
 * A utility module for creating a high-entropy, stable browser fingerprint
 * from various request properties. This is used as a probabilistic
 * identifier to track user activity when cookies are not available or have
 * been blocked by the client. This version uses the robust `hashIsh.js`
 * library to generate the hash, ensuring a higher degree of uniqueness.
 *
 * @example
 * // --- How this module is used by the main handler (handler.mjs) ---
 *
 * import { createBrowserFingerprint } from './fingerprint.mjs';
 *
 * export default {
 * async fetch(request, env, ctx) {
 * // Check for an existing fingerprint cookie
 * let fingerprint = storageReader.get('fpID', request.headers.get('Cookie'));
 *
 * // If the cookie is not present, generate a new fingerprint
 * if (!fingerprint) {
 * fingerprint = createBrowserFingerprint(request);
 * }
 *
 * // The fingerprint can now be used for logging or routing
 * console.log(`Request fingerprint: ${fingerprint}`);
 * }
 * }
 * =============================================================================
 */

// Import the hashing utility from our existing session management library
import {hashIsh} from './lib/hashIsh.js';

// Use the same character set as our pushID library for consistency
const HASH_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';

/**
 * Creates a stable, high-entropy browser fingerprint from various request properties.
 *
 * @param {Request} request - The original incoming request object from which to derive the fingerprint.
 * @returns {string} A 16-character, stable hash representing the browser fingerprint.
 * @example
 * const request = new Request("https://example.com", {
 * headers: {
 * 'cf-connecting-ip': '198.51.100.1',
 * 'user-agent': 'Mozilla/5.0 (...) AppleWebKit/537.36 (...)',
 * 'accept-language': 'en-US,en;q=0.9',
 * 'accept-encoding': 'gzip, deflate, br'
 * },
 * cf: {
 * tlsCipher: 'AEAD-AES128-GCM-SHA256',
 * httpProtocol: 'HTTP/2',
 * colo: 'EWR'
 * }
 * });
 *
 * const fingerprint = createBrowserFingerprint(request);
 * // -> fingerprint will be a 16-character hash like "aBcDeFgHiJkLmNoP"
 */
export function createBrowserFingerprint(request) {
    // Gather as many high-entropy data points as possible from the request.
    const ip = request.headers.get('cf-connecting-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';
    const acceptLang = request.headers.get('accept-language') || '';
    const acceptEnc = request.headers.get('accept-encoding') || '';

    // Use TLS cipher, HTTP protocol, and colo from the Cloudflare-specific object.
    const tlsCipher = request.cf?.tlsCipher || '';
    const httpProtocol = request.cf?.httpProtocol || '';
    const colo = request.cf?.colo || ''; // User's closest data center

    // Combine all data points into a single object for stable serialization by hashIsh.
    const rawFingerprintData = {
        ip, userAgent, acceptLang, acceptEnc, tlsCipher, httpProtocol, colo
    };

    // Use the robust hashIsh function to generate a 16-character hash.
    // This provides significantly more entropy than a simple base36 hash.
    return hashIsh(rawFingerprintData, 16, HASH_CHARS);
}

/**
 * Maps a request's geographic data to a supported Durable Object location hint.
 * @param {object | undefined} cf - The `cf` object from the incoming request.
 * @returns {string | undefined} A valid locationHint string or undefined.
 */
export function getLocationHint(cf) {
    if (!cf) return undefined;
    const continentMap = {'EU': 'weur', 'AS': 'apac', 'OC': 'oc', 'AF': 'afr', 'SA': 'sam'};
    const hint = continentMap[cf.continent];
    if (hint) return hint;
    if (cf.continent === 'NA') {
        return (cf.longitude && parseFloat(cf.longitude) < -98.5) ? 'wnam' : 'enam';
    }
    return undefined;
}
