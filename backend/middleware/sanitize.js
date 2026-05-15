/**
 * sanitize.js — Global Input Sanitizer Middleware
 *
 * Recursively trims all string fields in:
 *   - req.body   (JSON / URL-encoded form data)
 *   - req.query  (query string parameters)
 *   - req.params (URL route parameters)
 *
 * This removes leading/trailing spaces, tabs, newlines (\n, \r)
 * that may accidentally be included when users paste or scan values.
 *
 * Skips: numbers, booleans, null/undefined, arrays (recurses into elements),
 *        nested objects (recurses into keys).
 * Password fields are intentionally NOT excluded — trimming passwords is
 * safe and consistent with the frontend behaviour.
 */

function deepTrim(value) {
    if (typeof value === 'string') {
        return value.trim();
    }
    if (Array.isArray(value)) {
        return value.map(deepTrim);
    }
    if (value !== null && typeof value === 'object') {
        const cleaned = {};
        for (const [k, v] of Object.entries(value)) {
            cleaned[k] = deepTrim(v);
        }
        return cleaned;
    }
    // Numbers, booleans, null, undefined — pass through unchanged
    return value;
}

/**
 * Express middleware — mutates req.body, req.query, req.params in-place.
 */
function sanitizeInputs(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = deepTrim(req.body);
    }
    if (req.query && typeof req.query === 'object') {
        req.query = deepTrim(req.query);
    }
    if (req.params && typeof req.params === 'object') {
        req.params = deepTrim(req.params);
    }
    next();
}

module.exports = sanitizeInputs;
