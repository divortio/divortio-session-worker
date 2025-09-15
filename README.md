# Divortio Session Worker

[![Version](https://img.shields.io/badge/version-8.0.0-blue.svg)](./docs/API.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

A standalone, resilient, and highly-performant session management service for Cloudflare Workers.

This project provides a stateful session service built on **Durable Objects**. It is exposed to parent workers via a
simple and resilient **RPC API**, designed to enrich incoming requests with a complete session context while minimizing
boilerplate.

---

## Core Features

* **Middleware-Style API**: A single RPC call returns a cloned `Request` object with a `.session` property containing
  the full context.
* **Stateful Session Management**: Utilizes Durable Objects to provide a consistent, single-threaded execution context
  for session state.
* **Race-Condition Safety**: Implements a "Hybrid Naming" pattern to deterministically locate Durable Objects,
  preventing race conditions for new or cookieless clients.
* **High Performance**: Optimized with an in-memory cache and non-blocking (`allowUnconfirmed`) storage writes to
  minimize latency.
* **Automated Garbage Collection**: Uses the Durable Object Alarms API for a configurable TTL to automatically delete
  stale storage.
* **Built-in Analytics**: Provides a modular, multi-dataset integration with the Workers Analytics Engine out of the
  box.
* **Resilient by Design**: Includes graceful fallbacks to ensure a failure in the session service does not crash the
  consuming application.
* **Fully Configurable**: All cookie names, prefixes, domains, and expirations are controlled via `wrangler.toml`.

---

## Architectural Pattern

The service uses a **Hybrid Naming** and **Trust and Rehydrate** model to locate the correct Durable Object and manage
its state.

1. **Request Arrives at Stateless Worker (`worker.mjs`)**
    * **`cID` Cookie Exists?**
        * **Yes (Fast Path)**: The DO is located directly by its name: `getByName(cID)`.
        * **No (Bootstrap Path)**: A deterministic, colo-agnostic key is generated from the request fingerprint. The DO
          is located by this key: `getByName(stableKey)`. This prevents race conditions for new users.

2. **RPC Call to Stateful `SessionDO`**
    * **Storage Exists?**
        * **Yes**: The DO loads its state from its in-memory cache or persistent storage.
        * **No (Rehydration)**: If the DO's storage is empty (due to garbage collection), it trusts
          the `HttpOnly, Secure` cookies from the request to seamlessly rehydrate its state.

3. **Response**
    * The `SessionDO` returns a single, enriched `Request` object with the full session context attached to
      the `.session` property.

---

## Usage Example

The primary goal of this service is to minimize boilerplate in the consuming worker. Integration requires a single
service binding and one RPC call.

```javascript
// src/worker.mjs (in the parent application)
export default {
    async fetch(request, env, ctx) {
        // 1. Get the single, enriched request from the session service.
        const enrichedRequest = await env.SESSION_SERVICE.processSession(request);

        // 2. All session data is now available on `enrichedRequest.session`.
        if (enrichedRequest.session.isNewClient) {
            console.log(`New client detected. Fingerprint: ${enrichedRequest.session.fpID}`);
        }
        
        // 3. Run application logic with the enriched request.
        const appResponse = await yourApplicationLogic(enrichedRequest);
        
        // 4. Apply cookies to the final response using the built-in helper.
        return enrichedRequest.session.applySessionCookies(appResponse);
    }
};
```

---

## 📚 Full Documentation

For detailed information on deployment, the API, and the analytics schema, please refer to the documents in the `/docs`
directory.

* **[Deployment Guide](./docs/DEPLOYMENT.md)**
* **[Usage Guide](./docs/USAGE.md)**
* **[API Reference](./docs/API.md)**
* **[Analytics Schema](./docs/ANALYTICS.md)**
