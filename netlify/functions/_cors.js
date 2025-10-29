export const dev = process.env.NETLIFY_DEV === "true";

/**
 * Respond to CORS preflight in dev.
 * Call this at the very top of your function.
 */
export function handlePreflight(req) {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "access-control-allow-origin": dev ? "*" : "",
                "access-control-allow-methods": "POST,OPTIONS",
                "access-control-allow-headers": "content-type",
            },
        });
    }
    return null;
}

/**
 * Wrap normal responses with CORS headers in dev.
 */
export function withCors(body, init = {}) {
    const headers = new Headers(init.headers || {});
    if (dev) {
        headers.set("access-control-allow-origin", "*");
        headers.set("access-control-allow-methods", "POST,OPTIONS");
        headers.set("access-control-allow-headers", "content-type");
    }
    return new Response(body, { ...init, headers });
}
