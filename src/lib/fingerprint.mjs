/*
 * =============================================================================
 * FILE: src/lib/fingerprint.mjs
 *
 * DESCRIPTION:
 * A utility module for creating high-entropy, stable browser fingerprints
 * from various request properties.
 * =============================================================================
 */

import {hashIsh} from './hashIsh.js';

const HASH_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';

/**
 * Gathers common, high-entropy data points from the request.
 * @param {Request} request - The original incoming request object.
 * @returns {object} An object with raw fingerprint data.
 */
export function getRawFingerprintData(request) {
    return {
        ip: request.headers.get('cf-connecting-ip') || '',
        userAgent: request.headers.get('user-agent') || '',
        acceptLang: request.headers.get('accept-language') || '',
        acceptEnc: request.headers.get('accept-encoding') || '',
        tlsCipher: request.cf?.tlsCipher || '',
        httpProtocol: request.cf?.httpProtocol || '',
        colo: request.cf?.colo || ''
    };
}

/**
 * Creates a stable, high-entropy browser fingerprint (fpID).
 * @param {object} rawData - The raw data object from getRawFingerprintData.
 * @returns {string} A 16-character hash representing the browser fingerprint.
 */
export function createBrowserFingerprint(rawData) {
    return hashIsh(rawData, 16, HASH_CHARS);
}

/**
 * Creates a deterministic, stable key for locating a Durable Object.
 * @param {object} rawData - The raw data object from getRawFingerprintData.
 * @returns {string} A 16-character hash suitable for a DO name.
 */
export function createStableDurableObjectKey(rawData) {
    // Create a new object without the 'colo' property for stability.
    const {colo, ...stableData} = rawData;
    return hashIsh(stableData, 16, HASH_CHARS);
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