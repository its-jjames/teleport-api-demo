// netlify/functions/teleport-upload-url.js
import { getTeleportToken } from "./_teleportAuth.js";

export default async (req) => {
    try {
        const { eid, part_no, bytesize } = await req.json();
        const token = await getTeleportToken();

        const res = await fetch(`${process.env.TELEPORT_API_BASE}/api/v1/captures/${eid}/create-upload-url/${part_no}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ eid, bytesize })
        });

        if (!res.ok) return new Response(await res.text(), { status: res.status });
        return new Response(await res.text(), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(e.message, { status: 500 });
    }
};
