# 📊 Built-in Analytics Guide

The `divortio-session-worker` includes a powerful, built-in analytics feature that sends detailed session events to the
Workers Analytics Engine (WAE) on every request. This provides deep, real-time insights into user behavior and service
health with zero configuration required in your parent worker.

---

### Strategy: Multi-Dataset Logging

To make querying efficient and cost-effective, the service uses a **multi-dataset strategy**. Instead of writing all
events to a single table, it conditionally writes to three different datasets based on the event's significance.

* **`SESSION_EVENTS` (Bound to `STATS_EVENTS`)**: Receives a data point for **every single request**, providing the most
  granular view of user activity.
* **`SESSION_SESSIONS` (Bound to `STATS_SESSION`)**: Receives a data point only when a **new session**
  begins (`isNewSession: true`). This makes it incredibly efficient to query for session-level metrics.
* **`SESSION_CLIENTS` (Bound to `STATS_CLIENT`)**: Receives a data point only when a **new client** is
  identified (`isNewClient: true`). This provides a clean and efficient log of user acquisition.

---

### Schema Definition

All three datasets share the same rich schema, designed to provide maximum analytical power.

| WAE Field | Data Type | Value from Session Context | Purpose & Querying Examples |
| :--- | :--- | :--- | :--- |
| `index1` | `index` | `cID` | **High-Cardinality Sampling
Key**. Allows you to efficiently query for the behavior of a specific user or a random sample of users. |
| `blob1` | `blob` | `request.cf.country` | **Geographic
Analysis**. Low-cardinality string perfect for grouping. `SELECT count() FROM SESSION_CLIENTS GROUP BY blob1`. |
| `blob2` | `blob` | `request.cf.colo` | **Performance
Analysis**. Analyze latency or user distribution by Cloudflare data center. |
| `blob3` | `blob` | `buildGeoId(request.cf)` | **Rich Geographic
ID**. A concatenated string of continent, country, region, city, and postal code for deep geo-analysis. |
| `blob4` | `blob` | `cID` | **Dimension**. The Client ID. |
| `blob5` | `blob` | `sID` | **Dimension**. The Session ID. |
| `blob6` | `blob` | `eID` | **Dimension**. The Event ID. |
| `blob7` | `blob` | `url.hostname` | **Domain Analysis**. Filter events by the specific domain or subdomain. |
| `blob8` | `blob` | `url.pathname` | **Content Analysis**. Group by page path to see popular content. |
| `blob9` | `blob` | `request.method` | **Technical Analysis**. Filter by HTTP method (GET, POST, etc.). |
| `blob10` | `blob` | `request.headers.get('Accept')`| **Content
Negotiation**. Analyze the types of content requested by clients. |
| `blob11` | `blob` | `fpID` | **Fingerprint Analysis**. The browser fingerprint ID. |
| `double1` | `double` | `isNewClient ? 1 : 0` | **User Acquisition
KPI**. The core metric for tracking new vs. returning users. |
| `double2` | `double` | `isNewFpID ? 1 : 0` | **Fingerprint Stability**. Track how often user fingerprints change. |
| `double3` | `double` | `isNewSession ? 1 : 0` | **User Engagement KPI**. Track how many new sessions are started. |
| `double4` | `double` | `isFallback ? 1 : 0` | **Service Health KPI**. Track the error rate of the session service. |