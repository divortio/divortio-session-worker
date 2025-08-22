# 🚀 divortio-session-worker

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A standalone, resilient, and highly-performant session management service built on Cloudflare Workers and Durable
Objects. This worker is designed to be used as a "plug-and-play" service by any other Cloudflare Worker, providing
robust, stateful user session tracking without adding complex logic to the parent application.

It exposes a rich, expressive RPC-style API on the Durable Object, allowing for both fine-grained control and ultimate
convenience. The service handles the entire session lifecycle (`cID`, `sID`, `eID`) and is completely decoupled from the
parent worker's business logic.

---

### Key Features

* **🔌 Plug-and-Play**: Integrate robust session management into any Cloudflare Worker with a single service binding and
  one line of code.
* **🚀 Expressive RPC API**: The underlying Durable Object (`SessionDO`) exposes a rich set of public
  methods (`getState`, `processState`, etc.), allowing for powerful integrations and easy debugging.
* **🔗 Decoupled Architecture**: The parent worker doesn't need to know anything about Durable Objects. It simply makes
  a `fetch` call to the service, which handles all the complex stateful logic internally.
* **💾 Stateful & Persistent**: Uses a Durable Object (`SessionDO`) with its own private SQLite storage to persist
  session data, ensuring user sessions are durable and consistent.
* **🚀 High Performance**: Leverages the performance of Cloudflare's edge network. The stateless worker runs in every
  data center, and the stateful `SessionDO` is automatically placed near the user to minimize latency.
* **🍪 Secure Cookies**: Uses a dual-cookie strategy (`HttpOnly` server-side cookies and client-accessible cookies) for
  a secure-by-default posture.

---

## 🛠️ Deployment Instructions (via Cloudflare UI & GitHub)

This guide will walk you through deploying the `divortio-session-worker` from a GitHub repository.

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
5. **Configure the Durable Object Binding**: The initial deployment will succeed, but the service won't be fully
   functional until you configure the binding.
    * Go to your new worker's **`Settings`** tab > **`Variables`**.
    * Scroll down to **Durable Object Bindings** and click "**Add binding**".
    * **Variable name**: `SESSION_DO`
    * **Durable Object class**: `SessionDO`
    * Click "**Save**".
6. **Trigger a New Deployment**: Go to the "**Deployments**" tab and click "**Deploy**" to apply the binding changes.

Your `divortio-session-worker` is now live and ready to be used by other workers.

---

## 💡 How to Use This Service from a Parent Worker

Integrating this session service into any of your other Cloudflare Workers is incredibly simple.

### Step 1: Bind the Service in the Parent Worker

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

In your parent worker's fetch handler, make a single `fetch` call to the session service. The service returns a
complete `Response` object containing the session data in its body and all the necessary `Set-Cookie` headers.

**`src/worker.mjs` (of parent worker):**

```javascript
export default {
    async fetch(request, env, ctx) {
        // 1. Call the session service via the binding.
        // It's best to send a clone of the request to preserve the original body.
        const sessionResponse = await env.SESSION_SERVICE.fetch(request.clone());

        // 2. You now have the session data and cookies.
        // The session data (cID, sID, eID) is in the response body.
        const sessionData = await sessionResponse.json();
        
        // The `Set-Cookie` headers are on the response object.
        const setCookieHeaders = sessionResponse.headers.get('Set-Cookie');

        // You can now use the sessionData for your application's logic.
        console.log(`User's Client ID: ${sessionData.cID}`);

        // 3. Create your application's final response.
        const finalResponse = new Response("Hello, world!", {
            // ... your headers
        });

        // 4. IMPORTANT: Append the Set-Cookie headers to your final response.
        if (setCookieHeaders) {
            finalResponse.headers.append('Set-Cookie', setCookieHeaders);
        }

        return finalResponse;
    }
};
```

---

## 🍪 Understanding the Identifiers & Cookies

The service sets several cookies to manage the session lifecycle. It uses a dual-cookie strategy for security: for each
piece of data, it sets a secure, `HttpOnly` cookie (prefixed with `_ss_`) that is inaccessible to client-side scripts,
and a corresponding client-accessible cookie (prefixed with `_cs_`) for non-sensitive UI purposes.

* **`doID` (Durable Object ID)**
    * **Cookie Name**: `_ss_doID`
    * **Purpose**: This is a long-term, persistent identifier that points to the specific Durable Object instance
      responsible for managing this user's state. It ensures that all requests from the same user are routed to the same
      stateful object. This cookie is `HttpOnly` and is not mirrored on the client side.

* **`fpID` (Fingerprint ID)**
    * **Cookie Names**: `_ss_fpID` / `_cs_fpID`
    * **Purpose**: A high-entropy, stable browser fingerprint generated from request properties (IP, User-Agent, etc.).
      It serves as a probabilistic identifier to track user activity when other cookies might not be available.

* **`cID` (Client ID)**
    * **Cookie Names**: `_ss_cID` / `_cs_cID`
    * **Purpose**: A long-term identifier for a unique browser or client. This ID persists across multiple sessions and
      represents the "user" from the perspective of the session manager.

* **`sID` (Session ID)**
    * **Cookie Names**: `_ss_sID` / `_cs_sID`
    * **Purpose**: A short-term identifier representing a single user session. This ID is rotated after a configurable
      period of inactivity (e.g., 30 minutes), marking the start of a new session.

* **`eID` (Event ID)**
    * **Cookie Names**: `_ss_eID` / `_cs_eID`
    * **Purpose**: The most granular identifier. A new `eID` is generated for every single request or tracked event,
      allowing for precise event-level analysis. It also serves as the activity marker for session timeout calculations.