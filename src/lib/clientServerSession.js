/*
 * =============================================================================
 * FILE: src/lib/clientServerSession.js
 *
 * DESCRIPTION:
 * A server-side storage helper for the sessionManager. This library is designed
 * for stateless server-side JavaScript environments like Cloudflare Workers.
 * It provides pure functions to parse incoming 'Cookie' headers and to generate
 * the outgoing 'Set-Cookie' headers needed to manage session state.
 *
 * It implements a dual-cookie strategy for security and flexibility:
 * 1.  HTTP-Only Server Cookie (prefixed with `_ss_`): Secure and inaccessible
 * to client-side scripts, protecting it from XSS attacks. This is the
 * primary source of truth.
 * 2.  Client-Accessible Cookie (prefixed with `_cs_`): A read-only copy for
 * non-sensitive UI purposes.
 *
 * @example
 * // --- How this library is used by a server-side controller (e.g., a DO) ---
 *
 * import { serverStorage } from './clientServerSession.js';
 *
 * // 1. Initialize the storage helper (usually in a constructor)
 * const storage = serverStorage({ prefix: 'myapp' });
 *
 * // 2. Get a value from an incoming request's Cookie header
 * const cookieHeader = "myapp_ss_cID=some-client-id; myapp_cs_cID=some-client-id";
 * const clientId = storage.get('cID', cookieHeader);
 * // -> clientId will be "some-client-id"
 *
 * // 3. Generate 'Set-Cookie' headers for an outgoing response
 * const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
 * const cookieHeaders = storage.set('sID', 'new-session-id', { expires: expiry });
 * // -> cookieHeaders will be an array of two strings:
 * // [
 * //   "myapp_ss_sID=new-session-id; Path=/; Expires=...; Secure; HttpOnly; SameSite=Strict",
 * //   "myapp_cs_sID=new-session-id; Path=/; Expires=...; Secure; SameSite=Strict"
 * // ]
 * =============================================================================
 */

/**
 * @typedef {object} ServerStorageConfig
 * @property {string} [prefix=''] - An optional prefix for all cookie keys. The library will append `_ss_` or `_cs_`.
 * @property {object} [cookieOptions] - Default options for setting cookies.
 * @property {string} [cookieOptions.path='/'] - The path for the cookie.
 * @property {boolean} [cookieOptions.secure=true] - The secure flag for the cookie.
 * @property {string} [cookieOptions.sameSite='Strict'] - The SameSite attribute for security.
 */

/**
 * @typedef {object} SetCookieOptions
 * @property {Date} [expires] - The expiration date of the cookie.
 * @property {number} [maxAge] - The max age of the cookie in seconds.
 * @property {string} [path] - The path for the cookie.
 * @property {boolean} [secure] - The secure flag.
 * @property {string} [sameSite] - The SameSite attribute.
 * @property {string} [domain] - The domain for the cookie.
 * @property {boolean} [httpOnly] - The HttpOnly flag.
 */

/**
 * Factory function that creates a server-side storage handler.
 * @param {ServerStorageConfig} [config={}] - Configuration for the server storage handler.
 * @returns {{get: function(string, string): (string|null), set: function(string, string, object): string[], config: ServerStorageConfig}} A storage handler object.
 */
export const serverStorage = (config = {}) => {
    const finalConfig = {
        prefix: '',
        cookieOptions: {
            path: '/',
            secure: true,
            sameSite: 'Strict',
        },
        ...config,
    };

    /**
     * Parses an incoming `Cookie` header string to retrieve a session value.
     * It prioritizes the server-side (`_ss_`) cookie as the source of truth.
     * @param {string} key - The key of the value to retrieve (e.g., 'cID', 'sID').
     * @param {string | null | undefined} cookieHeader - The raw `Cookie` header string from the incoming request.
     * @returns {string|null} The retrieved value, or null if not found.
     * @example
     * const storage = serverStorage();
     * const header = "_ss_cID=abc-123; _cs_cID=abc-123";
     * const cID = storage.get('cID', header); // -> "abc-123"
     */
    const get = (key, cookieHeader = '') => {
        if (!cookieHeader) return null;

        const serverKey = `${finalConfig.prefix}_ss_${key}`;
        const clientKey = `${finalConfig.prefix}_cs_${key}`;

        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const parts = cookie.trim().split('=');
            if (parts.length >= 2) {
                acc[parts[0]] = parts.slice(1).join('=');
            }
            return acc;
        }, {});

        const serverValue = cookies[serverKey] ? decodeURIComponent(cookies[serverKey]) : null;
        if (serverValue) return serverValue;

        const clientValue = cookies[clientKey] ? decodeURIComponent(cookies[clientKey]) : null;
        return clientValue;
    };

    /**
     * Generates an array of `Set-Cookie` header strings for a given key-value pair.
     * @param {string} key - The key of the item to set (e.g., 'sID').
     * @param {string} value - The value to store.
     * @param {SetCookieOptions} options - Cookie options, like `expires`.
     * @returns {string[]} An array of two `Set-Cookie` header strings.
     * @example
     * const storage = serverStorage();
     * const expiry = new Date();
     * const headers = storage.set('sID', 'xyz-789', { expires: expiry });
     * // headers ->
     * // [
     * //   "_ss_sID=xyz-789; Path=/; Expires=...; Secure; HttpOnly; SameSite=Strict",
     * //   "_cs_sID=xyz-789; Path=/; Expires=...; Secure; SameSite=Strict"
     * // ]
     */
    const set = (key, value, options = {}) => {
        const serverKey = `${finalConfig.prefix}_ss_${key}`;
        const clientKey = `${finalConfig.prefix}_cs_${key}`;
        const mergedOptions = {...finalConfig.cookieOptions, ...options};

        const buildCookieString = (name, val, opts) => {
            let str = `${name}=${encodeURIComponent(val)}`;
            if (opts.path) str += `; Path=${opts.path}`;
            if (opts.expires) str += `; Expires=${opts.expires.toUTCString()}`;
            if (opts.maxAge) str += `; Max-Age=${opts.maxAge}`;
            if (opts.domain) str += `; Domain=${opts.domain}`;
            if (opts.secure) str += `; Secure`;
            if (opts.httpOnly) str += `; HttpOnly`;
            if (opts.sameSite) str += `; SameSite=${opts.sameSite}`;
            return str;
        };

        const serverCookieOptions = {...mergedOptions, httpOnly: true};
        const clientCookieOptions = {...mergedOptions, httpOnly: false};

        return [
            buildCookieString(serverKey, value, serverCookieOptions),
            buildCookieString(clientKey, value, clientCookieOptions),
        ];
    };

    return {get, set, config: finalConfig};
};