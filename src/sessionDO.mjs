/*
 * =============================================================================
 * FILE: src/sessionDO.mjs
 *
 * DESCRIPTION:
 * Defines the `SessionDO` class, a stateful service responsible for the
 * complete lifecycle of a user session. It exposes a rich, expressive public
 * API for granular control and easy debugging, which can be called via RPC
 * from a parent worker.
 * =============================================================================
 */

import {DurableObject} from "cloudflare:workers";
import {sessionManager} from './lib/sessionManager.js';
import {serverStorage} from './lib/clientServerSession.js';

export class SessionDO extends DurableObject {
    /**
     * @param {DurableObjectState} ctx - The state object providing access to storage.
     * @param {object} env - The environment object containing bindings.
     */
    constructor(ctx, env) {
        super(ctx, env);
        this.ctx = ctx;
        this.env = env;
        this.storageHelper = serverStorage();
        this.manager = sessionManager({
            sessionTimeout: parseInt(this.env.SESSION_TIMEOUT_MS, 10) || 1800000,
            useStubs: false,
        });
        this.initialized = false;
    }

    /**
     * Ensures the database table is created before any operations.
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.ctx.storage.transaction(async (txn) => {
                await txn.exec(`
                    CREATE TABLE IF NOT EXISTS session_state
                        (
                            key                    TEXT
                                PRIMARY KEY, value TEXT
                        )
                `);
            });
            this.initialized = true;
        }
    }

    // --- Granular Public API Methods ---

    /**
     * Retrieves the raw, currently persisted session state from storage.
     * @returns {Promise<{cID: string|null, sID: string|null, eID: string|null}>}
     */
    async getState() {
        await this.ensureInitialized();
        const [cID, sID, eID] = await Promise.all([
            this.ctx.storage.get('cID'),
            this.ctx.storage.get('sID'),
            this.ctx.storage.get('eID')
        ]);
        return {cID, sID, eID};
    }

    /**
     * A pure, stateless method that applies session logic to a given state.
     * @param {{cID: string|null, sID: string|null, eID: string|null}} currentState - The state to process.
     * @returns {object} The processing result: { newState, oldState, changes }.
     */
    processState(currentState) {
        const inMemoryStorageHandler = {
            get: (key) => currentState[key] || null,
            set: () => {
            },
        };
        return this.manager.process({storageHandler: inMemoryStorageHandler});
    }

    /**
     * Writes the new session state to durable storage.
     * @param {object} newState - The new session state to persist.
     * @returns {Promise<void>}
     */
    async persistState(newState) {
        await this.ctx.storage.put({
            cID: newState.cID,
            sID: newState.sID,
            eID: newState.eID,
        });
    }

    /**
     * Generates the `Set-Cookie` header strings for a given session state.
     * @param {object} newState - The session state to generate cookies for.
     * @returns {string[]} An array of `Set-Cookie` header strings.
     */
    generateCookies(newState) {
        const sessionCookieSeconds = parseInt(this.env.SESSION_COOKIE_EXPIRATION_SECONDS, 10) || 31536000;
        const persistentExpiry = new Date(Date.now() + sessionCookieSeconds * 1000);
        const cookieOptions = {expires: persistentExpiry};

        return [
            ...this.storageHelper.set('cID', newState.cID, cookieOptions),
            ...this.storageHelper.set('sID', newState.sID, cookieOptions),
            ...this.storageHelper.set('eID', newState.eID, cookieOptions),
        ];
    }

    // --- High-Level "All-in-One" Public Methods ---

    /**
     * Runs the entire session lifecycle and returns the complete context.
     * @returns {Promise<{newState: object, oldState: object, changes: object, setCookieHeaders: string[]}>}
     */
    async getSessionContext() {
        const currentState = await this.getState();
        const {newState, oldState, changes} = this.processState(currentState);
        await this.persistState(newState);
        const setCookieHeaders = this.generateCookies(newState);
        return {newState, oldState, changes, setCookieHeaders};
    }

    /**
     * The primary RPC method. Processes the session, enriches the incoming
     * request, and returns the core session context.
     * @param {Request} request - The original incoming request from the parent worker.
     * @param {string} doID - The Durable Object ID for this user.
     * @param {string} fpID - The browser fingerprint ID for this user.
     * @returns {Promise<object>} The core context for the RPC call.
     */
    async processSession(request, doID, fpID) {
        const {newState, oldState, changes, setCookieHeaders} = await this.getSessionContext();

        const newHeaders = new Headers(request.headers);

        // Build the complete Cookie header for the enriched request
        const cookieParts = [];
        if (doID) cookieParts.push(`_ss_doID=${doID}`);
        if (fpID) cookieParts.push(`_ss_fpID=${fpID}`);
        if (newState.cID) cookieParts.push(`_ss_cID=${newState.cID}`);
        if (newState.sID) cookieParts.push(`_ss_sID=${newState.sID}`);
        if (newState.eID) cookieParts.push(`_ss_eID=${newState.eID}`);

        if (cookieParts.length > 0) {
            newHeaders.set('Cookie', cookieParts.join('; '));
        }
        const enrichedRequest = new Request(request, {headers: newHeaders});

        return {
            enrichedRequest,
            ...newState, // Flatten sessionData (cID, sID, eID, etc.)
            oldState,
            ...changes, // Flatten changes (isNewClient, isNewSession)
            setCookieHeaders
        };
    }
}