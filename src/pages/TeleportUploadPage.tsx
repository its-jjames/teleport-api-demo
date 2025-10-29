import React, { useCallback, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Film, Image as ImageIcon, Trash2, Info, CheckCircle2 } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { uploadToTeleport } from "../lib/uploadToTeleport";
import { cn } from "@/lib/utils";



// Types & presets
const RES_CHOICES = [1600, 2500, 3200] as const;

const PRESETS = [
    { id: "basic", name: "basic", desc: "fast result for quick previews", res: 1600, iters: 7000, sh: 0 as 0|3, lod: true, splatAuto: true },
    { id: "balanced", name: "balanced", desc: "good quality without long waits", res: 2500, iters: 20000, sh: 3 as 0|3, lod: true, splatAuto: true },
    { id: "maximum", name: "maximum", desc: "highest quality; longer processing", res: 3200, iters: 30000, sh: 3 as 0|3, lod: true, splatAuto: true },
] as const;

function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function estimateTime(iters: number, res: number, fileCount: number) {
    const base = iters / 7000;
    const resFactor = res / 1600;
    const dataFactor = Math.min(3, 0.5 + fileCount / 500);
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

    // dataset
    const [files, setFiles] = useState<File[]>([]);
    const [totalSize, setTotalSize] = useState(0);
    const [datasetError, setDatasetError] = useState<string | null>(null);
    const [zipCounting, setZipCounting] = useState(false);
    const [zipImageCount, setZipImageCount] = useState<number | null>(null);
    const [zipCountError, setZipCountError] = useState<string | null>(null);
    const [videoInspecting, setVideoInspecting] = useState(false);
    const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
    const [videoError, setVideoError] = useState<string | null>(null);

    // upload runtime state
    const [uploading, setUploading] = useState(false);
    const [uploadPhase, setUploadPhase] = useState<"idle"|"creating"|"uploading"|"completing"|"done">("idle");
    const [partsProgress, setPartsProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
    const [uploadError, setUploadError] = useState<string | null>(null);

    const onDrop = useCallback(async (accepted: File[]) => {
        // enforce single file input and validate type
        if (accepted.length !== 1) {
            setDatasetError("please upload a single .zip (images) or a single .mp4 (video)");
            return;
        }
        const file = accepted[0];
        const lower = file.name.toLowerCase();
        const isZip = lower.endsWith(".zip");
        const isMp4 = lower.endsWith(".mp4");
        const isMov = lower.endsWith(".mov");

        // reset counters
        setZipImageCount(null);
        setZipCountError(null);
        setVideoDurationSec(null);
        setVideoError(null);

        if (isMov) {
            setDatasetError(".mov is not supported yet — please convert to .mp4");
            return;
        }
        if (!isZip && !isMp4) {
            setDatasetError("please upload a single .zip (images) or a single .mp4 (video)");
            return;
        }

        setDatasetError(null);
        setFiles([file]);
        setTotalSize(file.size || 0);

        if (isZip) {
            try {
                setZipCounting(true);
                const n = await countImagesInZip(file);
                setZipImageCount(n);
                if (n > 3000) setZipCountError("zip contains more than 3000 images (limit)");
            } catch (e:any) {
                setZipCountError(e?.message || "failed to inspect zip");
            } finally {
                setZipCounting(false);
            }
        }

        if (isMp4) {
            try {
                setVideoInspecting(true);
                const url = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.src = url;
                await new Promise<void>((resolve, reject)=>{
                    const onLoaded = ()=>{ resolve(); };
                    const onError = ()=>{ reject(new Error('cannot read video metadata')); };
                    video.addEventListener('loadedmetadata', onLoaded, { once: true });
                    video.addEventListener('error', onError, { once: true });
                });
                setVideoDurationSec(video.duration || 0);
                URL.revokeObjectURL(url);
            } catch (e:any) {
                setVideoError(e?.message || 'failed to read video duration');
            } finally {
                setVideoInspecting(false);
            }
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: false,
        maxSize: 10 * 1024 * 1024 * 1024, // 10 GB
        accept: {
            "application/zip": [".zip"],
            "video/mp4": [".mp4"]
        }
    });

    const removeFile = (idx: number) => {
        const next = files.filter((_, i) => i !== idx);
        setFiles(next);
        setTotalSize(next.reduce((s, f) => s + (f.size || 0), 0));
        setDatasetError(null);
        setZipImageCount(null);
        setZipCountError(null);
        setZipCounting(false);
        setVideoDurationSec(null);
        setVideoError(null);
        setVideoInspecting(false);
    };

    const [name, setName] = useState("");

    // preset and tuning
    const [advancedOpen, setAdvancedOpen] = useState<string[]>(["splats"]);
    const [presetId, setPresetId] = useState<(typeof PRESETS)[number]["id"]>(PRESETS[0].id);
    const activePreset = PRESETS.find(p => p.id === presetId)!;

    const [res, setRes] = useState<number>(activePreset.res);
    const [customRes, setCustomRes] = useState<string>("");
    const [iters, setIters] = useState<number>(activePreset.iters);
    const [sh, setSh] = useState<0 | 3>(activePreset.sh);
    const [lod, setLod] = useState<boolean>(activePreset.lod);
    const [splatAuto, setSplatAuto] = useState<boolean>(activePreset.splatAuto);
    const [splatManual, setSplatManual] = useState<number>(250000);

    const [exportPly, setExportPly] = useState<boolean>(true);
    const [exportSog] = useState<boolean>(false); // disabled – contact us

    // derived
    const fileCount = files.length;
    const minutes = useMemo(() => estimateTime(iters, res, fileCount), [iters, res, fileCount]);
    const qual = useMemo(() => qualityLabel(iters, res), [iters, res]);

    const ready = name.trim().length > 1 && files.length === 1;
    const missing: string[] = [];
    if (!name) missing.push("name");
    if (files.length === 0) missing.push("dataset");

    // handlers
    const applyPreset = (id: (typeof PRESETS)[number]["id"]) => {
        const p = PRESETS.find(pp => pp.id === id)!;
        setPresetId(id);
        setRes(p.res);
        setIters(p.iters);
        setSh(p.sh);
        setLod(p.lod);
        setSplatAuto(p.splatAuto);
    };

    const iterationSliderValue = useMemo(() => {
        const min = 7000, max = 60000;
        const val = ((iters - min) / (max - min)) * 100;
        return Math.min(100, Math.max(0, val));
    }, [iters]);

    const onSliderChange = (vals: number[]) => {
        const min = 7000, max = 60000;
        const v = vals[0];
        const next = Math.round(min + (v / 100) * (max - min));
        setIters(next);
    };

    const onSubmit = async () => {
        // you said validation happens elsewhere; we just send the file
        if (files.length !== 1) {
            setUploadError("Please select a file to upload");
            return;
        }

        setUploadError(null);
        setUploading(true);
        setUploadPhase("idle");
        setPartsProgress({ done: 0, total: 0 });

        try {
            await uploadToTeleport({
                file: files[0],
                concurrency: 4,
                onPhase: (phase) => {
                    setUploadPhase(phase);
                },
                onPartProgress: (done, total) => {
                    setPartsProgress({ done, total });
                }
            });

            // Move to next step or show success message
            setStep(3); // Assuming step 3 is your success view
        } catch (error: any) {
            setUploadError(error?.message || "Upload failed");
            console.error("Upload error:", error);
        } finally {
            setUploading(false);
        }

    };

    // Utility function to calculate progress percentage
    const getProgressPercent = () => {
        if (uploadPhase === "idle") return 0;
        if (uploadPhase === "creating") return 5;
        if (uploadPhase === "uploading") {
            if (partsProgress.total === 0) return 10;
            // Uploading takes up 75% of the progress (from 10% to 85%)
            return 10 + Math.round((partsProgress.done / partsProgress.total) * 75);
        }
        if (uploadPhase === "completing") return 85;
        if (uploadPhase === "done") return 100;
        return 0;
    };

    // Utility function to get phase description
    const getPhaseText = () => {
        switch (uploadPhase) {
            case "idle": return "Ready to upload";
            case "creating": return "Initializing upload...";
            case "uploading": return `Uploading... ${partsProgress.done} of ${partsProgress.total} parts`;
            case "completing": return "Finalizing upload...";
            case "done": return "Upload complete!";
            default: return "";
        }
    };



    return (
        <div className="min-h-screen w-full bg-background">
            {/* Header */}
            <div className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">upload images or video</h1>
                        <p className="text-sm text-muted-foreground">zip of images or mp4. max 10 GB.</p>
                    </div>
                    <div className="hidden md:flex items-center gap-3">
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
                        <Step n={1} label="dataset" active={step===1} done={step>1} onClick={()=>setStep(1)} />

                        <Step n={2} label="preset" active={step===2} done={step>2} onClick={()=>setStep(2)} />

                        <Step n={3} label="advanced" active={step===3} done={false} onClick={()=>setStep(3)} />
                    </div>

                    {step === 1 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">dataset</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div {...getRootProps()} className={"border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition " + (isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:bg-muted/30") }>
                                    <input {...getInputProps()} />
                                    <Upload className="mb-3" />
                                    <p className="text-sm">drag and drop files here</p>
                                    <p className="text-xs text-muted-foreground">or click to browse</p>
                                    <div className="mt-3 text-xs text-muted-foreground">accepted: .zip (images) or .mp4 • single file only.</div>
                                </div>

                                {files.length > 0 && (
                                    <div className="mt-6">
                                        <div className="mb-2 flex items-center justify-between">
                                            <div className="text-sm text-muted-foreground">{files.length} file{files.length>1?'s':''} • {formatBytes(totalSize)}</div>
                                            <Button variant="ghost" size="sm" onClick={()=>{setFiles([]); setTotalSize(0); setDatasetError(null); setZipImageCount(null); setZipCountError(null); setZipCounting(false); setVideoDurationSec(null); setVideoError(null); setVideoInspecting(false);}}>clear</Button>
                                        </div>
                                        <ul className="max-h-64 overflow-auto rounded-lg border">
                                            {files.map((f, i)=> (
                                                <li key={i} className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0">
                                                    <div className="flex items-center gap-3 text-sm">
                                                        {f.type.startsWith("video/") ? <Film className="h-4 w-4"/> : <ImageIcon className="h-4 w-4"/>}
                                                        <span className="truncate max-w-[36ch]" title={f.name}>{f.name}</span>
                                                        <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                                                    </div>
                                                    <Button variant="ghost" size="icon" onClick={()=>{removeFile(i); setDatasetError(null);}}>
                                                        <Trash2 className="h-4 w-4"/>
                                                    </Button>
                                                </li>
                                            ))}
                                        </ul>
                                        {files.length === 1 && files[0].name.toLowerCase().endsWith(".zip") && (
                                            <div className="mt-2 flex items-center justify-between text-xs">
                                                <div className="text-muted-foreground">
                                                    {zipCounting && "inspecting zip…"}
                                                    {!zipCounting && zipImageCount !== null && (
                                                        <>detected <span className="font-medium">{zipImageCount.toLocaleString()}</span> image{zipImageCount === 1 ? "" : "s"} in zip</>
                                                    )}
                                                    {!zipCounting && zipCountError && (
                                                        <span className="text-destructive">{zipCountError}</span>
                                                    )}
                                                </div>
                                                {!zipCounting && zipImageCount !== null && (
                                                    <div className={`text-right ${zipImageCount > 3000 ? "text-destructive" : "text-muted-foreground"}`}>limit 3,000</div>
                                                )}
                                            </div>
                                        )}
                                        {files.length === 1 && files[0].name.toLowerCase().endsWith(".mp4") && (
                                            <div className="mt-2 text-xs text-muted-foreground">
                                                {videoInspecting && "reading video…"}
                                                {!videoInspecting && videoDurationSec !== null && (
                                                    <>duration <span className="font-medium">{formatDuration(videoDurationSec)}</span></>
                                                )}
                                                {!videoInspecting && videoError && (
                                                    <span className="text-destructive">{videoError}</span>
                                                )}
                                            </div>
                                        )}
                                        {datasetError && (
                                            <Alert variant="destructive" className="mt-3">
                                                <AlertDescription>{datasetError}</AlertDescription>
                                            </Alert>
                                        )}
                                    </div>
                                )}

                                <div className="mt-6 grid gap-4 md:grid-cols-2">
                                    <div>
                                        <Label htmlFor="name">name this capture</Label>
                                        <Input id="name" placeholder="e.g. lobby east wing" value={name} onChange={(e)=>setName(e.target.value)} />
                                        <p className="mt-1 text-xs text-muted-foreground">used in links and search</p>
                                    </div>
                                    <div>
                                        <Label>tags (optional)</Label>
                                        <Input placeholder="comma separated" />
                                    </div>
                                </div>

                                <div className="mt-6 flex items-center justify-between">
                                    <Button variant="secondary" onClick={()=>setStep(2)} disabled={!ready}>continue</Button>
                                    {!ready && (
                                        <div className="text-xs text-muted-foreground">missing: {missing.join(", ")}</div>
                                    )}
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
                                    {PRESETS.map(p=> (
                                        <button key={p.id} onClick={()=>applyPreset(p.id)} className={`rounded-2xl border p-4 text-left transition hover:shadow ${presetId===p.id? 'border-primary ring-2 ring-primary/30' : 'border-muted-foreground/20'}`}>
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
                                    <Button variant="secondary" onClick={()=>setStep(3)}>open advanced</Button>
                                    <Button onClick={()=>setStep(3)} className="hidden md:inline-flex">next</Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {step === 3 && (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-base">advanced settings</CardTitle>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={()=>setAdvancedOpen(["res","iters","splats","lighting","lod","export"])}>expand all</Button>
                                    <Button variant="ghost" size="sm" onClick={()=>setAdvancedOpen([])}>collapse all</Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Accordion type="multiple" value={advancedOpen} onValueChange={(v)=>setAdvancedOpen(v as string[])} className="w-full">
                                    {/* resolution */}
                                    <AccordionItem value="res">
                                        <AccordionTrigger>image resolution</AccordionTrigger>
                                        <AccordionContent>
                                            <RadioGroup value={String(res)} onValueChange={(v)=>{ if (v === 'custom') return; setRes(Number(v)); setCustomRes(''); }} className="grid gap-3 sm:grid-cols-4">
                                                {RES_CHOICES.map(r=> (
                                                    <Label key={r} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${res===r? 'border-primary' : 'border-muted-foreground/20'}`}>
                                                        <RadioGroupItem value={String(r)} />
                                                        {r}px
                                                    </Label>
                                                ))}
                                                <Label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${customRes? 'border-primary' : 'border-muted-foreground/20'}`}>
                                                    <RadioGroupItem value="custom" />
                                                    <span>custom</span>
                                                    <Input className="ml-2 h-8 w-24" placeholder="px" value={customRes} onChange={(e)=>{ setCustomRes(e.target.value); const n = Number(e.target.value); if (!Number.isNaN(n) && n>600 && n<8000) setRes(n); }} />
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
                                                    <span>7k</span><span>20k</span><span>30k</span><span>40k</span><span>60k</span>
                                                </div>
                                                <div className="mt-2 text-sm">{iters.toLocaleString()} iterations</div>
                                                {iters>30000 && (
                                                    <Alert className="mt-3">
                                                        <AlertDescription>
                                                            diminishing returns beyond 30k for most phone datasets.
                                                        </AlertDescription>
                                                    </Alert>
                                                )}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>

                                    {/* splat count */}
                                    <AccordionItem value="splats">
                                        <AccordionTrigger>splat count</AccordionTrigger>
                                        <AccordionContent>
                                            <div className="flex items-center gap-3 mb-4">
                                                <Switch checked={splatAuto} onCheckedChange={setSplatAuto} className="data-[state=checked]:bg-primary"
                                                />
                                                <div className="text-sm">automatic</div>
                                            </div>
                                            {!splatAuto && (
                                                <div className="space-y-3">
                                                    <Slider
                                                        value={[logToPct(splatManual)]}
                                                        onValueChange={(v)=> setSplatManual(pctToLog(v[0]))}
                                                        step={1}
                                                        className="w-full"
                                                    />
                                                    <div className="flex justify-between text-xs text-muted-foreground">
                                                        <span>250</span>
                                                        <span>10k</span>
                                                        <span>100k</span>
                                                        <span>1m</span>
                                                        <span>4m</span>
                                                    </div>
                                                    <div className="flex items-end gap-3">
                                                        <div>
                                                            <Label htmlFor="splat">manual limit</Label>
                                                            <Input
                                                                id="splat"
                                                                type="number"
                                                                value={splatManual}
                                                                onChange={(e)=>{
                                                                    const min=250, max=4000000;
                                                                    const n = Number(e.target.value.replace(/[^0-9]/g, ""));
                                                                    if (!Number.isNaN(n)) setSplatManual(Math.max(min, Math.min(max, n)));
                                                                }}
                                                                className="w-48"
                                                            />
                                                            <p className="mt-1 text-xs text-muted-foreground">range 250 to 4,000,000. contact us for more.</p>
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
                                            <RadioGroup value={String(sh)} onValueChange={(v)=>setSh(Number(v) as 0|3)} className="flex gap-3">
                                                {[0,3].map(v=> (
                                                    <Label key={v} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${sh===v? 'border-primary' : 'border-muted-foreground/20'}`}>
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
                                                    <div className="text-xs text-muted-foreground">Improves performance on lower end hardware. Keep on unless exporting raw.</div>
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
                                                <label className="flex items-center gap-3 text-sm"><Checkbox checked={exportPly} onCheckedChange={(v)=>setExportPly(Boolean(v))} /> .ply</label>
                                                <label className="flex items-center gap-3 text-sm"><Checkbox checked={false} disabled /> .sog <span className="text-xs text-muted-foreground">for Varjo pipelines – contact us</span></label>
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
                                <span className="truncate max-w-[18ch]" title={name || "—"}>{name || "—"}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span>dataset</span>
                                <span>{files.length} file{files.length!==1?"s":""} • {formatBytes(totalSize)}{zipImageCount!==null && ` • ${zipImageCount.toLocaleString()} images`}{videoDurationSec!==null && ` • ${formatDuration(videoDurationSec)}`}</span>
                            </div>
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
                                <span>{lod? "on" : "off"}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span>export</span>
                                <span>{[exportPly?".ply":null, false?".sog":null].filter(Boolean).join(", ") || "—"}</span>
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
                                <Progress value={Math.min(100, files.length/50*100)} />
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
            {/* Sticky footer */}
            <div className="sticky bottom-0 z-30 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
                    {!ready ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Info className="h-4 w-4"/> missing: {missing.join(", ")}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle2 className="h-4 w-4 text-green-600"/> ready to upload
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <Button variant="secondary" onClick={()=>setStep(Math.max(1, step-1) as 1 | 2 | 3)}>back</Button>
                        <Button disabled={!ready || uploading} onClick={onSubmit}>
                            {uploading ? 'Uploading...' : 'upload capture'}
                        </Button>
                    </div>
                </div>

                {/* Add progress bar here */}
                {(uploading || uploadPhase !== "idle") && (
                    <div className="mx-auto max-w-7xl px-6 pb-3 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>{getPhaseText()}</span>
                            <span>{getProgressPercent()}%</span>
                        </div>
                        <Progress
                            value={getProgressPercent()}
                            className={cn(
                                "transition-all duration-300",
                                uploadPhase === "done" ? "bg-green-500" : ""
                            )}
                        />

                        {uploadError && (
                            <div className="mt-2 text-sm text-red-500">
                                {uploadError}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// log scale helpers
function logToPct(val:number){
    const min=250, max=4000000;
    const t = (Math.log(val) - Math.log(min)) / (Math.log(max) - Math.log(min));
    return Math.round(Math.min(100, Math.max(0, t*100)));
}

function pctToLog(pct:number){
    const min=250, max=4000000;
    const t = pct/100;
    return Math.round(Math.exp(Math.log(min) + t*(Math.log(max)-Math.log(min))));
}

function formatDuration(sec:number){
    if (!isFinite(sec) || sec<=0) return '0s';
    const m = Math.floor(sec/60);
    const s = Math.round(sec%60);
    return m? `${m}m ${s}s` : `${s}s`;
}

async function countImagesInZip(file: File): Promise<number> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // find End of Central Directory (EOCD) signature 0x06054b50 within last 64KB
    let eocdIndex = -1;
    const minIndex = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= minIndex; i--) {
        if (bytes[i] === 0x50 && bytes[i+1] === 0x4b && bytes[i+2] === 0x05 && bytes[i+3] === 0x06) { eocdIndex = i; break; }
    }
    if (eocdIndex === -1) throw new Error('could not find zip directory');
    const eocd = new DataView(buf, eocdIndex);
    const cdSize = eocd.getUint32(12, true);
    const cdOffset = eocd.getUint32(16, true);
    let ptr = cdOffset;
    const end = cdOffset + cdSize;
    let count = 0;
    const isImg = (name:string)=>/\.(jpe?g|png|webp|bmp|tiff?)$/i.test(name);
    const td = new TextDecoder('utf-8');
    while (ptr < end) {
        // central directory header signature 0x02014b50
        if (!(bytes[ptr] === 0x50 && bytes[ptr+1] === 0x4b && bytes[ptr+2] === 0x01 && bytes[ptr+3] === 0x02)) break;
        const view = new DataView(buf, ptr);
        const nameLen = view.getUint16(28, true);
        const extraLen = view.getUint16(30, true);
        const commentLen = view.getUint16(32, true);
        const nameBytes = bytes.slice(ptr + 46, ptr + 46 + nameLen);
        const name = td.decode(nameBytes);
        if (isImg(name)) count++;
        ptr += 46 + nameLen + extraLen + commentLen;
    }
    return count;
}

function Step({n, label, active, done, onClick}:{n:number,label:string,active:boolean,done:boolean,onClick:()=>void}){
    return (
        <button onClick={onClick} className="group flex items-center gap-2">
            <div className={`grid h-7 w-7 place-items-center rounded-full text-xs ${done? 'bg-green-600 text-white' : active? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{n}</div>
            <div className={`text-sm ${active? 'font-medium' : 'text-muted-foreground'}`}>{label}</div>
        </button>
    );
}
