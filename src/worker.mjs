/*
 * =============================================================================
 * FILE: src/worker.mjs
 *
 * DESCRIPTION:
 * The main entry point for the session-worker. This worker acts as a stateless
 * "smart router" and RPC service, implementing a "Hybrid Naming" pattern to
 * locate the correct Durable Object instance for a given request.
 * =============================================================================
 */

import {WorkerEntrypoint} from "cloudflare:workers";

export {SessionDO} from './sessionDO.mjs';
import {serverStorage} from './lib/clientServerSession.js';
import {createFallbackContext} from './lib/fallback.mjs';
import {CID_COOKIE, FPID_COOKIE, STABLE_KEY_LENGTH} from './lib/constants.mjs';
import {
    createBrowserFingerprint,
    createStableDurableObjectKey,
    getLocationHint
} from './fingerprint.mjs';

export default class extends WorkerEntrypoint {
    async processSession(request, env) {
        try {
            const storageReader = serverStorage({
                appPrefix: env.COOKIE_APP_PREFIX,
                serverPrefix: env.SERVER_COOKIE_PREFIX,
                clientPrefix: env.CLIENT_COOKIE_PREFIX,
            });
            const cookieHeader = request.headers.get('Cookie');
            const existingCID = storageReader.get(env.CID_COOKIE_NAME || CID_COOKIE, cookieHeader);

            let doName;
            if (existingCID) {
                doName = existingCID;
            } else {
                doName = createStableDurableObjectKey(request);
            }

            const sessionStub = env.SESSION_DO.getByName(doName, {
                locationHint: getLocationHint(request.cf)
            });

            const fpID = createBrowserFingerprint(request);
            const sessionContext = await sessionStub.processSession(request.clone(), fpID);

            const existingFpID = storageReader.get(env.FPID_COOKIE_NAME || FPID_COOKIE, cookieHeader);
            const isNewFpID = !existingFpID || existingFpID !== fpID;
            if (isNewFpID) {
                const fpIdSeconds = parseInt(env.FP_ID_EXPIRATION_SECONDS, 10) || 31536000;
                const fpCookieOptions = {
                    expires: new Date(Date.now() + fpIdSeconds * 1000),
                    domain: env.COOKIE_DOMAIN || undefined,
                };
                const fpCookie = storageReader.set(env.FPID_COOKIE_NAME || FPID_COOKIE, fpID, fpCookieOptions);
                sessionContext.setCookieHeaders.push(...fpCookie);
            }

            const isNewDoID = doName.length === STABLE_KEY_LENGTH;

            return {
                ...sessionContext,
                doID: doName,
                fpID,
                isNewDoID,
                isNewFpID,
            };
        } catch (error) {
            console.error("Critical error in session worker processSession:", {
                message: error.message,
                stack: error.stack,
            });
            return createFallbackContext(request, env);
        }
    }

    async fetch(request) {
        return new Response("Divortio Session Worker is operational via RPC.", {
            headers: {'Content-Type': 'text/plain'}
        });
    }
}