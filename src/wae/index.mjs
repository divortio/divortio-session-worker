/*
 * =============================================================================
 * FILE: src/wae/index.mjs
 *
 * DESCRIPTION:
 * The main service module for handling Workers Analytics Engine (WAE) events.
 * It exports a single function, `sendAnalytics`, which implements the
 * multi-dataset strategy for clients, sessions, and events.
 * =============================================================================
 */

import './schema.mjs'; // Imports the JSDoc type definitions for clarity.
import {buildGeoId} from '../lib/geo.mjs';

/**
 * Prepares and sends a structured data point to the appropriate Workers
 * Analytics Engine dataset(s). This is a "fire-and-forget" operation.
 *
 * @param {Request} request - The original incoming request object.
 * @param {object} env - The worker's environment object with analytics bindings.
 * @param {object} session - The rich session context object.
 * @returns {void}
 */
export function sendAnalytics(request, env, session) {
    // Gracefully exit if no analytics bindings are configured.
    if (!env || (!env.STATS_CLIENT && !env.STATS_SESSION && !env.STATS_EVENTS)) {
        return;
    }

    try {
        const url = new URL(request.url);

        /** @type {SessionEventBlobs} */
        const blobs = [
            request.cf?.country || 'unknown',
            request.cf?.colo || 'unknown',
            buildGeoId(request.cf) || 'unknown',
            session.cID || 'fallback',
            session.sID || 'fallback',
            session.eID || 'fallback',
            url.hostname,
            url.pathname,
            request.method,
            request.headers.get('Accept') || 'unknown',
            session.fpID || 'fallback',
        ];

        /** @type {SessionEventDoubles} */
        const doubles = [
            session.isNewClient ? 1 : 0,
            session.isNewFpID ? 1 : 0,
            session.isNewSession ? 1 : 0,
            session.cID === null || session.isFallback ? 1 : 0,
        ];

        /** @type {AnalyticsDataPoint} */
        const dataPoint = {
            indexes: [session.cID || 'fallback'],
            blobs,
            doubles,
        };

        // --- Multi-Dataset Write Logic ---

        // Always write to the main event log if it's configured.
        if (env.STATS_EVENTS) {
            env.STATS_EVENTS.writeDataPoint(dataPoint);
        }

        // If it's a new session, also write to the session log.
        if (session.isNewSession && env.STATS_SESSION) {
            env.STATS_SESSION.writeDataPoint(dataPoint);
        }

        // If it's a new client, also write to the client log.
        if (session.isNewClient && env.STATS_CLIENT) {
            env.STATS_CLIENT.writeDataPoint(dataPoint);
        }

    } catch (error) {
        console.error("Failed to send analytics data point:", error);
    }
}