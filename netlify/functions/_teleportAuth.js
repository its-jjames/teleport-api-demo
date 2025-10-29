// ESM module
export async function getTeleportToken() {
    const res = await fetch("https://signin.teleport.varjo.com/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            grant_type: "client_credentials",
            client_id: process.env.TELEPORT_CLIENT_ID,
            client_secret: process.env.TELEPORT_CLIENT_SECRET,
            scope: process.env.TELEPORT_OAUTH_SCOPE || "openid profile email"
        })
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`token error ${res.status} ${body}`);
    }
    const data = await res.json();
    return data.access_token;
}

export function apiBase() {
    return process.env.TELEPORT_API_BASE || "https://teleport.varjo.com";
}
