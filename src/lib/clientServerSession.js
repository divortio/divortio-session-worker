/*
 * =============================================================================
 * FILE: src/lib/clientServerSession.js
 *
 * DESCRIPTION:
 * A server-side storage helper for session management in stateless environments
 * like Cloudflare Workers. It provides pure functions to parse incoming 'Cookie'
 * headers and generate outgoing 'Set-Cookie' headers.
 * =============================================================================
 */

/**
 * @typedef {object} ServerStorageConfig
 * @property {string} [appPrefix=''] - An optional, application-specific prefix.
 * @property {string} [serverPrefix='_ss_'] - Prefix for HttpOnly server-side cookies.
 * @property {string} [clientPrefix='_cs_'] - Prefix for client-accessible cookies.
 * @property {object} [cookieOptions] - Default options for setting cookies.
 */

/**
 * Factory that creates a server-side storage handler.
 * @param {ServerStorageConfig} [config={}] - Configuration for the handler.
 * @returns {{
 * get: (key: string, cookieHeader?: string | null) => string | null,
 * set: (key: string, value: string, options?: object) => string[],
 * }} A storage handler object.
 */
export const serverStorage = (config = {}) => {
    const finalConfig = {
        appPrefix: '',
        serverPrefix: '_ss_',
        clientPrefix: '_cs_',
        cookieOptions: {
            path: '/',
            secure: true,
            sameSite: 'Strict',
        },
        ...config,
    };

    /** @private */
    const getFullName = (prefix, key) => {
        const parts = [];
        if (finalConfig.appPrefix) parts.push(finalConfig.appPrefix);
        parts.push(prefix);
        parts.push(key);
        return parts.join('');
    };

    const get = (key, cookieHeader = '') => {
        if (!cookieHeader) return null;
        const serverKey = getFullName(finalConfig.serverPrefix, key);
        const clientKey = getFullName(finalConfig.clientPrefix, key);
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const parts = cookie.trim().split('=');
            if (parts.length >= 2) acc[parts[0]] = parts.slice(1).join('=');
            return acc;
        }, {});
        const serverValue = cookies[serverKey] ? decodeURIComponent(cookies[serverKey]) : null;
        if (serverValue) return serverValue;
        return cookies[clientKey] ? decodeURIComponent(cookies[clientKey]) : null;
    };

    const set = (key, value, options = {}) => {
        const serverKey = getFullName(finalConfig.serverPrefix, key);
        const clientKey = getFullName(finalConfig.clientPrefix, key);
        const mergedOptions = {...finalConfig.cookieOptions, ...options};

        const buildCookieString = (name, val, opts) => {
            if (val === null || val === undefined) return `${name}=; Path=${opts.path}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            let str = `${name}=${encodeURIComponent(val)}`;
            if (opts.path) str += `; Path=${opts.path}`;
            if (opts.expires) str += `; Expires=${opts.expires.toUTCString()}`;
            if (opts.domain) str += `; Domain=${opts.domain}`;
            if (opts.secure) str += `; Secure`;
            if (opts.httpOnly) str += `; HttpOnly`;
            if (opts.sameSite) str += `; SameSite=${opts.sameSite}`;
            return str;
        };

        return [
            buildCookieString(serverKey, value, {...mergedOptions, httpOnly: true}),
            buildCookieString(clientKey, value, {...mergedOptions, httpOnly: false}),
        ];
    };

    return {get, set};
};