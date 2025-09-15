/*
 * =============================================================================
 * FILE: src/lib/enrichRequest.mjs
 *
 * DESCRIPTION:
 * A utility module for enriching a Cloudflare Worker request object with
 * session data. This creates a convenient, middleware-style API where all
 * session information is attached directly to the request object.
 * =============================================================================
 */

/**
 * A helper function to apply all necessary `Set-Cookie` headers to a final
 * Response object.
 *
 * @param {Response} response - The final Response object.
 * @param {string[]} setCookieHeaders - The array of 'Set-Cookie' header strings.
 * @returns {Response} A new Response object with the headers appended.
 */
function applySessionCookies(response, setCookieHeaders) {
    if (!setCookieHeaders || setCookieHeaders.length === 0) {
        return response;
    }
    const newHeaders = new Headers(response.headers);
    setCookieHeaders.forEach(header => {
        newHeaders.append('Set-Cookie', header);
    });
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
    });
}

/**
 * Clones a Request object and attaches a comprehensive `session` property to it.
 *
 * @param {Request} request - The original incoming request object.
 * @param {object} sessionData - The rich session context object from the service.
 * @returns {Request} A new, enriched Request object with a `.session` property.
 */
export function enrichRequest(request, sessionData) {
    const clonedRequest = request.clone();

    clonedRequest.session = {
        ...sessionData,
        /**
         * A convenience method to apply this session's cookies to a Response.
         * @param {Response} response - The final response from your application logic.
         * @returns {Response} A new Response with the session cookies applied.
         */
        applySessionCookies: (response) => applySessionCookies(response, sessionData.setCookieHeaders),
    };

    return clonedRequest;
}