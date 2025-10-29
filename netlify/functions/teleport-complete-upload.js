import { getTeleportToken, apiBase } from "./_teleportAuth.js";

export default async (req) => {
    try {
        if (req.method !== "POST") {
            return new Response("method not allowed", { status: 405 });
        }
        const { eid, parts } = await req.json();

        if (!eid || !Array.isArray(parts) || parts.length === 0) {
            return new Response("missing required fields", { status: 400 });
        }

        const token = await getTeleportToken();

        const r = await fetch(`${apiBase()}/api/v1/captures/${encodeURIComponent(eid)}/uploaded`, {
            method: "POST",
            headers: {
                "authorization": `Bearer ${token}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({ eid, parts })
        });

        const text = await r.text();
        if (!r.ok) return new Response(text, { status: r.status });
        return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
    } catch (e) {
        return new Response(e.message || "server error", { status: 500 });
    }
};
