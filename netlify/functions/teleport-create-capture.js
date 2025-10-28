// netlify/functions/teleport-create-capture.js
import { getTeleportToken } from "./_teleportAuth.js";

export default async (req, context) => {
    try {
        const { name, bytesize, input_data_format, num_frames, guided_mode } = await req.json();

        const token = await getTeleportToken();
        const res = await fetch(`${process.env.TELEPORT_API_BASE}/api/v1/captures`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name, bytesize,
                input_data_format, // "bulk-images" or "video"
                num_frames, guided_mode
            })
        });

        if (!res.ok) return new Response(await res.text(), { status: res.status });
        const data = await res.json(); // { eid, num_parts, chunk_size }
        return Response.json(data);
    } catch (e) {
        return new Response(e.message, { status: 500 });
    }
};
