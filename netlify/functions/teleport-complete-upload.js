/*import { getTeleportToken, apiBase } from "./_teleportAuth.js";

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
};*//*

exports.handler = async function(event, context) {
    console.log("Complete upload called with:", event.body);

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            success: true
        })
    };
};
*/
exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const API_BASE = "https://teleport.varjo.com";
        const { eid, parts, access_token } = JSON.parse(event.body);

        const response = await fetch(`${API_BASE}/api/v1/captures/${eid}/uploaded`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ eid, parts }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                statusCode: response.status,
                body: JSON.stringify({
                    error: `Failed to finalize upload: ${response.status}`,
                    details: errorText
                })
            };
        }

        const data = await response.json();
        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error("Complete upload error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || "Internal server error" })
        };
    }
};