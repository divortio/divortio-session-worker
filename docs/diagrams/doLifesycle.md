# Garbage Collection Lifecycle

This diagram explains the automated garbage collection mechanism that ensures the `divortio-session-worker` is
cost-effective over the long term. It uses the **Durable Object Alarms API** to implement a Time-to-Live (TTL) policy
for stored data.

The lifecycle is designed to be fully autonomous:

1. **Creation & Alarm Set**: When a user's `SessionDO` is activated for the first time, it immediately sets a cleanup
   alarm for a future date (e.g., 90 days from now), defined by `DO_TTL_SECONDS` in `wrangler.toml`.
2. **Activity Resets Alarm**: Every subsequent request from that user resets the alarm's timer, pushing the cleanup date
   further into the future. This ensures that the data for active users is never deleted.
3. **Inactivity Triggers Deletion**: If a user is inactive for the entire TTL period, the alarm will trigger. The
   Cloudflare runtime will then execute the `alarm()` method inside the DO, which calls `deleteAll()` to permanently and
   completely remove the stale storage.

This pattern guarantees that you only pay for the storage of users who have been recently active, without any need for
manual cleanup jobs.

```mermaid
graph TD
    A[Start: New User Request] --> B{SessionDO Instance Created};
    B --> C[processSession() called];
    C --> D[setTtlAlarm(Date.now() + 90 days)];
    D --> E{User Active?};

    E -- Yes --> F[Subsequent Request];
    F --> G[Reset Alarm Timer to +90 Days];
    G --> E;

    E -- No (after 90 days) --> H((Alarm Triggered by Runtime));
    H --> I[alarm() method executes];
    I --> J[ctx.storage.deleteAll()];
    J --> K[End: Stale Storage Deleted];
```