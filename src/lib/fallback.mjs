/*
 * =============================================================================
 * FILE: src/lib/fallback.mjs
 *
 * DESCRIPTION:
 * Provides a graceful fallback mechanism for the session worker. If the
 * Durable Object fails, this module generates a default, "first visit" session
 * context to prevent the parent worker from crashing.
 * =============================================================================
 */

import {pushID} from './pushID.js';
import {serverStorage} from './clientServerSession.js';
import {createBrowserFingerprint, createStableDurableObjectKey} from '../fingerprint.mjs';
import {CID_COOKIE, SID_COOKIE, EID_COOKIE, FPID_COOKIE} from './constants.mjs';

/**
 * Generates a realistic "first visit" fallback session context.
 *
 * @param {Request} request - The original incoming request object.
 * @param {object} env - The environment object to access config.
 * @returns {object} A complete session context object with temporary identifiers.
 */
export function createFallbackContext(request, env) {
    const fallbackId = pushID.newID();
    const fallbackTime = new Date(pushID.decodeTime(fallbackId));

    const sessionData = {
        cID: fallbackId,
        sID: fallbackId,
        eID: fallbackId,
        clientTime: fallbackTime,
        sessionTime: fallbackTime,
        eventTime: fallbackTime,
    };

    const storage = serverStorage({
        appPrefix: env.COOKIE_APP_PREFIX,
        serverPrefix: env.SERVER_COOKIE_PREFIX,
        clientPrefix: env.CLIENT_COOKIE_PREFIX,
    });

    const doID = createStableDurableObjectKey(request);
    const fpID = createBrowserFingerprint(request);

    // Create the enriched request for downstream services
    const newHeaders = new Headers(request.headers);
    const cookieParts = [
        `${storage.config.appPrefix}${storage.config.serverPrefix}${doID}`,
        `${storage.config.appPrefix}${storage.config.serverPrefix}${FPID_COOKIE}=${fpID}`,
        `${storage.config.appPrefix}${storage.config.serverPrefix}${CID_COOKIE}=${sessionData.cID}`,
        `${storage.config.appPrefix}${storage.config.serverPrefix}${SID_COOKIE}=${sessionData.sID}`,
        `${storage.config.appPrefix}${storage.config.serverPrefix}${EID_COOKIE}=${sessionData.eID}`,
    ];
    newHeaders.set('Cookie', cookieParts.join('; '));
    const enrichedRequest = new Request(request, {headers: newHeaders});

    return {
        enrichedRequest,
        ...sessionData,
        oldState: {},
        isNewClient: true,
        isNewSession: true,
        isNewDoID: true,
        isNewFpID: true,
        doID,
        fpID,
        setCookieHeaders: [], // No cookies are set in fallback to avoid state conflicts
    };
}