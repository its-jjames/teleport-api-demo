import React, {useCallback, useMemo, useState, useEffect} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Film, Image as ImageIcon, HelpCircle, Trash2, Info, CheckCircle2 } from "lucide-react";
import { useDropzone } from "react-dropzone";

// Types
const RES_CHOICES = [1600, 2500, 3200] as const;
const ITER_MARKS = [7000, 20000, 30000, 40000] as const;

const PRESETS = [
    {
        id: "iphone-quick",
        name: "basic",
        desc: "faster processing with a smaller number of gaussians",
        res: 1600,
        iters: 7000,
        sh: 0 as 0 | 3,
        lod: true,
        splatAuto: true,
    },
    {
        id: "high-detail",
        name: "balanced",
        desc: "good detail and lighting for most datasets",
        res: 2500,
        iters: 20000,
        sh: 3 as 0 | 3,
        lod: true,
        splatAuto: true,
    },
    {
        id: "drone-dslr",
        name: "maximum",
        desc: "highest resolution and lighting detail, longer processing",
        res: 3200,
        iters: 30000,
        sh: 3 as 0 | 3,
        lod: true,
        splatAuto: true,
    },
] as const;

// accordion section keys
const ACCORDION_KEYS = ["res", "iters", "splats", "lighting", "lod", "export"] as const;
type AccordionKey = typeof ACCORDION_KEYS[number];

function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function estimateTime(iters: number, res: number, fileCount: number) {
    // very rough heuristic
    const base = iters / 7000; // 1x at 7k
    const resFactor = res / 1600; // 1x at 1600
    const dataFactor = Math.min(3, 0.5 + fileCount / 500); // cap impact
    const minutes = Math.round(8 * base * resFactor * dataFactor);
    return Math.max(4, minutes);
}

function qualityLabel(iters: number, res: number) {
    const score = iters / 7000 + res / 1600 - 1;
    if (score < 1.2) return { label: "good", intent: "default" as const };
    if (score < 2.2) return { label: "better", intent: "secondary" as const };
    return { label: "best", intent: "success" as const };
}

export default function TeleportUploadPage() {
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // theme handling: light/dark only
    const [dark, setDark] = useState<boolean>(() => (localStorage.getItem("theme:mode") ?? "dark") === "dark");
    useEffect(() => {
        const root = document.documentElement;
        if (dark) root.classList.add("dark");
        else root.classList.remove("dark");
        localStorage.setItem("theme:mode", dark ? "dark" : "light");
    }, [dark]);

    // dataset
    const [files, setFiles] = useState<File[]>([]);
    const [totalSize, setTotalSize] = useState(0);
    const [datasetError, setDatasetError] = useState<string | null>(null);

    // zip inspection state
    const [zipCounting, setZipCounting] = useState(false);
    const [zipImageCount, setZipImageCount] = useState<number | null>(null);
    const [zipCountError, setZipCountError] = useState<string | null>(null);

    const IMG_EXT = /\.(jpe?g|png|webp|heic|heif|tif?f)$/i;
    // dependency‑free central directory scan for image files
    async function countImagesInZip(file: File): Promise<number> {
        const buf = await file.arrayBuffer();
        const view = new DataView(buf);
        const sig = 0x504b0102; // 'PK\x01\x02'
        let i = 0,
            count = 0;
        while (i <= view.byteLength - 46) {
            if (view.getUint32(i, true) === sig) {
                const fnameLen = view.getUint16(i + 28, true);
                const extraLen = view.getUint16(i + 30, true);
                const commentLen = view.getUint16(i + 32, true);
                const nameStart = i + 46;
                const nameEnd = nameStart + fnameLen;
                if (nameEnd <= view.byteLength) {
                    const bytes = new Uint8Array(buf, nameStart, fnameLen);
                    let name = "";
                    for (let k = 0; k < bytes.length; k++) name += String.fromCharCode(bytes[k]);
                    if (!name.endsWith("/") && IMG_EXT.test(name)) count++;
                }
                i = nameStart + fnameLen + extraLen + commentLen; // next header
            } else {
                i++;
            }
        }
        return count;
    }

    const onDrop = useCallback(async (accepted: File[]) => {
        // enforce single file rule
        if (accepted.length !== 1) {
            setDatasetError("please select a single .zip (images) or a single .mp4/.mov (video)");
            return;
        }
        const file = accepted[0];
        const lower = file.name.toLowerCase();
        const isZip = lower.endsWith(".zip");
        const isMp4 = lower.endsWith(".mp4");
        const isMov = lower.endsWith(".mov");

        // reject loose images — API requires zip or a video
        if (!isZip && !isMp4 && !isMov) {
            setDatasetError("image files must be zipped. only a single .zip or a single .mp4/.mov is supported.");
            return;
        }

        setDatasetError(null);

        // set single file
        setFiles([file]);
        setVideoDuration(null);
        setTotalSize(file.size || 0);

        // reset zip counters
        setZipImageCount(null);
        setZipCountError(null);

        if (isMp4 || isMov) {
            try {
                const url = URL.createObjectURL(file);
                const video = document.createElement("video");
                video.preload = "metadata";
                video.onloadedmetadata = () => {
                    URL.revokeObjectURL(url);
                    setVideoDuration(video.duration);
                };
                video.src = url;
            } catch {}
        }

        if (isZip) {
            try {
                setZipCounting(true);
                const n = await countImagesInZip(file);
                setZipImageCount(n);
                if (n > 3000) setZipCountError("zip contains more than 3000 images (limit)");
            } catch (e: any) {
                setZipCountError(e?.message || "failed to inspect zip");
            } finally {
                setZipCounting(false);
            }
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: false,
        maxSize: 10 * 1024 * 1024 * 1024, // 10 GB
        accept: {
            "application/zip": [".zip"],
            "video/mp4": [".mp4"],
            "video/quicktime": [".mov"],
        },
    });

    const removeFile = (idx: number) => {
        const next = files.filter((_, i) => i !== idx);
        setFiles(next);
        setTotalSize(next.reduce((s, f) => s + (f.size || 0), 0));
        setZipImageCount(null);
        setZipCountError(null);
        setDatasetError(null);
    };

    const [name, setName] = useState("");

    // preset and tuning
    const [presetId, setPresetId] = useState<(typeof PRESETS)[number]["id"]>(PRESETS[0].id);
    const activePreset = PRESETS.find((p) => p.id === presetId)!;

    const [res, setRes] = useState<number>(activePreset.res);
    const [customRes, setCustomRes] = useState<string>("");
    const [iters, setIters] = useState<number>(activePreset.iters);
    const [sh, setSh] = useState<0 | 3>(activePreset.sh);
    const [lod, setLod] = useState<boolean>(activePreset.lod);
    const [splatAuto, setSplatAuto] = useState<boolean>(activePreset.splatAuto);
    const [splatManual, setSplatManual] = useState<number>(250000);

    // advanced accordion open state
    const [openAcc, setOpenAcc] = useState<string[]>(["splats"]);

    const [exportPly, setExportPly] = useState<boolean>(true);
    const [exportSog] = useState<boolean>(false); // disabled; contact us

    const [videoDuration, setVideoDuration] = useState<number | null>(null);

    // derived
    const fileCount = files.length;
    const minutes = useMemo(() => estimateTime(iters, res, fileCount), [iters, res, fileCount]);
    const qual = useMemo(() => qualityLabel(iters, res), [iters, res]);

    const tooManyImages = zipImageCount !== null && zipImageCount > 3000;
    const ready = name.trim().length > 1 && files.length === 1 && !tooManyImages && !zipCounting;
    const missing: string[] = [];
    if (!name) missing.push("name");
    if (files.length === 0) missing.push("dataset");
    if (zipCounting) missing.push("counting images…");
    if (tooManyImages) missing.push(">3000 images in zip");

    // handlers
    const applyPreset = (id: (typeof PRESETS)[number]["id"]) => {
        const p = PRESETS.find((pp) => pp.id === id)!;
        setPresetId(id);
        setRes(p.res);
        setIters(p.iters);
        setSh(p.sh);
        setLod(p.lod);
        setSplatAuto(p.splatAuto);
    };

    const iterationSliderValue = useMemo(() => {
        const min = 7000,
            max = 60000;
        const val = ((iters - min) / (max - min)) * 100;
        return Math.min(100, Math.max(0, val));
    }, [iters]);

    const onSliderChange = (vals: number[]) => {
        const min = 7000,
            max = 60000;
        const v = vals[0];
        const next = Math.round(min + (v / 100) * (max - min));
        setIters(next);
    };

    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadPhase, setUploadPhase] = useState<"idle" | "creating" | "uploading" | "completing" | "done">("idle");
    const [partsProgress, setPartsProgress] = useState({ done: 0, total: 0 });

    async function onSubmit() {
        setUploadError(null);
        if (!ready) return;
        if (zipCounting) {
            setUploadError("please wait for zip inspection to finish");
            return;
        }
        if (zipImageCount !== null && zipImageCount > 3000) {
            setUploadError("zip contains more than 3,000 images. trim your dataset or contact us.");
            return;
        }
        if (files.length !== 1) {
            setUploadError("please upload a single .zip (images) or a single .mp4/.mov (video)");
            return;
        }
        const file = files[0];
        const inputFmt = file.name.toLowerCase().endsWith(".zip") ? "bulk-images" : "video";
        try {
            setUploading(true);
            setUploadPhase("creating");
            // 1) create capture
            const created = await fetch("/.netlify/functions/create-capture", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: file.name, bytesize: file.size, input_data_format: inputFmt }),
            });
            if (!created.ok) {
                throw new Error(await created.text());
            }
            const { eid, num_parts, chunk_size } = await created.json();
            setPartsProgress({ done: 0, total: num_parts });

            // 2) upload parts
            setUploadPhase("uploading");
            const parts: { number: number; etag: string }[] = [];
            for (let partNo = 1; partNo <= num_parts; partNo++) {
                const urlResp = await fetch("/.netlify/functions/create-upload-url", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ eid, part_no: partNo, bytesize: file.size }),
                });
                if (!urlResp.ok) {
                    throw new Error(await urlResp.text());
                }
                const { upload_url } = await urlResp.json();
                const start = (partNo - 1) * chunk_size;
                const end = Math.min(start + chunk_size, file.size);
                const blob = file.slice(start, end);

                const put = await fetch(upload_url, { method: "PUT", body: blob });
                if (!put.ok) {
                    throw new Error(await put.text());
                }
                const etag = (put.headers.get("etag") || "").replace(/\"/g, "");
                parts.push({ number: partNo, etag });
                setPartsProgress((p) => ({ done: p.done + 1, total: p.total }));
            }

            // 3) complete
            setUploadPhase("completing");
            const doneResp = await fetch("/.netlify/functions/complete-upload", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ eid, parts }),
            });
            if (!doneResp.ok) {
                throw new Error(await doneResp.text());
            }
            setUploadPhase("done");
            alert("upload queued successfully");
        } catch (err: any) {
            console.error(err);
            setUploadError(err?.message || "upload failed");
        } finally {
            setUploading(false);
        }
    }

    return (
        <TooltipProvider>
            <div className="min-h-screen w-full bg-background">
                {/* Header */}
                <div className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight">upload images or video</h1>
                            <p className="text-sm text-muted-foreground">zip of images, mp4 or mov. max 10 GB.</p>
                        </div>
                        <div className="hidden md:flex items-center gap-3">
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">dark</span>
                                <Switch checked={dark} onCheckedChange={setDark} />
                            </div>
                            <Badge variant="outline">beta</Badge>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[1fr_360px]">
                    {/* Main */}
                    <div className="flex flex-col gap-6">
                        {/* Stepper */}
                        <div className="flex items-center gap-3 text-sm">
                            <Step n={1} label="dataset" active={step === 1} done={step > 1} onClick={() => setStep(1)} />
                            <Separator className="w-8" />
                            <Step n={2} label="preset" active={step === 2} done={step > 2} onClick={() => setStep(2)} />
                            <Separator className="w-8" />
                            <Step n={3} label="advanced" active={step === 3} done={false} onClick={() => setStep(3)} />
                        </div>

                        {step === 1 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">dataset</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div
                                        {...getRootProps()}
                                        className={
                                            "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition " +
                                            (isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:bg-muted/30")
                                        }
                                    >
                                        <input {...getInputProps()} />
                                        <Upload className="mb-3" />
                                        <p className="text-sm">drag and drop a file here</p>
                                        <p className="text-xs text-muted-foreground">or click to browse</p>
                                        <div className="mt-3 text-xs text-muted-foreground">accepted: .zip (RGB images inside), .mp4, .mov • single file only</div>
                                    </div>

                                    {files.length > 0 && (
                                        <div className="mt-6">
                                            <div className="mb-2 flex items-center justify-between">
                                                <div className="text-sm text-muted-foreground">
                                                    {files.length} file{files.length > 1 ? "s" : ""} • {formatBytes(totalSize)}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setFiles([]);
                                                        setTotalSize(0);
                                                        setZipImageCount(null);
                                                        setZipCountError(null);
                                                        setDatasetError(null);
                                                    }}
                                                >
                                                    clear
                                                </Button>
                                            </div>
                                            <ul className="max-h-64 overflow-auto rounded-lg border">
                                                {files.map((f, i) => (
                                                    <li key={i} className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0">
                                                        <div className="flex items-center gap-3 text-sm">
                                                            {f.type.startsWith("video/") ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                                                            <span className="truncate max-w-[36ch]" title={f.name}>
                                {f.name}
                              </span>
                                                            {videoDuration !== null && files.length === 1 && f.type.startsWith("video/") && (
                                                                <span className="text-xs text-muted-foreground"> • {(() => { const m = Math.floor(videoDuration / 60); const s = Math.floor(videoDuration % 60); return `${m}:${s.toString().padStart(2,'0')}`; })()}</span>
                                                            )}
                                                            <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                                                        </div>
                                                        <Button variant="ghost" size="icon" onClick={() => removeFile(i)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </li>
                                                ))}
                                            </ul>
                                            {files.length === 1 && files[0].name.toLowerCase().endsWith(".zip") && (
                                                <div className="mt-2 flex items-center justify-between text-xs">
                                                    <div className="text-muted-foreground">
                                                        {zipCounting && "inspecting zip…"}
                                                        {!zipCounting && zipImageCount !== null && (
                                                            <>
                                                                detected <span className="font-medium">{zipImageCount.toLocaleString()}</span> image
                                                                {zipImageCount === 1 ? "" : "s"} in zip
                                                            </>
                                                        )}
                                                    </div>
                                                    {!zipCounting && zipImageCount !== null && (
                                                        <div className={`text-right ${zipImageCount > 3000 ? "text-destructive" : "text-muted-foreground"}`}>
                                                            limit 3,000
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {datasetError && (
                                                <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                                                    {datasetError}
                                                </div>
                                            )}
                                            {zipCountError && (
                                                <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                                                    {zipCountError}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                                        <div>
                                            <Label htmlFor="name">name this capture</Label>
                                            <Input id="name" placeholder="e.g. lobby east wing" value={name} onChange={(e) => setName(e.target.value)} />
                                            <p className="mt-1 text-xs text-muted-foreground">used in links and search</p>
                                        </div>
                                        <div>
                                            <Label>tags (optional)</Label>
                                            <Input placeholder="comma separated" />
                                        </div>
                                    </div>

                                    <div className="mt-6 flex items-center justify-between">
                                        <Button variant="secondary" onClick={() => setStep(2)} disabled={!ready}>
                                            continue
                                        </Button>
                                        {!ready && <div className="text-xs text-muted-foreground">missing: {missing.join(", ")}</div>}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {step === 2 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">choose a preset</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        {PRESETS.map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => applyPreset(p.id)}
                                                className={`rounded-2xl border p-4 text-left transition hover:shadow ${
                                                    presetId === p.id ? "border-primary ring-2 ring-primary/30" : "border-muted-foreground/20"
                                                }`}
                                            >
                                                <div className="mb-1 font-medium">{p.name}</div>
                                                <div className="text-xs text-muted-foreground">{p.desc}</div>
                                                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                                    <Badge variant="outline">{p.res}px</Badge>
                                                    <Badge variant="outline">{p.iters.toLocaleString()} iters</Badge>
                                                    <Badge variant="outline">SH {p.sh}</Badge>
                                                    {p.lod && <Badge variant="outline">LOD on</Badge>}
                                                </div>
                                            </button>
                                        ))}
                                    </div>

                                    <div className="mt-6 flex items-center justify-between">
                                        <Button variant="secondary" onClick={() => setStep(3)}>
                                            open advanced
                                        </Button>
                                        <Button onClick={() => setStep(3)} className="hidden md:inline-flex">
                                            next
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {step === 3 && (
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                                    <CardTitle className="text-base">advanced settings</CardTitle>
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8"
                                            onClick={() => setOpenAcc([...ACCORDION_KEYS as unknown as string[]])}
                                        >
                                            expand all
                                        </Button>
                                        <span className="text-muted-foreground">/</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8"
                                            onClick={() => setOpenAcc([])}
                                        >
                                            collapse all
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Accordion type="multiple" value={openAcc} onValueChange={(v)=>setOpenAcc(v as string[])} className="w-full">
                                        {/* resolution */}
                                        <AccordionItem value="res">
                                            <AccordionTrigger>image resolution</AccordionTrigger>
                                            <AccordionContent>
                                                <RadioGroup
                                                    value={String(res)}
                                                    onValueChange={(v) => {
                                                        if (v === "custom") return;
                                                        setRes(Number(v));
                                                        setCustomRes("");
                                                    }}
                                                    className="grid gap-3 sm:grid-cols-4"
                                                >
                                                    {RES_CHOICES.map((r) => (
                                                        <Label
                                                            key={r}
                                                            className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${
                                                                res === r ? "border-primary" : "border-muted-foreground/20"
                                                            }`}
                                                        >
                                                            <RadioGroupItem value={String(r)} />
                                                            {r}px
                                                        </Label>
                                                    ))}
                                                    <Label
                                                        className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${
                                                            customRes ? "border-primary" : "border-muted-foreground/20"
                                                        }`}
                                                    >
                                                        <RadioGroupItem value="custom" />
                                                        <span>custom</span>
                                                        <Input
                                                            className="ml-2 h-8 w-24"
                                                            placeholder="px"
                                                            value={customRes}
                                                            onChange={(e) => {
                                                                setCustomRes(e.target.value);
                                                                const n = Number(e.target.value);
                                                                if (!Number.isNaN(n) && n > 600 && n < 8000) setRes(n);
                                                            }}
                                                        />
                                                    </Label>
                                                </RadioGroup>
                                                <p className="mt-2 text-xs text-muted-foreground">higher values increase detail and time.</p>
                                            </AccordionContent>
                                        </AccordionItem>

                                        {/* iterations */}
                                        <AccordionItem value="iters">
                                            <AccordionTrigger>training iterations</AccordionTrigger>
                                            <AccordionContent>
                                                <div className="px-1">
                                                    <Slider value={[iterationSliderValue]} onValueChange={onSliderChange} step={1} className="w-full" />
                                                    <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                                                        <span>7k</span>
                                                        <span>20k</span>
                                                        <span>30k</span>
                                                        <span>40k</span>
                                                        <span>60k</span>
                                                    </div>
                                                    <div className="mt-2 text-sm">{iters.toLocaleString()} iterations</div>
                                                    {iters > 30000 && (
                                                        <Alert className="mt-3">
                                                            <AlertDescription> diminishing returns beyond 30k for most phone datasets. </AlertDescription>
                                                        </Alert>
                                                    )}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>

                                        {/* splat count */}
                                        <AccordionItem value="splats">
                                            <AccordionTrigger>splat count</AccordionTrigger>
                                            <AccordionContent>
                                                <div className="flex items-center gap-3">
                                                    <Switch checked={splatAuto} onCheckedChange={setSplatAuto} />
                                                    <div className="text-sm">automatic</div>
                                                </div>
                                                {!splatAuto && (
                                                    <div className="mt-4 space-y-3">
                                                        {/* slider + input (log scale 250 .. 4,000,000) */}
                                                        <SplatSlider value={splatManual} onChange={setSplatManual} />
                                                        <div className="flex items-end gap-3">
                                                            <div>
                                                                <Label htmlFor="splat">manual limit</Label>
                                                                <Input
                                                                    id="splat"
                                                                    type="number"
                                                                    value={splatManual}
                                                                    onChange={(e) => {
                                                                        const min = 250,
                                                                            max = 4000000;
                                                                        const n = Number(e.target.value.replace(/[^0-9]/g, ""));
                                                                        if (Number.isNaN(n)) return;
                                                                        const clamped = Math.max(min, Math.min(max, n));
                                                                        setSplatManual(clamped);
                                                                    }}
                                                                    className="w-48"
                                                                />
                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                    range 250 to 4,000,000. <a href="/contact" className="underline underline-offset-2">contact us</a> for higher
                                                                    limits.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </AccordionContent>
                                        </AccordionItem>

                                        {/* lighting */}
                                        <AccordionItem value="lighting">
                                            <AccordionTrigger>lighting detail</AccordionTrigger>
                                            <AccordionContent>
                                                <RadioGroup value={String(sh)} onValueChange={(v) => setSh(Number(v) as 0 | 3)} className="flex gap-3">
                                                    {[0, 3].map((v) => (
                                                        <Label
                                                            key={v}
                                                            className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${
                                                                sh === v ? "border-primary" : "border-muted-foreground/20"
                                                            }`}
                                                        >
                                                            <RadioGroupItem value={String(v)} />
                                                            SH {v}
                                                        </Label>
                                                    ))}
                                                </RadioGroup>
                                                <p className="mt-2 text-xs text-muted-foreground">0 = faster, flatter. 3 = richer highlights.</p>
                                            </AccordionContent>
                                        </AccordionItem>

                                        {/* LOD */}
                                        <AccordionItem value="lod">
                                            <AccordionTrigger>level of detail</AccordionTrigger>
                                            <AccordionContent>
                                                <div className="flex items-center justify-between rounded-xl border p-3">
                                                    <div>
                                                        <div className="text-sm">enable LOD</div>
                                                        <div className="text-xs text-muted-foreground">reduces draw cost on web and VR. keep on unless exporting raw.</div>
                                                    </div>
                                                    <Switch checked={lod} onCheckedChange={setLod} />
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>

                                        {/* export */}
                                        <AccordionItem value="export">
                                            <AccordionTrigger>export</AccordionTrigger>
                                            <AccordionContent>
                                                <div className="flex flex-col gap-2">
                                                    <label className="flex items-center gap-3 text-sm">
                                                        <Checkbox checked={exportPly} onCheckedChange={(v) => setExportPly(Boolean(v))} /> .ply
                                                    </label>
                                                    <label className="flex items-center gap-3 text-sm">
                                                        <Checkbox checked={false} disabled /> .sog <span className="text-xs text-muted-foreground">for Varjo pipelines – contact us</span>
                                                    </label>
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Summary */}
                    <aside className="flex h-max flex-col gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">summary</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span>capture</span>
                                    <span className="truncate max-w-[18ch]" title={name || "—"}>
                    {name || "—"}
                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span>dataset</span>
                                    <span>
                    {files.length} file{files.length !== 1 ? "s" : ""} • {formatBytes(totalSize)}
                                        {zipImageCount !== null && ` • ${zipImageCount.toLocaleString()} images`}
                  </span>
                                </div>
                                <Separator />
                                {videoDuration !== null && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span>video duration</span>
                                        <span>{(() => { const m = Math.floor(videoDuration / 60); const s = Math.floor(videoDuration % 60); return `${m}:${s.toString().padStart(2,'0')}`; })()}</span>
                                    </div>) }
                                <Separator />
                                <div className="flex items-center justify-between text-sm">
                                    <span>resolution</span>
                                    <span>{res}px</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span>iterations</span>
                                    <span>{iters.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span>lighting</span>
                                    <span>SH {sh}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span>LOD</span>
                                    <span>{lod ? "on" : "off"}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span>export</span>
                                    <span>{[exportPly ? ".ply" : null, false ? ".sog" : null].filter(Boolean).join(", ") || "—"}</span>
                                </div>
                                <Separator />
                                <div className="flex items-center justify-between text-sm">
                                    <span>time estimate</span>
                                    <span>{minutes} min</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm">expected quality</span>
                                    <Badge variant={qual.intent as any}>{qual.label}</Badge>
                                </div>
                                <div>
                                    <div className="mb-1 text-xs text-muted-foreground">quota</div>
                                    <Progress value={Math.min(100, (files.length / 50) * 100)} />
                                    <div className="mt-1 text-xs text-muted-foreground">demo only</div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-4 text-xs text-muted-foreground">
                                tips
                                <ul className="mt-2 list-disc pl-5">
                                    <li>avoid motion blur and big exposure jumps</li>
                                    <li>cover the space in overlapping passes</li>
                                    <li>mix wide shots with details for best results</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </aside>
                </div>

                {/* Sticky footer */}
                <div className="sticky bottom-0 z-30 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-3">
                        {uploadError && (
                            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">{uploadError}</div>
                        )}
                        {uploading && (
                            <div className="flex items-center justify-between text-sm">
                                <div>
                                    phase: {uploadPhase} • parts {partsProgress.done}/{partsProgress.total}
                                </div>
                                <Progress value={partsProgress.total ? (partsProgress.done / partsProgress.total) * 100 : 0} className="w-56" />
                            </div>
                        )}
                        <div className="flex items-center justify-between gap-4">
                            {!ready ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Info className="h-4 w-4" /> missing: {missing.join(", ")}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <CheckCircle2 className="h-4 w-4 text-green-600" /> {uploading ? "uploading…" : "ready to upload"}
                                </div>
                            )}
                            <div className="flex items-center gap-3">
                                <Button variant="secondary" onClick={() => setStep(((step > 1 ? step - 1 : 1) as 1 | 2 | 3))} disabled={uploading}>
                                    back
                                </Button>
                                <Button disabled={!ready || uploading} onClick={onSubmit}>
                                    {uploading ? "working…" : "upload capture"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}

function Step({ n, label, active, done, onClick }: { n: number; label: string; active: boolean; done: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} className="group flex items-center gap-3">
            <div
                className={`grid h-8 w-8 place-items-center rounded-full border text-sm font-medium transition ${
                    done
                        ? "bg-green-600 text-white border-green-600"
                        : active
                            ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/30"
                            : "bg-muted text-foreground border-border"
                }`}
            >
                {n}
            </div>
            <div className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>{label}</div>
        </button>
    );
}

// helper: log scale slider for splat count
function SplatSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const min = 250,
        max = 4000000;
    const toPct = (val: number) => {
        const t = (Math.log(val) - Math.log(min)) / (Math.log(max) - Math.log(min));
        return Math.round(Math.min(100, Math.max(0, t * 100)));
    };
    const fromPct = (pct: number) => {
        const t = pct / 100;
        const val = Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)));
        return Math.round(val);
    };
    const sliderVal = React.useMemo(() => [toPct(value)], [value]);
    return (
        <div>
            <Slider value={sliderVal} onValueChange={(arr) => onChange(fromPct(arr[0]))} step={1} className="w-full" />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>250</span>
                <span>10k</span>
                <span>100k</span>
                <span>1m</span>
                <span>4m</span>
            </div>
        </div>
    );
}

/*
Test cases (manual/visual):
1) Drop multiple files → error banner "please select a single .zip..."
2) Drop a loose JPG → error banner "image files must be zipped..."
3) Drop a small ZIP with 2 images → shows "detected 2 images in zip" and enables Continue.
4) Drop a ZIP with >3000 images (simulated) → shows limit warning and blocks Continue.
5) Toggle dark switch → theme flips and persists on reload.
6) Splat slider manual mode → input clamps between 250 and 4,000,000.
7) Upload a single .mov or .mp4 → video duration appears both in the file list and in the summary as mm:ss.
8) Click “expand all” / “collapse all” in advanced → all accordion sections open/close without layout shift.
*/
