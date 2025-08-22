/*
 * =============================================================================
 * FILE: src/sessionDO.mjs
 *
 * DESCRIPTION:
 * Defines the `SessionDO` class, a stateful service responsible for the
 * complete lifecycle of a user session. It exposes a rich, expressive public
 * API for granular control and easy debugging, which can be called via RPC
 * from a parent worker.
 *
 * It is designed to be called via RPC from any parent worker.
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
            // Using a transaction for the initial setup.
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
        const cIDExpiry = new Date("2038-01-19T03:14:07.000Z");
        const sessionExpiry = new Date(Date.now() + this.manager.config.sessionTimeout);

        return [
            ...this.storageHelper.set('cID', newState.cID, {expires: cIDExpiry}),
            ...this.storageHelper.set('sID', newState.sID, {expires: sessionExpiry}),
            ...this.storageHelper.set('eID', newState.eID, {expires: sessionExpiry}),
        ];
    }

    // --- High-Level "All-in-One" Public Methods ---

    /**
     * Runs the entire session lifecycle and returns the complete context.
     * This is the primary UTILITY method for advanced use cases.
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
     * The ultimate CONVENIENCE method. Processes the session and returns a
     * fully-formed Response object with the session data in the body and
     * cookies in the headers.
     * @param {Request} request - The original incoming request.
     * @returns {Promise<Response>}
     */
    async processRequest(request) {
        try {
            const {newState, setCookieHeaders} = await this.getSessionContext();

            const response = new Response(JSON.stringify(newState), {
                headers: {'Content-Type': 'application/json'},
            });

            setCookieHeaders.forEach((header) => {
                response.headers.append('Set-Cookie', header);
            });

            return response;
        } catch (error) {
            console.error("Error in SessionDO.processRequest:", error);
            // On failure, return an error response to the calling worker.
            return new Response(JSON.stringify({error: "Session processing failed"}), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }
    }

    /**
     * A fetch handler for direct interaction, testing, or diagnostics.
     * It directly calls the primary convenience method, ensuring consistent behavior.
     * @param {Request} request - The incoming HTTP request.
     * @returns {Promise<Response>}
     */
    async fetch(request) {
        return this.processRequest(request);
    }
}