/**
 * A helper function to apply session cookies to a response in one line.
 * @param {Response} response - The final response object.
 * @param {string[]} setCookieHeaders - The array of 'Set-Cookie' headers.
 * @returns {Response} The response with headers appended.
 */
function applySessionCookies(response, setCookieHeaders) {
    if (setCookieHeaders && setCookieHeaders.length > 0) {
        // Create a mutable copy of the headers to avoid modifying the original response
        const newHeaders = new Headers(response.headers);
        setCookieHeaders.forEach(header => {
            newHeaders.append('Set-Cookie', header);
        });
        // Return a new response with the new headers
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    }
    return response;
}

export default {
    async fetch(request, env, ctx) {
        // 1. Get the complete, rich session context in a single, flattened RPC call.
        const {
            enrichedRequest,
            cID, sID, eID,
            clientTime, sessionTime, eventTime,
            oldState,
            isNewClient,
            isNewSession,
            isNewDoID,
            isNewFpID,
            doID,
            fpID,
            setCookieHeaders
        } = await env.SESSION_SERVICE.processSession(request);

        // --- Your Application Logic Starts Here ---

        // Example: Log detailed context for new clients or sessions
        if (isNewClient) {
            console.log(`New client detected! fpID: ${fpID}, DO ID: ${doID}`);
        } else if (isNewSession) {
            console.log(`New session started for client ${cID}. Session ID: ${sID}`);
        }

        // Use the enrichedRequest for any downstream fetches or logic.
        // It now contains all identifiers in its Cookie header.
        const appResponse = await yourApplicationLogic(enrichedRequest, {cID, sID, eID});

        // --- End of Application Logic ---

        // 2. Apply all necessary cookies to the final response with one line.
        return applySessionCookies(appResponse, setCookieHeaders);
    }
};

/**
 * Example application logic function.
 * It is now completely decoupled from the session management mechanics.
 * @param {Request} request - The request, now enriched with all session cookies.
 * @param {object} session - A simple object with core session IDs.
 */
async function yourApplicationLogic(request, session) {
    const body = `
        Hello, world! This is your app logic.
        Your Client ID is: ${session.cID}
        Your Session ID is: ${session.sID}
        Your Event ID is: ${session.eID}
    `;

    return new Response(body, {
        headers: {'Content-Type': 'text/plain'}
    });
}