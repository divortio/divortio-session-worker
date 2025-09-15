# 💡 Usage Guide

Integrating the `divortio-session-worker` into any of your other Cloudflare Workers is now simpler and safer than ever
thanks to the hardened RPC API.

---

### Step 1: Bind the Service in Your Parent Worker

In the `wrangler.toml` file of your **parent worker** (e.g., your main application worker), add a `[[services]]` binding
that points to the `divortio-session-worker` you just deployed.

**`wrangler.toml` (of parent worker):**

```toml
# ... other configurations for your parent worker ...

[[services]]
# This is the variable name you will use in your code (e.g., env.SESSION_SERVICE)
binding = "SESSION_SERVICE"
# This must match the name of your deployed divortio-session-worker
service = "divortio-session-worker"
```

### Step 2: Call the Service from Your Parent Worker's Code

In your parent worker's `fetch` handler, make a single RPC call to the `processSession` method. The service is designed
to be resilient; if it fails, it will return a neutral, "empty" session context, allowing your application to proceed
without crashing.

**`parent-worker-example.mjs`:**

```javascript
/**
 * A helper function to apply session cookies to a response in one line.
 */
function applySessionCookies(response, setCookieHeaders) {
    if (setCookieHeaders && setCookieHeaders.length > 0) {
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
    return response;
}

export default {
    async fetch(request, env, ctx) {
        // 1. Get the complete, rich session context in a single RPC call.
        const session = await env.SESSION_SERVICE.processSession(request);

        // Graceful Fallback Check: If cID is null, the session service may have
        // encountered an error, but the parent application can still proceed.
        if (session.cID === null) {
            console.warn("Could not retrieve session context. Proceeding without session.");
        }

        // --- Your Application Logic Starts Here ---

        if (session.isNewClient) {
            console.log(`New client detected! fpID: ${session.fpID}`);
        }
        
        const appResponse = await yourApplicationLogic(session.enrichedRequest, session);
        
        // --- End of Application Logic ---

        // 2. Apply all necessary cookies to the final response.
        return applySessionCookies(appResponse, session.setCookieHeaders);
    }
};

async function yourApplicationLogic(request, session) {
    const body = `Hello, world! Your Session ID is: ${session.sID || 'N/A'}`;
    return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}
```