# Hybrid Naming & Routing Logic

This diagram explains the "Hybrid Naming" pattern used by the stateless `worker.mjs` to deterministically locate the
correct Durable Object instance. This is the core logic that prevents race conditions while ensuring maximum
performance.

The worker intelligently chooses between two paths:

1. **Fast Path (for Returning Users)**: If a `cID` cookie is present, it is used to name the Durable Object directly.
   This is the most efficient lookup.
2. **Bootstrap Path (for New/Cookieless Users)**: If no `cID` cookie exists, a stable, colo-agnostic fingerprint is used
   to name the Durable Object. This ensures that simultaneous initial requests from a new user are all routed to a
   single DO instance, guaranteeing that only one `cID` is created.

```mermaid
graph TD
    A[Start: Request Arrives at Stateless Worker] --> B{Has cID Cookie?};
    B -- Yes --> C[Fast Path];
    B -- No --> D[Bootstrap Path];

    subgraph Fast Path
        C --> E[DO Name = cID];
    end

    subgraph Bootstrap Path
        D --> F[Generate Stable Key <br> (fingerprint without colo)];
        F --> G[DO Name = Stable Key];
    end

    E --> H(Get DO Stub by Name);
    G --> H;

    H --> I{RPC Call: processSession};
    I --> J[Return Enriched Request];
```