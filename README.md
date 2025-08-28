# 🚀 divortio-session-worker

![Version](https://img.shields.io/badge/version-5.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A standalone, resilient, and highly-performant session management service built on Cloudflare Workers and Durable
Objects. This worker is designed to be used as a "plug-and-play" service by any other Cloudflare Worker, providing
robust, stateful user session tracking without adding complex logic to the parent application.

It exposes a powerful and convenient **RPC (Remote Procedure Call) API** that is hardened against common failures. It
uses a **Hybrid Naming** pattern for Durable Objects to provide race-condition-proof session creation for new users and
maximum performance for returning users.

---

### Key Features

* **🔌 Plug-and-Play**: Integrate robust session management into any Cloudflare Worker with a single service binding and
  one line of code.
* **🚀 Expressive & Resilient RPC API**: A single `processSession(request)` call provides an enriched request and a
  complete session context. It includes graceful fallbacks to ensure the session service's failure never crashes the
  parent application.
* **🔐 Race-Condition Proof**: Uses a deterministic, colo-agnostic fingerprint to name Durable Objects for new users,
  guaranteeing session consistency even under concurrent initial requests.
* **⚡️ High-Performance Lookups**: Uses the stable `cID` to name Durable Objects for returning users, providing the most
  direct and performant path to their session state.
* **🍪 Configurable & Persistent Cookies**: Uses a secure, dual-cookie (`HttpOnly` and client-side) strategy with
  long-lived expirations. All cookie names, prefixes, and the domain are fully configurable in `wrangler.toml`.

---

## 🛠️ Deployment Instructions

*(This section remains the same)*

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

Integrating this session service is now simpler and safer than ever thanks to the hardened RPC API.

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

---

## 📖 API Documentation

The service exposes a single, powerful RPC method.

### `processSession(request)`

This is the primary method for interacting with the session service.

* **Parameters**:
    * `request`: The original `Request` object.
* **Returns**: `Promise<object>` - A Promise that resolves to a rich session context object. **In the event of a
  critical failure, this method will return a fallback context where most properties are `null` or empty.**

| Property            | Type             | Description                                                                                                                             |
| ------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `enrichedRequest`   | `Request`        | A new `Request` object with a `Cookie` header containing all identifiers.                                                               |
| `cID`               | `string \| null` | The long-term Client ID for the user's browser.                                                                                         |
| `sID`               | `string \| null` | The ID for the current session.                                                                                                         |
| `eID`               | `string \| null` | The unique ID for this specific event/request.                                                                                          |
| `oldState`          | `object`         | The session state *
before* this request was processed.                                                                                  |
| `isNewClient`       | `boolean`        | `true` if a `cID` was created for the first time.                                                                                       |
| `isNewSession`      | `boolean`        | `true` if the session timed out and a new `sID` was generated.                                                                          |
| `isNewDoID`         | `boolean`        | `true` if this request resulted in interacting with a DO named by a fingerprint.                                                        |
| `isNewFpID`         | `boolean`        | `true` if the browser fingerprint was missing or has changed.                                                                           |
| `doID`              | `string \| null` | The name of the DO instance handling this user's state (either a `cID` or a stable key).                                                |
| `fpID`              | `string \| null` | The calculated browser fingerprint for the current request.                                                                             |
| `setCookieHeaders`  | `Array`          | An array of `Set-Cookie` header strings to be appended to the final response.                                                           |

---

## 🍪 Understanding the Identifiers & Cookies

The service sets several **long-lived, persistent cookies**. The concept of a "session" is a server-side construct
determined by user activity, not by the lifespan of a browser cookie. Cookie names are fully configurable
via `wrangler.toml`.

| ID     | Default Key | Purpose                                                                                 |
| ------ | ----------- | --------------------------------------------------------------------------------------- |
| `cID`  | `cID`       | A persistent identifier for a unique browser or client.                                 |
| `sID`  | `sID`       | An identifier representing a single user session. Rotated on the server after inactivity. |
| `eID`  | `eID`       | A unique identifier for every single request.                                           |
| `fpID` | `fpID`      | A high-entropy browser fingerprint that serves as a probabilistic identifier.           |

