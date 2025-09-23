/*
 * =============================================================================
 * FILE: src/lib/fallbackRequest.mjs
 *
 * DESCRIPTION:
 * Provides a graceful fallback mechanism for the session worker. If the
 * Durable Object fails, this module generates a default, "first visit" session
 * context to prevent the parent worker from crashing.
 * =============================================================================
 */

import {pushID} from './pushID.js';
import {createBrowserFingerprint, createStableDurableObjectKey} from './fingerprint.mjs';
import {enrichRequest} from './enrichRequest.mjs';

/**
 * Generates a realistic "first visit" fallback session context.
 *
 * @param {Request} request - The original incoming request object.
 * @param {object} env - The environment object to access config.
 * @returns {Request} An enriched request object with a temporary session.
 */
export function fallbackRequest(request, env) {
    const fallbackId = pushID.newID();
    const fallbackTime = new Date(pushID.decodeTime(fallbackId));

    const doName = createStableDurableObjectKey(request);
    const fpID = createBrowserFingerprint(request);

    const fallbackContext = {
        cID: fallbackId,
        sID: fallbackId,
        eID: fallbackId,
        clientTime: fallbackTime,
        sessionTime: fallbackTime,
        eventTime: fallbackTime,
        oldState: {},
        isNewClient: true,
        isNewSession: true,
        isNewDoID: true,
        isNewFpID: true,
        doID: doName,
        fpID,
        setCookieHeaders: [], // No cookies are set in fallback to avoid state conflicts
    };

    return enrichRequest(request, fallbackContext);
}