# Session & Identifier Lifecycle

This diagram illustrates the lifecycle of the three core identifiers (`cID`, `sID`, `eID`) for a single user over
multiple requests. It shows how the system maintains a long-term identity while creating ephemeral sessions and events.

The identifiers follow a "waterfall" model:

* **`cID` (Client ID)**: Created only once on the user's first-ever visit. It is the most persistent identifier and
  represents the user's long-term identity.
* **`sID` (Session ID)**: Created on the user's first visit and then again only after a period of inactivity (e.g., 30
  minutes). It groups together a series of events from a single browsing session.
* **`eID` (Event ID)**: A new `eID` is generated for every single request. It is the most granular identifier and is
  used to mark the user's last activity time.

```mermaid
sequenceDiagram
    actor User
    participant Service as Session Worker Service

    Note over User, Service: First-ever visit
    User->>Service: Request 1 (GET /)
    Service->>Service: No cID exists -> isNewClient = true
    Service->>Service: No sID exists -> isNewSession = true
    Service-->>User: Response 1 (Set cID-1, sID-A, eID-X)

    Note over User, Service: A few moments later...
    User->>Service: Request 2 (GET /about)
    Service->>Service: cID-1 exists -> isNewClient = false
    Service->>Service: sID-A is not expired -> isNewSession = false
    Service-->>User: Response 2 (Set sID-A, eID-Y)

    Note over User, Service: 45 minutes later (Session has expired)
    User->>Service: Request 3 (GET /pricing)
    Service->>Service: cID-1 exists -> isNewClient = false
    Service->>Service: sID-A has expired -> isNewSession = true
    Service-->>User: Response 3 (Set sID-B, eID-Z)
```