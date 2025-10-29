// No need to import node-fetch in newer Node versions
// For Netlify Functions, we can use the global fetch

exports.handler = async function(event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const CLIENT_ID = process.env.TELEPORT_CLIENT_ID;
        const CLIENT_SECRET = process.env.TELEPORT_CLIENT_SECRET;
        const AUTH_ENDPOINT = "https://signin.teleport.varjo.com/oauth2/token";

        const authResponse = await fetch(AUTH_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "client_credentials",
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                scope: "openid profile email",
            }),
        });

        if (!authResponse.ok) {
            return {
                statusCode: authResponse.status,
                body: JSON.stringify({ error: `Authentication failed: ${authResponse.status}` })
            };
        }

        const data = await authResponse.json();
        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error("Auth error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || "Internal server error" })
        };
    }
};