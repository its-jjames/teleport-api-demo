import {getAccessToken} from '../lib/_teleport_auth_helper.js';

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const API_BASE = "https://teleport.varjo.com";
        const captureData = JSON.parse(event.body);
        // Get token from internal helper, not via HTTP
        console.log("Fetching access token");
        const access_token = await getAccessToken();

        if (!access_token) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to authenticate with Teleport API' })
            };
        }

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