exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const API_BASE = "https://teleport.varjo.com";
        const requestData = JSON.parse(event.body);
        const { access_token } = requestData;

        // Create a new object without access_token to avoid sending it in the request body
        const captureData = { ...requestData };
        delete captureData.access_token;

        const response = await fetch(`${API_BASE}/api/v1/captures`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(captureData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                statusCode: response.status,
                body: JSON.stringify({
                    error: `Failed to create capture: ${response.status}`,
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
        console.error("Create capture error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || "Internal server error" })
        };
    }
};

/*exports.handler = async function(event, context) {
    console.log("Create capture called with:", event.body);

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            eid: "test-eid-" + Date.now(),
            num_parts: 5, // Small number for easy testing
            chunk_size: 1048576 // 1MB chunks
        })
    };
};*/

/* import { getTeleportToken, apiBase } from "./_teleportAuth.js";
import { handlePreflight, withCors } from "./_cors.js";

export default async (req) => {
    // 1) CORS preflight
    console.log("CORS preflight");

    const pre = handlePreflight(req);
    if (pre) return pre;

    try {
        if (req.method !== "POST") {
            return withCors("method not allowed", { status: 405 });
        }

        const { name, bytesize, input_data_format, num_frames, guided_mode } = await req.json();
        if (!name || typeof bytesize !== "number" || !input_data_format) {
            return withCors("missing required fields", { status: 400 });
        }

        const token = await getTeleportToken();

        const r = await fetch(`${apiBase()}/api/v1/captures`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name,
                bytesize,
                input_data_format, // "bulk-images" or "video"
                num_frames,
                guided_mode,
            }),
        });

        const text = await r.text();
        if (!r.ok) return withCors(text, { status: r.status });
        return withCors(text, { status: 200, headers: { "content-type": "application/json" } });
    } catch (e) {
        return withCors(e?.message || "server error", { status: 500 });
    }
};*/
