/*
 * =============================================================================
 * FILE: src/sessionDO.mjs
 *
 * DESCRIPTION:
 * Defines the `SessionDO` class, a stateful service responsible for the
 * complete lifecycle of a user session. This version is simplified to rely on
 * the automatic table management of the SQLite-backed KV API.
 * =============================================================================
 */

import {DurableObject} from "cloudflare:workers";
import {sessionManager} from './lib/sessionManager.js';
import {cookieStorage} from './lib/cookieStorage.js';
import {enrichRequest} from './lib/enrichRequest.mjs';
import {CID_COOKIE, EID_COOKIE, SID_COOKIE} from './lib/constants.mjs';

export class SessionDO extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.ctx = ctx;
        this.env = env;
        this.inMemoryState = null;
        this.storageHelper = cookieStorage({
            appPrefix: this.env.COOKIE_APP_PREFIX,
            serverPrefix: this.env.SERVER_COOKIE_PREFIX,
            clientPrefix: this.env.CLIENT_COOKIE_PREFIX,
        });
        this.manager = sessionManager();
    }

    async alarm() {
        try {
            await this.ctx.storage.deleteAll();
            console.log(`SessionDO [${this.ctx.id.toString()}] storage deleted due to inactivity.`);
        } catch (error) {
            console.error(`SessionDO [${this.ctx.id.toString()}] failed to delete storage in alarm:`, error);
        }
    }

    async setTtlAlarm() {
        try {
            const ttlSeconds = parseInt(this.env.DO_TTL_SECONDS, 10);
            if (ttlSeconds && ttlSeconds > 0) {
                const triggerTime = Date.now() + ttlSeconds * 1000;
                await this.ctx.storage.setAlarm(triggerTime);
            }
        } catch (error) {
            console.error(`SessionDO [${this.ctx.id.toString()}] failed to set TTL alarm:`, error);
        }
    }

    async getState() {
        if (this.inMemoryState !== null) {
            return this.inMemoryState;
        }

        try {
            const storedState = await this.ctx.storage.get([CID_COOKIE, SID_COOKIE, EID_COOKIE]);
            this.inMemoryState = {
                cID: storedState.get(CID_COOKIE) || null,
                sID: storedState.get(SID_COOKIE) || null,
                eID: storedState.get(EID_COOKIE) || null,
            };
        } catch (error) {
            console.error(`SessionDO [${this.ctx.id.toString()}] failed to get state:`, error);
            this.inMemoryState = {cID: null, sID: null, eID: null};
        }

        return this.inMemoryState;
    }

    persistState(state) {
        this.inMemoryState = state;
        try {
            this.ctx.storage.put(
                {
                    [CID_COOKIE]: state.cID,
                    [SID_COOKIE]: state.sID,
                    [EID_COOKIE]: state.eID,
                },
                {allowUnconfirmed: true}
            );
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

    async processSession(request, doName, fpID, isNewDoID, isNewFpID) {
        await this.setTtlAlarm();
        let currentState = await this.getState();

        if (currentState.cID === null) {
            const cookieHeader = request.headers.get('Cookie');
            const cookieState = {
                cID: this.storageHelper.get(this.env.CID_COOKIE_NAME || CID_COOKIE, cookieHeader),
                sID: this.storageHelper.get(this.env.SID_COOKIE_NAME || SID_COOKIE, cookieHeader),
                eID: this.storageHelper.get(this.env.EID_COOKIE_NAME || EID_COOKIE, cookieHeader),
            };
            if (cookieState.cID) {
                const rehydrated = this.manager.rehydrate(cookieState);
                currentState = rehydrated.newState;
            }
        }

        const {newState, oldState, changes} = this.manager.process({
            storageHandler: {get: (key) => currentState[key] || null}
        });

        this.persistState(newState);
        const setCookieHeaders = this.generateCookies(newState);

        const sessionContext = {
            ...newState,
            oldState,
            ...changes,
            doID: doName,
            fpID,
            isNewDoID,
            isNewFpID,
            setCookieHeaders,
        };

        return enrichRequest(request, sessionContext);
    }
}