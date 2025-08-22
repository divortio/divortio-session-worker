/*
 * =============================================================================
 * FILE: src/worker.mjs
 *
 * DESCRIPTION:
 * The main entry point for the standalone session-worker. This worker acts
 * as a resilient "smart proxy." It receives a request from a parent worker,
 * handles all the logic for creating and retrieving the correct SessionDO
 * instance for a user, provides a graceful fallback if the stateful session
 * logic fails, and manages a browser fingerprint cookie.
 *
 * @example
 * // --- How this service is used by a parent worker ---
 *
 * // 1. The parent worker simply forwards the request via a service binding.
 * const sessionResponse = await env.SESSION_SERVICE.fetch(request);
 *
 * // 2. It then extracts all the Set-Cookie headers from the response.
 * const setCookieHeaders = sessionResponse.headers.get('Set-Cookie');
 *
 * // 3. Finally, it applies these headers to its own final response.
 * finalResponse.headers.append('Set-Cookie', setCookieHeaders);
 * =============================================================================
 */

// --- Durable Object and Library Imports ---
export {SessionDO} from './sessionDO.mjs';
import {serverStorage} from './lib/clientServerSession.js';
import {createBrowserFingerprint, getLocationHint} from './fingerprint.mjs';

export default {
    /**
     * The main fetch handler for the session-worker.
     * @param {Request} request - The incoming request from the parent worker.
     * @param {object} env - The worker's environment object, containing the SESSION_DO binding.
     * @param {ExecutionContext} ctx - The execution context.
     * @returns {Promise<Response>} A response containing only the necessary Set-Cookie and debugging headers.
     */
    async fetch(request, env, ctx) {
        const storageReader = serverStorage();
        const cookieHeader = request.headers.get('Cookie');
        let doID = storageReader.get('doID', cookieHeader);
        let isNewDoID = false;

        let doId;
        if (doID) {
            // This is a returning user. Get their DO from the ID in their cookie.
            doId = env.SESSION_DO.idFromString(doID);
        } else {
            // This is a new user. Create a new DO for them.
            doId = env.SESSION_DO.newUniqueId();
            doID = doId.toString();
            isNewDoID = true;
        }

        const sessionStub = env.SESSION_DO.get(doId, {locationHint: getLocationHint(request.cf)});
        let sessionResponse;

        try {
            // --- On Success (`try`) ---
            // Call the SessionDO to perform the stateful session logic.
            sessionResponse = await sessionStub.fetch(request.clone());
        } catch (error) {
            // --- On Failure (`catch`) ---
            // If the SessionDO fails, log the error and create an empty response.
            console.error(`SessionDO failed for doID ${doID}:`, error);
            sessionResponse = new Response(null, {status: 204}); // 204 No Content
        }

        // Create a new, mutable response to add our own headers.
        const finalResponse = new Response(sessionResponse.body, sessionResponse);

        // --- Fingerprint and doID Cookie Logic (runs on success or failure) ---

        // Calculate the fingerprint for logging and the fpID cookie.
        const fingerprint = createBrowserFingerprint(request);
        const fpCookie = storageReader.set('fpID', fingerprint, {}); // Use default expiration
        fpCookie.forEach(h => finalResponse.headers.append('Set-Cookie', h));

        // If we created a new DO, set the persistent doID cookie.
        if (isNewDoID) {
            const doIDExpiry = new Date("2038-01-19T03:14:07.000Z");
            const doIDCookies = storageReader.set('doID', doID, {expires: doIDExpiry, cookieName: '_ss_doID'});
            doIDCookies.forEach(h => finalResponse.headers.append('Set-Cookie', h));
        }

        return finalResponse;
    }
}