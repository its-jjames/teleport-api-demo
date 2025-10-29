import {getTeleportToken} from "./_teleportAuth.js";

export default async () =>
    new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "content-type": "application/json" }
    });

const token = await getTeleportToken();