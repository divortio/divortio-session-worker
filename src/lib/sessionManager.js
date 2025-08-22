/*
 * =============================================================================
 * FILE: src/lib/sessionManager.js
 *
 * DESCRIPTION:
 * A universal, stateless JavaScript library for robustly managing a hierarchy
 * of client, session, and event identifiers. This library contains the pure
 * business logic for session management and is designed to be storage-agnostic.
 *
 * It is intended to be used by a stateful controller, like a Cloudflare Durable
 * Object, which provides a `storageHandler` to read the previous state.
 *
 * It manages a "waterfall" of identifiers:
 * - cID (Client ID): A long-term identifier for a unique browser/client.
 * - sID (Session ID): Rotates after a configurable period of inactivity.
 * - eID (Event ID): A new ID generated for every tracked event.
 *
 * @example
 * // --- How this library is used by a server-side controller (e.g., a DO) ---
 *
 * import { sessionManager } from './sessionManager.js';
 *
 * // 1. Initialize the manager (usually in a constructor)
 * const manager = sessionManager({ sessionTimeout: 30 * 60 * 1000 });
 *
 * // 2. Create a handler to read from the DO's persistent storage
 * const storageHandler = {
 * get: async (key) => this.ctx.storage.get(key),
 * set: () => {} // The DO handles writes separately
 * };
 *
 * // 3. Process the session
 * const sessionData = manager.process({ storageHandler });
 *
 * // 4. Use the results
 * console.log(sessionData.changes.isNewSession); // true or false
 * const { cID, sID, eID } = sessionData.newState;
 * =============================================================================
 */

import {pushID} from './pushID.js';

/**
 * @typedef {object} StorageHandler
 * @property {function(string): (string|null)} get - Retrieves a value from storage by key.
 * @property {function(string, string, object): void} set - Saves a value to storage by key, with options.
 */

/**
 * @typedef {object} SessionManagerConfig
 * @property {number} [sessionTimeout=1800000] - Session inactivity timeout in ms. (Default: 30 minutes)
 * @property {number} [randomnessLength=12] - The length of the random part of generated IDs.
 * @property {boolean} [useStubs=false] - If true, adds stubs ('cID', 'sID', 'eID') to the IDs.
 */

/**
 * @typedef {object} SessionState
 * @property {string|null} cID - The Client ID.
 * @property {string|null} sID - The Session ID.
 * @property {string|null} eID - The Event ID from the previous event.
 * @property {Date|null} clientTime - The timestamp of the cID.
 * @property {Date|null} sessionTime - The timestamp of the sID.
 * @property {Date|null} eventTime - The timestamp of the eID.
 */

/**
 * @typedef {object} SessionChanges
 * @property {boolean} isNewClient - True if a new cID was generated.
 * @property {boolean} isNewSession - True if a new sID was generated.
 */

/**
 * @typedef {object} ProcessedSession
 * @property {string} cID - The current Client ID.
 * @property {string} sID - The current Session ID.
 * @property {string} eID - The newly generated Event ID.
 * @property {Date} clientTime - The timestamp of the cID.
 * @property {Date} sessionTime - The timestamp of the sID.
 * @property {Date} eventTime - The timestamp of the eID.
 * @property {SessionState} newState - An object representing the current state.
 * @property {SessionState} oldState - An object representing the state before processing.
 * @property {SessionChanges} changes - A summary of what changed during processing.
 */


/**
 * Factory function to create a new sessionManager instance.
 * @param {SessionManagerConfig} [config={}] - Configuration for the session manager.
 * @returns {{process: function(options: {storageHandler: StorageHandler}): ProcessedSession, config: SessionManagerConfig}} A session manager instance.
 */
export const sessionManager = (config = {}) => {
    const finalConfig = {
        sessionTimeout: 30 * 60 * 1000,
        randomnessLength: 12,
        useStubs: false,
        ...config,
    };

    /**
     * Processes a session event based on the state provided by the storageHandler.
     * @param {object} options - The options for processing.
     * @param {StorageHandler} options.storageHandler - A handler with a `get` method to read the previous state.
     * @returns {ProcessedSession} A comprehensive object detailing the session state.
     * @throws {Error} If a storageHandler is not provided.
     */
    const process = (options = {}) => {
        const {storageHandler} = options;
        if (!storageHandler) {
            throw new Error("A storageHandler must be provided in the options.");
        }

        // 1. Read the old state from the provided handler
        const cID = storageHandler.get('cID');
        const sID = storageHandler.get('sID');
        const prevEID = storageHandler.get('eID');

        const cIDTime = cID ? pushID.decodeTime(cID) : null;
        const sIDTime = sID ? pushID.decodeTime(sID) : null;
        const prevEIDTime = prevEID ? pushID.decodeTime(prevEID) : null;

        const oldState = {
            cID, sID, eID: prevEID,
            clientTime: cIDTime ? new Date(cIDTime) : null,
            sessionTime: sIDTime ? new Date(sIDTime) : null,
            eventTime: prevEIDTime ? new Date(prevEIDTime) : null
        };

        // 2. Check if the session has expired
        let isSessionExpired = true;
        const lastActivityTime = prevEIDTime || sIDTime || cIDTime;
        if (lastActivityTime) {
            isSessionExpired = (Date.now() - lastActivityTime) > finalConfig.sessionTimeout;
        }

        // 3. Determine if new IDs are needed
        const idOptions = {length: finalConfig.randomnessLength};
        const isNewClient = !cID;
        const isNewSession = !sID || isSessionExpired;

        // 4. Generate new IDs
        const newEIDObj = pushID.newObj({...idOptions, stub: finalConfig.useStubs ? 'eID' : null});

        const finalCID = cID || (finalConfig.useStubs ? pushID.newID({...idOptions, stub: 'cID'}) : newEIDObj.id);
        const finalSID = isNewSession ? (finalConfig.useStubs ? pushID.newID({
            ...idOptions,
            stub: 'sID'
        }) : newEIDObj.id) : sID;

        // 5. Construct the new state
        const newState = {
            cID: finalCID,
            sID: finalSID,
            eID: newEIDObj.id,
            clientTime: new Date(pushID.decodeTime(finalCID)),
            sessionTime: new Date(pushID.decodeTime(finalSID)),
            eventTime: newEIDObj.date
        };

        const changes = {isNewClient, isNewSession};

        // 6. Return the comprehensive result object
        return {...newState, newState, oldState, changes};
    };

    return {process, config: finalConfig};
};