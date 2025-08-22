# 🚀 Standalone Cloudflare Session Worker

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Stateless session management using Cloudflare Durable Objects & Workers.

A standalone, resilient, and highly-performant session management service built on Cloudflare Workers and Durable
Objects. This worker is designed to be used as a "plug-and-play" service by any other Cloudflare Worker, providing
robust, stateful user session tracking without adding complex logic to the parent application.

It intelligently handles the entire session lifecycle (`cID`, `sID`, `eID`), provides graceful fallbacks in case of
errors, and is completely decoupled from the parent worker's business logic.

---

### Key Features

* **🔌 Plug-and-Play:** Integrate robust session management into any Cloudflare Worker with a single service binding and
  one line of code.
* **🛡️ Resilient by Design:** Built with a "resilient proxy" pattern. If the stateful `SessionDO` fails for any reason,
  this worker provides a graceful fallback, ensuring the parent worker is never impacted.
* **🔗 Decoupled Architecture:** The parent worker doesn't need to know anything about Durable Objects or manage their
  IDs. All "cumbersome" logic is handled internally by this service.
* **💾 Stateful & Persistent:** Uses a Durable Object (`SessionDO`) with its own private SQLite storage to persist
  session data, ensuring user sessions are durable and consistent.
* **🚀 High Performance:** Leverages the performance of Cloudflare's edge network. The stateless worker runs in every
  data center, and the stateful `SessionDO` is automatically placed near the user to minimize latency.
* **🍪 Secure Cookies:** Uses a dual-cookie strategy (`HttpOnly` server-side cookies and client-accessible cookies) for
  a secure-by-default posture.

---

## 🛠️ Deployment Instructions (via Cloudflare UI & GitHub)

This guide will walk you through deploying the `session-worker` from a GitHub repository.

### Step 1: Fork and Clone the Repository

1. **Fork** this repository to your own GitHub account.
2. **Clone** your forked repository to your local machine.

### Step 2: Configure and Deploy from the Cloudflare Dashboard

1. **Navigate to Workers & Pages:** In the Cloudflare dashboard, go to `Workers & Pages`.
2. **Create Application:** Click "Create application", then select the "Workers" tab.
3. **Connect to Git:** Click "Connect with Git" and select the `session-worker` repository you forked.
4. **Configure Deployment:**
    * **Project Name:** Give your service a name (e.g., `session-worker-prod`).
    * **Production Branch:** Ensure this is set to `main`.
    * Click "**Save and Deploy**".
5. **Configure the Durable Object Binding:** The initial deployment will succeed, but the service won't be fully
   functional until you configure the binding.
    * Go to your new worker's **`Settings`** tab > **`Variables`**.
    * Scroll down to **Durable Object Bindings** and click "**Add binding**".
    * **Variable name:** `SESSION_DO`
    * **Durable Object class:** `SessionDO`
    * Click "**Save**".
6. **Trigger a New Deployment:** Go to the "**Deployments**" tab and click "**Deploy**" to apply the binding changes.

Your `session-worker` is now live and ready to be used by other workers.

---

## 💡 How to Use This Service from a Parent Worker

Integrating this session service into any of your other Cloudflare Workers is incredibly simple.

### Step 1: Bind the Service in the Parent Worker

In the `wrangler.toml` file of your **parent worker** (e.g., your main application worker), add a `[[services]]` binding
that points to the `session-worker` you just deployed.

**`wrangler.toml` (of parent worker):**

```toml
# ... other configurations for your parent worker ...

[[services]]
# This is the variable name you will use in your code (e.g., env.SESSION_SERVICE)
binding = "SESSION_SERVICE"
# This must match the name of your deployed session-worker
service = "session-worker"
```

Step 2: Call the Service from Your Parent Worker's Code In your parent worker's fetch handler, make a single fetch call
to the session service. The service will return a Response object that contains all the Set-Cookie headers you need. You
simply need to extract these headers and apply them to your final response.

src/worker.mjs (of parent worker):
```js
export default {
    async fetch(request, env, ctx) {
        // 1. Call the session service via the binding.
        // It's best to send a clone of the request to preserve the original body.
        const sessionResponse = await env.SESSION_SERVICE.fetch(request.clone());

        // 2. Extract the Set-Cookie headers from the service's response.
        const setCookieHeaders = sessionResponse.headers.get('Set-Cookie');

        // 3. Create your application's final response.
        const finalResponse = new Response("Hello, world!", {
            // You can also copy headers from your origin if needed
        });

        // 4. IMPORTANT: Append the Set-Cookie headers to your final response.
        if (setCookieHeaders) {
            finalResponse.headers.append('Set-Cookie', setCookieHeaders);
        }

        return finalResponse;
    }
};
```