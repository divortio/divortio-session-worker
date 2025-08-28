/*
 * =============================================================================
 * FILE: src/lib/sessionManager.js
 *
 * DESCRIPTION:
 * A universal, stateless JavaScript library for robustly managing a hierarchy
 * of client, session, and event identifiers.
 * =============================================================================
 */

import {pushID} from './pushID.js';

/**
 * Factory function to create a new sessionManager instance.
 * @param {object} [config={}] - Configuration for the session manager.
 * @returns {object} A session manager instance.
 */
export const sessionManager = (config = {}) => {
    const finalConfig = {
        sessionTimeout: 30 * 60 * 1000,
        randomnessLength: 12,
        ...config,
    };

    const process = (options = {}) => {
        const {storageHandler} = options;
        if (!storageHandler) throw new Error("A storageHandler must be provided.");

        const cID = storageHandler.get('cID');
        const sID = storageHandler.get('sID');
        const prevEID = storageHandler.get('eID');

        const oldState = {
            cID, sID, eID: prevEID,
            clientTime: cID ? new Date(pushID.decodeTime(cID)) : null,
            sessionTime: sID ? new Date(pushID.decodeTime(sID)) : null,
            eventTime: prevEID ? new Date(pushID.decodeTime(prevEID)) : null,
        };

        const lastActivityTime = prevEID ? pushID.decodeTime(prevEID) : (sID ? pushID.decodeTime(sID) : (cID ? pushID.decodeTime(cID) : null));
        const isSessionExpired = lastActivityTime ? (Date.now() - lastActivityTime) > finalConfig.sessionTimeout : true;

        const isNewClient = !cID;
        const isNewSession = !sID || isSessionExpired;

        const newEIDObj = pushID.newObj({length: finalConfig.randomnessLength});
        const finalCID = cID || newEIDObj.id;
        const finalSID = isNewSession ? newEIDObj.id : sID;

        const newState = {
            cID: finalCID,
            sID: finalSID,
            eID: newEIDObj.id,
            clientTime: new Date(pushID.decodeTime(finalCID)),
            sessionTime: new Date(pushID.decodeTime(finalSID)),
            eventTime: newEIDObj.date,
        };

        return {newState, oldState, changes: {isNewClient, isNewSession}};
    };

    const rehydrate = (cookieState) => {
        const {cID, sID, eID} = cookieState;

        const newStateFromCookies = {
            cID, sID, eID,
            clientTime: cID ? new Date(pushID.decodeTime(cID)) : null,
            sessionTime: sID ? new Date(pushID.decodeTime(sID)) : null,
            eventTime: eID ? new Date(pushID.decodeTime(eID)) : null,
        };

        return process({storageHandler: {get: (key) => newStateFromCookies[key] || null}});
    };

    return {process, rehydrate, config: finalConfig};
};