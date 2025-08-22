/**
 * @fileoverview A utility for creating stable, deterministic hash strings from any JavaScript input.
 * @version 1.0.0
 *
 * This function is a non-cryptographic hashing function. It is designed to be fast and to
 * produce a stable, predictable hash for any given JavaScript value. "Stable" means that
 * the same input will always produce the same output. For objects, the keys are sorted
 * before serialization to ensure that `{a: 1, b: 2}` and `{b: 2, a: 1}` produce the
 * same hash.
 *
 * This is particularly useful for creating idempotent identifiers or for simple checksums.
 * It is NOT suitable for cryptographic purposes like password hashing.
 */

/**
 * Creates a stable, deterministic hash string from any JavaScript input.
 *
 * This function is exported as an IIFE (Immediately Invoked Function Expression)
 * that contains a private `_serialize` helper function and returns the main
 * hashing function.
 *
 * @param {*} input - The value to hash (e.g., object, array, string, number).
 * @param {number} [length=12] - The desired length of the output hash string. Minimum is 12.
 * @param {string} PUSH_CHARS - The character set to use for generating the hash string.
 * This is typically provided by the calling module (e.g., pushID.js).
 * @returns {string} A stable hash string of the specified length.
 *
 * @example
 * // This example assumes PUSH_CHARS is available, as it is when called by pushID.js
 * const PUSH_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';
 *
 * // Hash a simple object. Note that key order does not matter.
 * const obj1 = { name: "John", age: 30 };
 * const obj2 = { age: 30, name: "John" };
 * const hash1 = hashIsh(obj1, 12, PUSH_CHARS);
 * const hash2 = hashIsh(obj2, 12, PUSH_CHARS);
 * console.log(hash1 === hash2); // -> true
 * // -> e.g., "J~4hV2b_kL9x"
 *
 * // Hash a string
 * const strHash = hashIsh("hello world", 16, PUSH_CHARS);
 * // -> e.g., "aBcDeFgHiJkLmNoP"
 *
 * // Hash an array
 * const arrHash = hashIsh([1, "test", true], 12, PUSH_CHARS);
 * // -> e.g., "zYxWvUtSrQpOnM"
 */
export const hashIsh = (function () {
    /**
     * Deterministically serializes any JavaScript value to a string for hashing.
     * Ensures that object keys are sorted to produce a stable, consistent output.
     * @private
     * @param {*} val - The value to serialize (string, number, object, array, etc.).
     * @returns {string} A stable, stringified representation of the value.
     */
    function _serialize(val) {
        if (val === null || val === undefined) return 'null';
        if (typeof val !== 'object') return JSON.stringify(val);
        if (Array.isArray(val)) return '[' + val.map(_serialize).join(',') + ']';
        // Sort object keys for a deterministic output
        return '{' + Object.keys(val).sort().map(key => JSON.stringify(key) + ':' + _serialize(val[key])).join(',') + '}';
    }

    /**
     * The main hashing function returned by the IIFE.
     * Implements a variation of the MurmurHash3 algorithm for fast, non-cryptographic hashing.
     * @param {*} input - The value to hash.
     * @param {number} length - The desired length of the hash.
     * @param {string} PUSH_CHARS - The character set for the output string.
     * @returns {string} The resulting hash string.
     */
    return function (input, length, PUSH_CHARS) {
        const serialized = _serialize(input);
        // MurmurHash3 seed values
        let h1 = 1779033703, h2 = 3144134277,
            h3 = 1013904242, h4 = 2773480762;

        for (let i = 0, k; i < serialized.length; i++) {
            k = serialized.charCodeAt(i);
            h1 = h2 ^ Math.imul(h1, 597399067);
            h2 = h3 ^ Math.imul(h2, 2869860233);
            h3 = h4 ^ Math.imul(h3, 951274213);
            h4 = h1 ^ Math.imul(h4, 2716044179);
            h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
            h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
            h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507);
            h4 = Math.imul(h4 ^ (h4 >>> 13), 3266489909);
            h1 = (h1 ^ k) >>> 0;
        }

        const hashChars = new Array(length);
        for (let i = 0; i < length; i++) {
            const state = [h1, h2, h3, h4];
            // Use the hash state to pick characters from the character set
            const charIndex = (state[i % 4] >> ((i % 5) * 3)) & 63;
            hashChars[i] = PUSH_CHARS.charAt(charIndex);
        }
        return hashChars.join('');
    }
})();