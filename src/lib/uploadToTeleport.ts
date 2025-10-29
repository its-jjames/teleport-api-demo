// src/lib/uploadToTeleport.ts
type Part = { number: number; etag: string };

export async function uploadToTeleport(opts: {
    file: File;
    concurrency?: number;
    onPhase?: (p: "creating"|"uploading"|"completing"|"done") => void;
    onPartProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
}) {
    const { file, concurrency = 4, onPhase, onPartProgress, signal } = opts;

    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
    const fetchJSON = async (url: string, init?: RequestInit) => {
        const r = await fetch(url, { ...init, signal });
        if (!r.ok) throw new Error(await r.text());
        return r.json();
    };
    const putWithRetry = async (uploadUrl: string, blob: Blob, maxRetries = 3): Promise<string> => {
        let attempt = 0;
        while (true) {
            try {
                const resp = await fetch(uploadUrl, { method: "PUT", body: blob, signal });
                if (!resp.ok) throw new Error(`s3 put failed ${resp.status}`);
                const etagRaw = resp.headers.get("ETag");
                if (!etagRaw) throw new Error("missing ETag from s3");
                return etagRaw.replace(/"/g, "");
            } catch (err) {
                attempt++;
                if (attempt > maxRetries) throw err;
                await sleep(500 * Math.pow(2, attempt - 1));
            }
        }
    };

    // 1) create capture
    onPhase?.("creating");
    const input_data_format = file.name.toLowerCase().endsWith(".zip") ? "bulk-images" : "video";
    const { eid, num_parts, chunk_size } = await fetchJSON("/.netlify/functions/teleport-create-capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, bytesize: file.size, input_data_format }),
    });

    onPartProgress?.(0, num_parts);

    // 2) upload parts
    onPhase?.("uploading");
    const parts: Part[] = [];
    let next = 1;
    let active = 0;
    let done = 0;

    await new Promise<void>((resolve, reject) => {
        const kick = () => {
            if (next > num_parts && active === 0) return resolve();
            while (active < concurrency && next <= num_parts) {
                const partNo = next++;
                active++;
                (async () => {
                    try {
                        const { upload_url } = await fetchJSON("/.netlify/functions/teleport-upload-url", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ eid, part_no: partNo, bytesize: file.size }),
                        });

                        const start = (partNo - 1) * chunk_size;
                        const end = Math.min(start + chunk_size, file.size);
                        const blob = file.slice(start, end);

                        const etag = await putWithRetry(upload_url, blob);
                        parts.push({ number: partNo, etag });
                        done += 1;
                        onPartProgress?.(done, num_parts);
                    } catch (e) {
                        reject(e);
                        return;
                    } finally {
                        active--;
                        kick();
                    }
                })();
            }
        };
        kick();
    });

    parts.sort((a, b) => a.number - b.number);

    // 3) complete
    onPhase?.("completing");
    await fetchJSON("/.netlify/functions/teleport-complete-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eid, parts }),
    });

    onPhase?.("done");
    return { eid };
}
