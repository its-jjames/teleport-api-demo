import {getAccessToken} from '../lib/_teleport_auth_helper.js';

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const API_BASE = "https://teleport.varjo.com";
        const { eid, parts } = JSON.parse(event.body);

        // Get token from internal helper, not via HTTP
        const access_token = await getAccessToken();

        if (!access_token) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to authenticate with Teleport API' })
            };
        }

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