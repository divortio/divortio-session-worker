/*
 * =============================================================================
 * FILE: src/sessionDO.mjs
 *
 * DESCRIPTION:
 * Defines the `SessionDO` class, a stateful service responsible for the
 * complete lifecycle of a user session. It is designed to be self-sufficient,
 * rehydrating its state from trusted cookies if it wakes up empty after
 * garbage collection.
 * =============================================================================
 */

import {DurableObject} from "cloudflare:workers";
import {sessionManager} from './lib/sessionManager.js';
import {serverStorage} from './lib/clientServerSession.js';
import {CID_COOKIE, SID_COOKIE, EID_COOKIE, FPID_COOKIE} from './lib/constants.mjs';

export class SessionDO extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.ctx = ctx;
        this.env = env;

        this.storageHelper = serverStorage({
            appPrefix: this.env.COOKIE_APP_PREFIX,
            serverPrefix: this.env.SERVER_COOKIE_PREFIX,
            clientPrefix: this.env.CLIENT_COOKIE_PREFIX,
        });

        this.manager = sessionManager();
        this.initialized = false;
    }

    async ensureInitialized() {
        if (!this.initialized) {
            try {
                await this.ctx.storage.transaction(async (txn) => {
                    await txn.exec(`CREATE TABLE IF NOT EXISTS session_state
                                        (
                                            key                    TEXT
                                                PRIMARY KEY, value TEXT
                                        )`);
                });
                this.initialized = true;
            } catch (error) {
                console.error(`SessionDO [${this.ctx.id.toString()}] failed to initialize storage:`, error);
            }
        }
    }

    async getState() {
        await this.ensureInitialized();
        try {
            const [cID, sID, eID] = await Promise.all([
                this.ctx.storage.get(CID_COOKIE),
                this.ctx.storage.get(SID_COOKIE),
                this.ctx.storage.get(EID_COOKIE)
            ]);
            return {cID, sID, eID};
        } catch (error) {
            console.error(`SessionDO [${this.ctx.id.toString()}] failed to get state:`, error);
            return {cID: null, sID: null, eID: null};
        }
    }

    async persistState(state) {
        try {
            await this.ctx.storage.put({
                [CID_COOKIE]: state.cID,
                [SID_COOKIE]: state.sID,
                [EID_COOKIE]: state.eID,
            });
        } catch (error) {
            console.error(`SessionDO [${this.ctx.id.toString()}] failed to persist state:`, error);
        }
    }

    generateCookies(newState) {
        const sessionCookieSeconds = parseInt(this.env.SESSION_COOKIE_EXPIRATION_SECONDS, 10) || 31536000;
        const cookieOptions = {
            expires: new Date(Date.now() + sessionCookieSeconds * 1000),
            domain: this.env.COOKIE_DOMAIN || undefined,
        };
        return [
            ...this.storageHelper.set(this.env.CID_COOKIE_NAME || CID_COOKIE, newState.cID, cookieOptions),
            ...this.storageHelper.set(this.env.SID_COOKIE_NAME || SID_COOKIE, newState.sID, cookieOptions),
            ...this.storageHelper.set(this.env.EID_COOKIE_NAME || EID_COOKIE, newState.eID, cookieOptions),
        ];
    }

    async processSession(request, fpID) {
        let currentState = await this.getState();

        // "Trust and Rehydrate" logic
        if (currentState.cID === null) {
            const cookieState = {
                cID: this.storageHelper.get(this.env.CID_COOKIE_NAME || CID_COOKIE, request.headers.get('Cookie')),
                sID: this.storageHelper.get(this.env.SID_COOKIE_NAME || SID_COOKIE, request.headers.get('Cookie')),
                eID: this.storageHelper.get(this.env.EID_COOKIE_NAME || EID_COOKIE, request.headers.get('Cookie')),
            };
            if (cookieState.cID) {
                const rehydrated = this.manager.rehydrate(cookieState);
                currentState = rehydrated.newState;
                await this.persistState(currentState);
            }
        }

        const {newState, oldState, changes} = this.manager.process({
            storageHandler: {get: (key) => currentState[key] || null}
        });

        await this.persistState(newState);
        const setCookieHeaders = this.generateCookies(newState);

        const newHeaders = new Headers(request.headers);
        const serverPrefix = `${this.env.COOKIE_APP_PREFIX || ''}${this.env.SERVER_COOKIE_PREFIX || '_ss_'}`;
        const cookieParts = [
            `${serverPrefix}${this.env.CID_COOKIE_NAME || CID_COOKIE}=${newState.cID}`,
            `${serverPrefix}${this.env.SID_COOKIE_NAME || SID_COOKIE}=${newState.sID}`,
            `${serverPrefix}${this.env.EID_COOKIE_NAME || EID_COOKIE}=${newState.eID}`,
            `${serverPrefix}${this.env.FPID_COOKIE_NAME || FPID_COOKIE}=${fpID}`,
        ];
        newHeaders.set('Cookie', cookieParts.join('; '));
        const enrichedRequest = new Request(request, {headers: newHeaders});

        return {
            enrichedRequest,
            ...newState,
            oldState,
            ...changes,
            setCookieHeaders,
        };
    }
}