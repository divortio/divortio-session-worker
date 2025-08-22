# 🚀 divortio-session-worker

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A standalone, resilient, and highly-performant session management service built on Cloudflare Workers and Durable
Objects. This worker is designed to be used as a "plug-and-play" service by any other Cloudflare Worker, providing
robust, stateful user session tracking without adding complex logic to the parent application.

It now exposes a powerful and convenient **RPC (Remote Procedure Call) API**, allowing a parent worker to receive a
fully enriched request and a rich session context object with a single, intuitive function call. The service handles the
entire session lifecycle (`doID`, `fpID`, `cID`, `sID`, `eID`) and is completely decoupled from the parent worker's
business logic.

---

### Key Features

* **🔌 Plug-and-Play**: Integrate robust session management into any Cloudflare Worker with a single service binding and
  one line of code.
* **🚀 Expressive RPC API**: A single `processSession(request)` call provides an enriched request object and a complete
  session context, minimizing boilerplate in the parent worker.
* **🔗 Decoupled Architecture**: The parent worker doesn't need to know anything about Durable Objects. It simply makes
  an RPC call to the service, which handles all the complex stateful logic internally.
* **💾 Stateful & Persistent**: Uses a Durable Object (`SessionDO`) with its own private SQLite storage to persist
  session data, ensuring user sessions are durable and consistent.
* **🚀 High Performance**: Leverages the performance of Cloudflare's edge network. The stateless worker runs in every
  data center, and the stateful `SessionDO` is automatically placed near the user to minimize latency.
* **🍪 Secure & Persistent Cookies**: Uses a dual-cookie strategy (`HttpOnly` server-side cookies and client-accessible
  cookies) for a secure-by-default posture, with long-lived expirations controlled via `wrangler.toml`.

---

## 🛠️ Deployment Instructions

*(This section remains the same as the previous version)*

### Step 1: Fork and Clone the Repository

1. **Fork** this repository to your own GitHub account.
2. **Clone** your forked repository to your local machine.

### Step 2: Configure and Deploy from the Cloudflare Dashboard

1. **Navigate to Workers & Pages**: In the Cloudflare dashboard, go to `Workers & Pages`.
2. **Create Application**: Click "Create application", then select the "Workers" tab.
3. **Connect to Git**: Click "Connect with Git" and select the `divortio-session-worker` repository you forked.
4. **Configure Deployment**:
    * **Project Name**: Give your service a name (e.g., `divortio-session-worker-prod`).
    * **Production Branch**: Ensure this is set to `main`.
    * Click "**Save and Deploy**".
5. **Configure the Durable Object Binding**:
    * Go to your new worker's **`Settings`** tab > **`Variables`**.
    * Scroll down to **Durable Object Bindings** and click "**Add binding**".
    * **Variable name**: `SESSION_DO`
    * **Durable Object class**: `SessionDO`
    * Click "**Save**".
6. **Trigger a New Deployment**: Go to the "**Deployments**" tab and click "**Deploy**" to apply the binding changes.

Your `divortio-session-worker` is now live and ready to be used by other workers.

---

## 💡 How to Use This Service from a Parent Worker

Integrating this session service is now simpler than ever thanks to the RPC API.

### Step 1: Bind the Service in the Parent Worker

In the `wrangler.toml` file of your **parent worker**, add a `[[services]]` binding that points to
the `divortio-session-worker` you just deployed.

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

In your parent worker's `fetch` handler, make a single RPC call to the `processSession` method. You can destructure the
result to get direct access to all session properties, or capture it in a single `session` object for convenience.

**`src/worker.mjs` (of parent worker):**

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
        // 1. Get the complete session context by destructuring the RPC response.
        const { 
            enrichedRequest,
            cID, 
            sID, 
            eID, 
            oldState, 
            isNewClient, 
            isNewSession, 
            isNewDoID, 
            isNewFpID,
            doID, 
            fpID,
            setCookieHeaders 
        } = await env.SESSION_SERVICE.processSession(request);

        /*
         * Alternatively, you can capture the entire context in one object:
         * const session = await env.SESSION_SERVICE.processSession(request);
         * console.log(session.cID, session.isNewClient, etc.);
        */

        // --- Your Application Logic Starts Here ---

        // Example: Perform detailed logging or analytics based on the rich context.
        if (isNewClient) {
            console.log(`New client detected! Assigning cID: ${cID}. Fingerprint: ${fpID}`);
        }
        if (isNewSession) {
            console.log(`New session started for client ${cID}. Previous sID: ${oldState.sID}, New sID: ${sID}`);
        }
        if (isNewFpID) {
            console.log(`Client fingerprint has changed. New fpID: ${fpID}`);
        }

        // Example: Use the enrichedRequest for a downstream logging service that needs full context.
        // ctx.waitUntil(env.LOGGER.log(enrichedRequest));
        
        const appResponse = await yourApplicationLogic(enrichedRequest, { cID, sID, eID });
        
        // --- End of Application Logic ---

        // 2. Apply all necessary cookies to the final response with one line.
        return applySessionCookies(appResponse, setCookieHeaders);
    }
};

/**
 * Your main application logic, which receives the enriched request and session data.
 */
async function yourApplicationLogic(request, session) {
    const body = `
        Hello, world!
        Client ID: ${session.cID}
        Session ID: ${session.sID}
    `;
    return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}
```

## 📖 API Documentation

The service exposes a single, powerful RPC method.

### `processSession(request)`

This is the primary method for interacting with the session service.

* **Parameters**:
    * `request`: The original `Request` object from the parent worker's `fetch` handler.
* **Returns**: `Promise<object>` - A Promise that resolves to a rich session context object with the following
  properties:

| Property | Type | Description |
| --- | --- | --- |
| `enrichedRequest` | `Request` | A new `Request` object, identical to the original but with a `Cookie` header containing all identifiers (`_ss_doID`, `_ss_fpID`, etc.). |
| `cID` | `string` | The long-term Client ID for the user's browser. |
| `sID` | `string` | The ID for the current session. Rotates based on server-side inactivity. |
| `eID` | `string` | The unique ID for this specific event/request. |
| `clientTime` | `Date` | The creation timestamp of the `cID`. |
| `sessionTime` | `Date` | The creation timestamp of the `sID`. |
| `eventTime` | `Date` | The creation timestamp of the `eID`. |
| `oldState` | `object` | An object representing the session state *
before* this request was processed. Contains `cID`, `sID`, `eID`, etc. from the previous event. |
| `isNewClient` | `boolean` | `true` if a `cID` was created for the first time. |
| `isNewSession` | `boolean` | `true` if the session timed out and a new `sID` was generated. |
| `isNewDoID` | `boolean` | `true` if a new Durable Object ID was created for this user. |
| `isNewFpID` | `boolean` | `true` if the browser fingerprint was missing or has changed since the last request. |
| `doID` | `string` | The ID of the Durable Object instance handling this user's state. |
| `fpID` | `string` | The calculated browser fingerprint for the current request. |
| `setCookieHeaders` | `Array` | An array of `Set-Cookie` header strings that **
must** be appended to the final response to the browser. |

---

## 🍪 Understanding the Identifiers & Cookies

The service sets several **long-lived, persistent cookies** to manage the session lifecycle. The concept of a "session"
is a server-side construct determined by user activity, not by the lifespan of a browser cookie. It uses a dual-cookie
strategy for security:

* **`_ss_` (Server-Side) Cookies**: `HttpOnly`, secure, and inaccessible to client-side scripts. This is the source of
  truth for the server.
* **`_cs_` (Client-Side) Cookies**: A read-only copy for non-sensitive UI purposes, accessible to client-side scripts.

| ID | Cookie Names | Purpose |
| --- | --- | --- |
| `doID` | `_ss_doID`, `_cs_doID` | A persistent identifier that points to the specific Durable Object instance managing this user's state. |
| `fpID` | `_ss_fpID`, `_cs_fpID` | A high-entropy browser fingerprint that serves as a probabilistic identifier to track user activity. |
| `cID` | `_ss_cID`, `_cs_cID` | A persistent identifier for a unique browser or client. This represents the "user" from the perspective of the session manager. |
| `sID` | `_ss_sID`, `_cs_sID` | An identifier representing a single user session. This ID is rotated on the server after a configurable period of inactivity, marking a new session. |
| `eID` | `_ss_eID`, `_cs_eID` | The most granular identifier. A new `eID` is generated for every single request, serving as the activity marker for session timeout calculations. |

