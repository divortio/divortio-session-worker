/*
 * =============================================================================
 * FILE: src/worker.mjs
 *
 * DESCRIPTION:
 * The main entry point for the session-worker. This worker acts as a stateless
 * "smart router" and RPC service, implementing a "Hybrid Naming" pattern to
 * locate the correct Durable Object instance and sending a detailed analytics
 * event on every request.
 * =============================================================================
 */

import {WorkerEntrypoint} from "cloudflare:workers";

export {SessionDO} from './sessionDO.mjs';
import {serverStorage} from './lib/clientServerSession.js';
import {createFallbackRequest} from './lib/fallback.mjs';
import {sendAnalytics} from './wae/index.mjs';
import {enrichRequest} from './lib/enrichRequest.mjs';
import {CID_COOKIE, FPID_COOKIE} from './lib/constants.mjs';
import {
    createBrowserFingerprint,
    createStableDurableObjectKey,
    getLocationHint
} from './fingerprint.mjs';

export default class extends WorkerEntrypoint {
    async processSession(request, env) {
        let enrichedRequest;
        try {
            const storageReader = serverStorage({
                appPrefix: env.COOKIE_APP_PREFIX,
                serverPrefix: env.SERVER_COOKIE_PREFIX,
                clientPrefix: env.CLIENT_COOKIE_PREFIX,
            });
            const cookieHeader = request.headers.get('Cookie');
            const existingCID = storageReader.get(env.CID_COOKIE_NAME || CID_COOKIE, cookieHeader);

            let doName;
            let isNewDoID = false;
            if (existingCID) {
                doName = existingCID;
            } else {
                doName = createStableDurableObjectKey(request);
                isNewDoID = true;
            }

            const sessionStub = env.SESSION_DO.getByName(doName, {
                locationHint: getLocationHint(request.cf)
            });

            const fpID = createBrowserFingerprint(request);
            const existingFpID = storageReader.get(env.FPID_COOKIE_NAME || FPID_COOKIE, cookieHeader);
            const isNewFpID = !existingFpID || existingFpID !== fpID;

            enrichedRequest = await sessionStub.processSession(request.clone(), doName, fpID, isNewDoID, isNewFpID);

            if (isNewFpID) {
                const fpIdSeconds = parseInt(env.FP_ID_EXPIRATION_SECONDS, 10) || 31536000;
                const fpCookieOptions = {
                    expires: new Date(Date.now() + fpIdSeconds * 1000),
                    domain: env.COOKIE_DOMAIN || undefined,
                };
                const fpCookie = storageReader.set(env.FPID_COOKIE_NAME || FPID_COOKIE, fpID, fpCookieOptions);
                enrichedRequest.session.setCookieHeaders.push(...fpCookie);
            }

        } catch (error) {
            console.error("Critical error in session worker processSession:", {
                message: error.message,
                stack: error.stack,
            });
            enrichedRequest = createFallbackRequest(request, env);
        }

        // Send analytics with the new, flattened parameter structure.
        sendAnalytics(request, env, enrichedRequest.session);

        return enrichedRequest;
    }

    async fetch(request) {
        return new Response("Divortio Session Worker is operational via RPC.", {
            headers: {'Content-Type': 'text/plain'}
        });
    }
}