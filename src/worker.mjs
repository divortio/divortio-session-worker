/*
 * =============================================================================
 * FILE: src/worker.mjs
 *
 * DESCRIPTION:
 * The main entry point for the standalone session-worker. This worker acts
 * as an RPC service. It receives an RPC call from a parent worker,
 * identifies or creates the correct SessionDO instance, and delegates
 * the request processing to the DO's `processSession` RPC method.
 * =============================================================================
 */

import {WorkerEntrypoint} from "cloudflare:workers";

export {SessionDO} from './sessionDO.mjs';
import {serverStorage} from './lib/clientServerSession.js';
import {createBrowserFingerprint, getLocationHint} from './fingerprint.mjs';

/**
 * This class is the main entrypoint for the session worker and exposes
 * the RPC methods that parent workers can call.
 */
export default class extends WorkerEntrypoint {
    /**
     * The primary RPC entry point for processing a user session.
     * @param {Request} request - The original request from the parent worker.
     * @param {object} env - The environment object with bindings.
     * @returns {Promise<object>} The full session context from the SessionDO.
     */
    async processSession(request, env) {
        const storageReader = serverStorage();
        const cookieHeader = request.headers.get('Cookie');

        // --- Determine doID and fpID status ---
        const existingDoID = storageReader.get('doID', cookieHeader);
        const existingFpID = storageReader.get('fpID', cookieHeader);

        let doID = existingDoID;
        let isNewDoID = false;
        if (!doID) {
            doID = env.SESSION_DO.newUniqueId().toString();
            isNewDoID = true;
        }

        const fpID = createBrowserFingerprint(request);
        const isNewFpID = !existingFpID || existingFpID !== fpID;

        // --- Get the DO Stub ---
        const doIdFromString = env.SESSION_DO.idFromString(doID);
        const sessionStub = env.SESSION_DO.get(doIdFromString, {locationHint: getLocationHint(request.cf)});

        // 1. Delegate the primary session logic to the DO, passing down doID and fpID.
        const sessionContext = await sessionStub.processSession(request.clone(), doID, fpID);

        // 2. Append fpID cookie to the list if it's new.
        if (isNewFpID) {
            const fpIdSeconds = parseInt(env.FP_ID_EXPIRATION_SECONDS, 10) || 31536000;
            const fpCookieOptions = {expires: new Date(Date.now() + fpIdSeconds * 1000)};
            const fpCookie = storageReader.set('fpID', fpID, fpCookieOptions);
            sessionContext.setCookieHeaders.push(...fpCookie);
        }

        // 3. Append the doID cookie if it's new.
        if (isNewDoID) {
            const doIdSeconds = parseInt(env.DO_ID_EXPIRATION_SECONDS, 10) || 31536000;
            const doIDCookieOptions = {expires: new Date(Date.now() + doIdSeconds * 1000)};
            const doIDCookies = storageReader.set('doID', doID, doIDCookieOptions);
            sessionContext.setCookieHeaders.push(...doIDCookies);
        }

        // 4. Enrich the final context with worker-level data before returning.
        return {
            ...sessionContext,
            doID,
            fpID,
            isNewDoID,
            isNewFpID,
        };
    }

    /**
     * A standard fetch handler for health checks or direct HTTP access.
     */
    async fetch(request, env, ctx) {
        return new Response("Divortio Session Worker is operational via RPC.", {
            headers: {'Content-Type': 'text/plain'}
        });
    }
}