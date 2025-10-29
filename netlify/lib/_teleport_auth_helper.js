let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
    const now = Date.now();

    if (cachedToken && tokenExpiry > now) {
        return cachedToken;
    }

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
        console.error("Authentication failed:", authResponse.status);
        return null;
    }

    const data = await authResponse.json();

    cachedToken = data.access_token;
    tokenExpiry = now + (data.expires_in * 1000) - 60000; // buffer

    return cachedToken;
}

export { getAccessToken };
