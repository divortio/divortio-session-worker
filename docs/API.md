# 📖 API Reference

The service exposes a single, powerful RPC method that returns a custom, enriched `Request` object.

---

### `processSession(request)`

This is the primary method for interacting with the session service.

* **Parameters**:
    * `request`: The original `Request` object from the parent worker's `fetch` handler.
* **Returns**: `Promise<Request>` - A Promise that resolves to a new, enriched `Request` object. The enriched request is
  a clone of the original and has a new `.session` property attached to it.

---

### The `.session` Object

The `.session` object is attached directly to the returned request object and contains the complete, flattened session
context.

| Property              | Type         | Description                                                                                                                              |
| --------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `cID`                 | `string|null`  | The long-term Client ID for the user's browser.                                                                                          |
| `sID`                 | `string|null`  | The ID for the current session. Rotates based on server-side inactivity.                                                               |
| `eID`                 | `string|null`  | The unique ID for this specific event/request.                                                                                           |
| `oldState`            | `object`     | An object representing the session state *
before* this request was processed.                                                          |
| `isNewClient`         | `boolean`    | `true` if a `cID` was created for the first time.                                                                                        |
| `isNewSession`        | `boolean`    | `true` if the session timed out and a new `sID` was generated.                                                                         |
| `isNewDoID`           | `boolean`    | `true` if this request resulted in interacting with a DO named by a fingerprint (i.e., a "bootstrap" session).                               |
| `isNewFpID`           | `boolean`    | `true` if the browser fingerprint was missing or has changed since the last request.                                                     |
| `doID`                | `string|null`  | The name of the DO instance handling this user's state (either a `cID` or a stable key).                                                 |
| `fpID`                | `string|null`  | The calculated browser fingerprint for the current request.                                                                            |
| `setCookieHeaders`    | `Array`      | An array of `Set-Cookie` header strings.                                                                                                 |
| `applySessionCookies` | `function`   | A convenience method that takes a `Response` object and returns a new `Response` with the `setCookieHeaders` applied.                      |

---

## 🍪 Understanding the Identifiers & Cookies

The service sets several **long-lived, persistent cookies** to manage the session lifecycle. The concept of a "session"
is a server-side construct determined by user activity, not by the lifespan of a browser cookie. Cookie names are fully
configurable via `wrangler.toml`.

| ID     | Default Key | Purpose                                                                                 |
| ------ | ----------- | --------------------------------------------------------------------------------------- |
| `cID`  | `cID`       | A persistent identifier for a unique browser or client.                                 |
| `sID`  | `sID`       | An identifier representing a single user session. Rotated on the server after inactivity. |
| `eID`  | `eID`       | A unique identifier for every single request.                                           |
| `fpID` | `fpID`      | A high-entropy browser fingerprint that serves as a probabilistic identifier.           |