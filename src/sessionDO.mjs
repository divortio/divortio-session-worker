/*
 * =============================================================================
 * FILE: src/sessionDO.mjs
 *
 * DESCRIPTION:
 * Defines the `SessionDO` class for the standalone session-worker. This
 * Durable Object is a stateful, self-contained service responsible for
 * managing the complete lifecycle of a user session (cID, sID, eID).
 *
 * It persists the session state in its own private SQLite storage, ensuring
 * that a user's session is durable and consistent across requests. It is
 * designed to be called via RPC from any parent worker.
 *
 * @example
 * // --- How this DO is used by a parent worker (e.g., WAFu) ---
 *
 * // 1. The parent worker gets the stub for a user's SessionDO
 * const doId = env.SESSION_SERVICE.idFromString(doID_from_cookie);
 * const sessionStub = env.SESSION_SERVICE.get(doId);
 *
 * // 2. It calls the `process` RPC method
 * const { sessionData, setCookieHeaders } = await sessionStub.process({
 * // No cookieHeader is needed, as this DO manages its own state
 * config: {
 * sessionTimeout: env.SESSION_TIMEOUT_MS,
 * // `useStubs` is now false by default
 * }
 * });
 *
 * // 3. The parent worker uses the returned session data and cookies.
 * // -> sessionData: { newState: { cID, sID, eID }, ... }
 * // -> setCookieHeaders: ["__ss_cID=...", "__cs_cID=..."]
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
        this.storageHelper = serverStorage(); // For generating cookie strings
        this.initialized = false;
    }

    /**
     * Ensures the database table is created before any operations.
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.ctx.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS session_state
                    (
                        key                    TEXT
                            PRIMARY KEY, value TEXT
                    )
            `);
            this.initialized = true;
        }
    }

    /**
     * The primary RPC method. It reads the session state from its own persistent
     * storage, processes it, saves the new state, and returns the results.
     * @param {object} options - The options for processing.
     * @param {object} options.config - Configuration passed from the parent worker.
     * @param {string} options.config.sessionTimeout - The session timeout in milliseconds.
     * @returns {Promise<{sessionData: object, setCookieHeaders: string[]}>} An object containing the new session data and the `Set-Cookie` headers.
     */
    async process({config}) {
        await this.ensureInitialized();

        // Initialize the sessionManager, ensuring stubs are disabled.
        const manager = sessionManager({
            sessionTimeout: parseInt(config.sessionTimeout, 10) || 1800000, // 30 min default
            useStubs: false, // Per your requirement
        });

        // This storage handler interacts with this DO's own private, persistent storage.
        const persistentStorageHandler = {
            get: (key) => this.ctx.storage.get(key),
            set: (key, value) => this.ctx.storage.put(key, value),
        };

        // Load the current state from durable storage to pass to the pure sessionManager function.
        const [cID, sID, eID] = await Promise.all([
            persistentStorageHandler.get('cID'),
            persistentStorageHandler.get('sID'),
            persistentStorageHandler.get('eID')
        ]);

        const inMemoryStorageHandler = {
            get: (key) => {
                if (key === 'cID') return cID;
                if (key === 'sID') return sID;
                if (key === 'eID') return eID;
                return null;
            },
            set: () => {
            }, // The pure library doesn't need to set.
        };

        // Run the pure session logic.
        const sessionData = manager.process({storageHandler: inMemoryStorageHandler});

        // Persist the new state back to this object's durable storage.
        const {newState} = sessionData;
        await Promise.all([
            persistentStorageHandler.set('cID', newState.cID),
            persistentStorageHandler.set('sID', newState.sID),
            persistentStorageHandler.set('eID', newState.eID)
        ]);

        // Generate the `Set-Cookie` headers to be sent back to the parent worker.
        const cIDExpiry = new Date("2038-01-19T03:14:07.000Z");
        const sessionExpiry = new Date(Date.now() + manager.config.sessionTimeout);

        const setCookieHeaders = [
            ...this.storageHelper.set('cID', newState.cID, {expires: cIDExpiry}),
            ...this.storageHelper.set('sID', newState.sID, {expires: sessionExpiry}),
            ...this.storageHelper.set('eID', newState.eID, {expires: sessionExpiry}),
        ];

        return {sessionData, setCookieHeaders};
    }

    /**
     * A simple fetch handler for direct interaction or testing.
     * @param {Request} request - The incoming HTTP request.
     * @returns {Promise<Response>}
     */
    async fetch(request) {
        const {sessionData, setCookieHeaders} = await this.process({
            config: {
                sessionTimeout: this.env.SESSION_TIMEOUT_MS, // Assumes env vars are set for testing
            }
        });

        const response = new Response(JSON.stringify(sessionData, null, 2), {
            headers: {'Content-Type': 'application/json'},
        });

        setCookieHeaders.forEach((header) => {
            response.headers.append('Set-Cookie', header);
        });

        return response;
    }
}