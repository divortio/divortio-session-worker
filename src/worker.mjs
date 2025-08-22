/*
 * =============================================================================
 * FILE: src/worker.mjs
 *
 * DESCRIPTION:
 * The main entry point for the standalone session-worker. This worker acts
 * as a lean "smart proxy." It receives a request from a parent worker,
 * identifies or creates the correct SessionDO instance for a user, and
 * delegates the entire request processing to the DO's `processRequest` RPC
 * method.
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
     * @returns {Promise<Response>} A response from the SessionDO, containing session data and Set-Cookie headers.
     */
    async fetch(request, env, ctx) {
        const storageReader = serverStorage();
        const cookieHeader = request.headers.get('Cookie');
        let doID = storageReader.get('doID', cookieHeader);
        let isNewDoID = false;

        let doId;
        if (doID) {
            // A returning user. Get their DO from the ID in their cookie.
            doId = env.SESSION_DO.idFromString(doID);
        } else {
            // A new user. Create a new DO for them.
            doId = env.SESSION_DO.newUniqueId();
            doID = doId.toString();
            isNewDoID = true;
        }

        // Get the stub for the SessionDO.
        const sessionStub = env.SESSION_DO.get(doId, {locationHint: getLocationHint(request.cf)});

        // --- Main Logic: Delegate to the DO's RPC method ---
        // This single call asks the DO to handle the entire session lifecycle
        // and return a fully-formed Response.
        const sessionResponse = await sessionStub.processRequest(request.clone());

        // Create a mutable response to add our own headers for fingerprinting and the doID.
        const finalResponse = new Response(sessionResponse.body, sessionResponse);

        // --- Fingerprint and doID Cookie Logic ---
        const fingerprint = createBrowserFingerprint(request);
        const fpCookie = storageReader.set('fpID', fingerprint, {});
        fpCookie.forEach(h => finalResponse.headers.append('Set-Cookie', h));

        // If we created a new DO, set the persistent doID cookie.
        if (isNewDoID) {
            const doIDExpiry = new Date("2038-01-19T03:14:07.000Z");
            const doIDCookies = storageReader.set('doID', doID, {expires: doIDExpiry});
            doIDCookies.forEach(h => finalResponse.headers.append('Set-Cookie', h));
        }

        return finalResponse;
    }
}