import { useState, useEffect } from "react";
import { useWallet } from "../context/WalletContext";
import {
    GitBranch,
    Plus,
    Trash2,
    ArrowDown,
    Download,
    Play,
    Search,
    Globe,
    Keyboard,
    Brain,
    Package,
    Zap,
    Settings2,
    Clock,
    AlertCircle,
    CheckCircle2
} from "lucide-react";

import { isServiceAllowed } from "../lib/contracts";
import { getSavedAgents } from "../lib/agentKeys";

// ─── Types ───────────────────────────────────────────
interface PipelineStep {
    id: string;
    type: "x402-service" | "llm-analysis";
    // Service step fields
    source?: "marketplace" | "manual";
    service?: string;
    url?: string;
    maxPrice?: number;
    serviceAddress?: string;
    // LLM step fields
    llmProvider?: "openrouter-free" | "custom";
    llmModel?: string;
    llmApiKey?: string;
    llmPrompt?: string;
    // Condition
    condition?: {
        dependsOn: string;
        field: string;
        operator: ">" | "<" | "==" | "!=" | "contains";
        value: string;
    };
}

interface Pipeline {
    id: string;
    name: string;
    steps: PipelineStep[];
    delivery: "terminal" | "webhook" | "api";
    webhookUrl?: string;
    scheduleInterval?: number;
    createdAt: string;
    owner?: string; 
}

// ─── Marketplace Service type ───
interface MarketService {
    name: string;
    url: string;
    pricePerCall: number;
    description: string;
    ownerAddress: string;
}

// Hardcoded marketplace services — same as Services page
// In production, this would come from the on-chain service registry
// const HARDCODED_MARKETPLACE: MarketService[] = [
//     { 
//         name: "Price Feed", 
//         url: "http://localhost:3402/api/price-feed", 
//         pricePerCall: 500000, 
//         description: "Real-time crypto price data",
//         ownerAddress: "STEZW9BF0WATG4DXJTHBFP8WKKEANCY70059MHKW" // ✅ actual service address
//     },
//     { 
//         name: "Text Summarizer", 
//         url: "http://localhost:3402/api/summarize", 
//         pricePerCall: 1000000, 
//         description: "AI-powered text summarization",
//         ownerAddress: "ST2RXHMZKSQSTMK15JEQK4KP5N2YE66F999A7FSXE" // ✅
//     },
// ];

// ─── Constants ───
const OPERATORS = [
    { value: ">", label: ">" },
    { value: "<", label: "<" },
    { value: "==", label: "==" },
    { value: "!=", label: "!=" },
    { value: "contains", label: "contains" },
];

const LLM_MODELS = [
    { value: "openrouter/free", label: "Free Models Router (auto-select)" },
    { value: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (Free)" },
    { value: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1 (Free)" },
    { value: "nvidia/llama-3.1-nemotron-70b-instruct:free", label: "Nemotron 70B (Free)" },
];

// ─── Storage helpers ─────────────────────────────────
function loadPipelines(): Pipeline[] {
    try {
        return JSON.parse(localStorage.getItem("kova-pipelines") || "[]");
    } catch {
        return [];
    }
}

function savePipelines(pipelines: Pipeline[]) {
    localStorage.setItem("kova-pipelines", JSON.stringify(pipelines));
}

// ─── Component ───────────────────────────────────────
export default function Pipelines() {
    const { address } = useWallet();
    const [pipelines, setPipelines] = useState<Pipeline[]>(loadPipelines());
    const [showBuilder, setShowBuilder] = useState(false);
    const [expandedPipeline, setExpandedPipeline] = useState<string | null>(null);
    const [runResults, setRunResults] = useState<Record<string, any>>({});
    const [runningId, setRunningId] = useState<string | null>(null);

    // Builder state
    const [pipelineName, setPipelineName] = useState("");
    const [steps, setSteps] = useState<PipelineStep[]>([]);
    const [delivery, setDelivery] = useState<"terminal" | "webhook" | "api">("terminal");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [scheduleInterval, setScheduleInterval] = useState<number | undefined>(undefined);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Marketplace services
    const [marketServices, setMarketServices] = useState<MarketService[]>([]);
    const [loadingMarket, setLoadingMarket] = useState(false);

    useEffect(() => {
        if (address) loadMarketplaceServices();
    }, [address]);

    // Remove HARDCODED_MARKETPLACE constant entirely

    async function loadMarketplaceServices() {
        if (!address) return;
        setLoadingMarket(true);
        
        try {
            const resp = await fetch("http://localhost:3402/api/services");
            if (resp.ok) {
                const data = await resp.json();
                const svcs = (data.services || [])
                    .filter((s: any) => s.active)
                    .map((s: any) => ({
                        name: s.name,
                        url: s.url,
                        pricePerCall: s.price || Math.round(parseFloat(s.priceSTX || "0") * 1_000_000),
                        description: s.description,
                        ownerAddress: s.address,
                    }));
                setMarketServices(svcs);
            }
        } catch {}
        
        setLoadingMarket(false);
    }

    function addServiceStep() {
        setSteps([
            ...steps,
            {
                id: `step-${Date.now()}`,
                type: "x402-service",
                source: "manual",
                service: "",
                url: "",
                maxPrice: 500000,
                serviceAddress: "",
            },
        ]);
    }

    function addLLMStep() {
        setSteps([
            ...steps,
            {
                id: `llm-${Date.now()}`,
                type: "llm-analysis",
                llmProvider: "openrouter-free",
                llmModel: "mistralai/mistral-small-3.1-24b-instruct:free",
                llmPrompt: "Analyze the data from previous steps and provide a clear recommendation with reasoning.",
            },
        ]);
    }

    function updateStep(index: number, updates: Partial<PipelineStep>) {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], ...updates };
        setSteps(newSteps);
    }

    function removeStep(index: number) {
        setSteps(steps.filter((_, i) => i !== index));
    }

    function selectFromMarketplace(stepIndex: number, svc: MarketService) {
        updateStep(stepIndex, {
            source: "marketplace",
            service: svc.name,
            url: svc.url,
            maxPrice: svc.pricePerCall,
            serviceAddress: svc.ownerAddress,
        });
    }

    function savePipeline() {
        if (!pipelineName || steps.length === 0) return;

        const pipeline: Pipeline = {
            id: `pipeline-${Date.now()}`,
            name: pipelineName,
            steps,
            delivery,
            webhookUrl: delivery === "webhook" ? webhookUrl : undefined,
            scheduleInterval,
            createdAt: new Date().toISOString(),
            owner: address!, // ✅ add this
        };

        const updated = [...pipelines, pipeline];
        setPipelines(updated);
        savePipelines(updated);

        // Reset builder
        setPipelineName("");
        setSteps([]);
        setDelivery("terminal");
        setWebhookUrl("");
        setScheduleInterval(undefined);
        setShowBuilder(false);
    }

    function deletePipeline(id: string) {
        const updated = pipelines.filter((p) => p.id !== id);
        setPipelines(updated);
        savePipelines(updated);
    }

    function exportPipeline(pipeline: Pipeline) {
        const exportData = {
            ...pipeline,
            lastResult: runResults[pipeline.id] || null,
            exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${pipeline.name.replace(/\s+/g, "-").toLowerCase()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="min-h-screen w-full bg-[#030303] text-white pt-10 pb-20 px-6 font-sans relative overflow-x-hidden">
            
            {/* Subtle Monochrome Auroras */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-white opacity-[0.02] blur-[120px] rounded-full mix-blend-screen" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-cyan-500 opacity-[0.03] blur-[150px] rounded-full mix-blend-screen" />
            </div>

            <div className="max-w-5xl mx-auto relative z-10 animate-fade-in space-y-10">
                
                {/* ─── Header ────────────────────────────────────────────── */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 rounded-xl bg-cyan-500/[0.1] border border-cyan-400/20">
                                <GitBranch className="w-6 h-6 text-cyan-400" />
                            </div>
                            <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white">Execution Pipelines</h1>
                        </div>
                        <p className="text-white/50 font-light max-w-xl">
                            String together multiple X402 services and LLM analysis into fully autonomous, conditional workflows.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowBuilder(!showBuilder)}
                        className="flex items-center justify-center gap-2 px-6 py-3.5 bg-cyan-400 hover:bg-cyan-300 text-black rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)]"
                    >
                        <Plus className="w-4 h-4" />
                        New Pipeline
                    </button>
                </div>

                {/* ─── Builder ───────────────────────────────────────────── */}
                {showBuilder && (
                    <div className="p-6 md:p-8 rounded-3xl bg-white/[0.02] border border-cyan-400/20 backdrop-blur-sm shadow-[0_0_30px_rgba(34,211,238,0.05)] animate-slide-up space-y-8">
                        <h2 className="text-xl font-medium text-white flex items-center gap-3 border-b border-white/[0.05] pb-4">
                            <Settings2 className="w-5 h-5 text-cyan-400" />
                            Pipeline Builder Matrix
                        </h2>

                        {/* Pipeline Name & Schedule */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">
                                    Pipeline Nomenclature
                                </label>
                                <input
                                    type="text"
                                    value={pipelineName}
                                    onChange={(e) => setPipelineName(e.target.value)}
                                    placeholder="e.g. BTC Arbitrage Scanner"
                                    className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner"
                                    maxLength={50}
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Clock className="w-3 h-3" /> Autonomous Schedule Trigger
                                </label>
                                <select
                                    value={scheduleInterval || ""}
                                    onChange={(e) => setScheduleInterval(e.target.value ? parseInt(e.target.value) : undefined)}
                                    className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-cyan-400 transition-all shadow-inner appearance-none cursor-pointer"
                                >
                                    <option value="">Manual Execution Only</option>
                                    <option value="5">Interval: 5 minutes</option>
                                    <option value="15">Interval: 15 minutes</option>
                                    <option value="30">Interval: 30 minutes</option>
                                    <option value="60">Interval: 1 hour</option>
                                    <option value="1440">Interval: 24 hours</option>
                                </select>
                            </div>
                        </div>

                        {/* Steps Builder */}
                        <div className="space-y-4 pt-4 border-t border-white/[0.05]">
                            <h3 className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                                Sequential Instruction Set
                            </h3>

                            {steps.map((step, i) => (
                                <div key={step.id} className="space-y-3">
                                    {/* Arrow between steps */}
                                    {i > 0 && (
                                        <div className="flex justify-center py-1">
                                            <div className="w-px h-6 bg-gradient-to-b from-cyan-400/50 to-transparent" />
                                        </div>
                                    )}

                                    <div className="p-6 rounded-2xl bg-[#0A0A0A] border border-white/10 space-y-5">
                                        {/* Step Header */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-xs font-mono text-white/70">
                                                    {String(i + 1).padStart(2, '0')}
                                                </span>
                                                {step.type === "x402-service" ? (
                                                    <span className="text-sm font-medium text-white flex items-center gap-2">
                                                        <Zap className="w-4 h-4 text-cyan-400" />
                                                        X402 Data Retrieval
                                                    </span>
                                                ) : (
                                                    <span className="text-sm font-medium text-white flex items-center gap-2">
                                                        <Brain className="w-4 h-4 text-fuchsia-400" />
                                                        LLM Context Processing
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => removeStep(i)}
                                                className="p-2 rounded-xl hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                                                title="Purge Step"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* x402 Service Config */}
                                        {step.type === "x402-service" && (
                                            <div className="space-y-4">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => updateStep(i, { source: "marketplace" })}
                                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                                                            step.source === "marketplace"
                                                                ? "bg-cyan-500/[0.1] text-cyan-400 border border-cyan-400/30"
                                                                : "bg-white/[0.02] text-white/40 border border-white/[0.05] hover:bg-white/[0.04]"
                                                        }`}
                                                    >
                                                        <Search className="w-3.5 h-3.5" />
                                                        Registry Index
                                                    </button>
                                                    <button
                                                        onClick={() => updateStep(i, { source: "manual" })}
                                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                                                            step.source === "manual"
                                                                ? "bg-cyan-500/[0.1] text-cyan-400 border border-cyan-400/30"
                                                                : "bg-white/[0.02] text-white/40 border border-white/[0.05] hover:bg-white/[0.04]"
                                                        }`}
                                                    >
                                                        <Keyboard className="w-3.5 h-3.5" />
                                                        Manual Entry
                                                    </button>
                                                </div>

                                                {/* Marketplace Picker */}
                                                {step.source === "marketplace" && (
                                                    <div className="rounded-xl border border-white/10 overflow-hidden">
                                                        {loadingMarket ? (
                                                            <div className="p-4 text-center text-[10px] font-mono text-cyan-400">Querying Network...</div>
                                                        ) : marketServices.length === 0 ? (
                                                            <div className="p-4 text-center text-xs text-white/40">No services detected on-chain.</div>
                                                        ) : (
                                                            <div className="grid gap-px bg-white/10 max-h-48 overflow-y-auto">
                                                                {marketServices.map((svc, j) => (
                                                                    <button
                                                                        key={j}
                                                                        onClick={() => selectFromMarketplace(i, svc)}
                                                                        className={`flex items-center justify-between p-4 text-left transition-all ${
                                                                            step.service === svc.name
                                                                                ? "bg-cyan-500/[0.1] text-white"
                                                                                : "bg-[#0A0A0A] hover:bg-white/[0.04] text-white/60"
                                                                        }`}
                                                                    >
                                                                        <div>
                                                                            <p className="text-sm font-medium">{svc.name}</p>
                                                                            <p className="text-[10px] mt-0.5">{svc.description}</p>
                                                                        </div>
                                                                        <span className="text-xs font-mono text-cyan-400 shrink-0">
                                                                            {(svc.pricePerCall / 1_000_000).toFixed(2)} STX
                                                                        </span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Manual Entry */}
                                                {step.source === "manual" && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1.5">Service Tag</label>
                                                            <input
                                                                type="text"
                                                                value={step.service || ""}
                                                                onChange={(e) => updateStep(i, { service: e.target.value })}
                                                                placeholder="e.g. Custom Price Node"
                                                                className="w-full px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1.5">Network Address</label>
                                                            <input
                                                                type="text"
                                                                value={step.serviceAddress || ""}
                                                                onChange={(e) => updateStep(i, { serviceAddress: e.target.value })}
                                                                placeholder="ST..."
                                                                className="w-full px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1.5">API Endpoint</label>
                                                            <input
                                                                type="text"
                                                                value={step.url || ""}
                                                                onChange={(e) => updateStep(i, { url: e.target.value })}
                                                                placeholder="https://..."
                                                                className="w-full px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1.5">Price Hard Cap (µSTX)</label>
                                                            <input
                                                                type="number"
                                                                value={step.maxPrice || ""}
                                                                onChange={(e) => updateStep(i, { maxPrice: parseInt(e.target.value) || 0 })}
                                                                placeholder="500000"
                                                                className="w-full px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Selected Notice */}
                                                {step.source === "marketplace" && step.service && (
                                                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[10px] font-mono flex items-center justify-between">
                                                        <span className="text-white/60">Target: <span className="text-white">{step.service}</span></span>
                                                        <span className="text-cyan-400">{((step.maxPrice || 0) / 1_000_000).toFixed(2)} STX cap</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* LLM Analysis Config */}
                                        {step.type === "llm-analysis" && (
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1.5">Model Engine (OpenRouter)</label>
                                                    <select
                                                        value={step.llmModel}
                                                        onChange={(e) => updateStep(i, { llmModel: e.target.value })}
                                                        className="w-full px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-cyan-400 appearance-none"
                                                    >
                                                        {LLM_MODELS.map((m) => (
                                                            <option key={m.value} value={m.value} className="bg-[#0A0A0A]">{m.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1.5">Execution Prompt</label>
                                                    <textarea
                                                        value={step.llmPrompt || ""}
                                                        onChange={(e) => updateStep(i, { llmPrompt: e.target.value })}
                                                        placeholder="Analyze the combined data..."
                                                        rows={3}
                                                        className="w-full px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-cyan-400 resize-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1.5">Custom API Key (Leave blank for Default)</label>
                                                    <input
                                                        type="password"
                                                        value={step.llmApiKey || ""}
                                                        onChange={(e) => updateStep(i, { llmApiKey: e.target.value })}
                                                        placeholder="sk-or-..."
                                                        className="w-full px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* Condition Router */}
                                        {i > 0 && step.type === "x402-service" && (
                                            <div className="pt-4 border-t border-white/5">
                                                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!step.condition}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                updateStep(i, {
                                                                    condition: {
                                                                        dependsOn: steps[i - 1]?.id || "",
                                                                        field: "",
                                                                        operator: ">",
                                                                        value: "",
                                                                    },
                                                                });
                                                            } else {
                                                                const { condition, ...rest } = step;
                                                                setSteps(steps.map((s, j) => j === i ? { ...rest } as PipelineStep : s));
                                                            }
                                                        }}
                                                        className="w-4 h-4 rounded border-white/20 bg-black/50 text-cyan-400 focus:ring-cyan-400/50 focus:ring-offset-0"
                                                    />
                                                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest group-hover:text-white/80 transition-colors">
                                                        Enable Conditional Execution Gate
                                                    </span>
                                                </label>
                                                
                                                {step.condition && (
                                                    <div className="grid grid-cols-3 gap-3 mt-4">
                                                        <input
                                                            type="text"
                                                            value={step.condition.field}
                                                            onChange={(e) => updateStep(i, { condition: { ...step.condition!, field: e.target.value } })}
                                                            placeholder="Payload Field (e.g. price)"
                                                            className="px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                                                        />
                                                        <select
                                                            value={step.condition.operator}
                                                            onChange={(e) => updateStep(i, { condition: { ...step.condition!, operator: e.target.value as any } })}
                                                            className="px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-400 appearance-none"
                                                        >
                                                            {OPERATORS.map((op) => (
                                                                <option key={op.value} value={op.value} className="bg-[#0A0A0A]">{op.label}</option>
                                                            ))}
                                                        </select>
                                                        <input
                                                            type="text"
                                                            value={step.condition.value}
                                                            onChange={(e) => updateStep(i, { condition: { ...step.condition!, value: e.target.value } })}
                                                            placeholder="Target Value"
                                                            className="px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Add Step Buttons */}
                            <div className="flex flex-col sm:flex-row gap-4 pt-4">
                                <button
                                    onClick={addServiceStep}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-4 border border-dashed border-cyan-400/30 rounded-2xl text-xs font-bold uppercase tracking-widest text-cyan-400/70 hover:bg-cyan-500/[0.05] hover:text-cyan-400 hover:border-cyan-400 transition-all"
                                >
                                    <Globe className="w-4 h-4" />
                                    Append X402 Block
                                </button>
                                <button
                                    onClick={addLLMStep}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-4 border border-dashed border-fuchsia-400/30 rounded-2xl text-xs font-bold uppercase tracking-widest text-fuchsia-400/70 hover:bg-fuchsia-500/[0.05] hover:text-fuchsia-400 hover:border-fuchsia-400 transition-all"
                                >
                                    <Brain className="w-4 h-4" />
                                    Append LLM Block
                                </button>
                            </div>
                        </div>

                        {/* Delivery Section */}
                        <div className="pt-6 border-t border-white/[0.05]">
                            <h3 className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-4">
                                Final Payload Routing
                            </h3>
                            <div className="flex flex-wrap gap-3 mb-4">
                                {(["terminal", "webhook", "api"] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setDelivery(mode)}
                                        className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                                            delivery === mode
                                                ? "bg-white text-black shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                                                : "bg-white/[0.02] border border-white/10 text-white/50 hover:bg-white/[0.06] hover:text-white"
                                        }`}
                                    >
                                        {mode === "terminal" ? "Local Node" : mode}
                                    </button>
                                ))}
                            </div>
                            
                            {delivery === "terminal" && (
                                <p className="text-[10px] font-mono text-white/40 flex items-center gap-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Output mapped strictly to agent.js console output.
                                </p>
                            )}
                            {delivery === "webhook" && (
                                <input
                                    type="text"
                                    value={webhookUrl}
                                    onChange={(e) => setWebhookUrl(e.target.value)}
                                    placeholder="https://your-infra.com/webhook"
                                    className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-cyan-400 transition-all shadow-inner"
                                />
                            )}
                            {delivery === "api" && (
                                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                    <p className="text-xs font-light text-white/50 mb-2">Endpoint configured to serve at:</p>
                                    <code className="text-cyan-400 font-mono text-sm block">http://localhost:4000/api/latest</code>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-8 mt-4">
                                <button
                                    onClick={() => { setShowBuilder(false); setPipelineName(""); setSteps([]); }}
                                    className="px-6 py-3 bg-transparent hover:bg-red-500/10 text-white/40 hover:text-red-400 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                                >
                                    Abort
                                </button>
                                <button
                                    onClick={savePipeline}
                                    disabled={!pipelineName || steps.length === 0}
                                    className="px-8 py-3 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-30 disabled:hover:bg-cyan-400 text-black rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                                >
                                    Commit Pipeline
                                </button>
                            </div>
                        </div>             
                    </div>  
                )}

                {/* ─── Pipeline List ─────────────────────────────────────── */}
                <div className="space-y-6 pt-4 border-t border-white/[0.05]">
                    <h2 className="text-2xl font-medium text-white tracking-tight">Constructed Workflows</h2>

                    {pipelines.length === 0 ? (
                        <div className="p-16 rounded-3xl bg-white/[0.01] border border-dashed border-white/10 text-center">
                            <GitBranch className="w-12 h-12 text-white/20 mx-auto mb-4" />
                            <p className="text-white/70 font-medium mb-2">No pipelines detected</p>
                            <p className="text-white/40 text-sm font-light">
                                Initialize your first autonomous sequence block above.
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {pipelines.map((pipeline) => (
                                <div
                                    key={pipeline.id}
                                    className="rounded-3xl bg-white/[0.02] border border-white/[0.05] overflow-hidden group hover:border-cyan-400/30 transition-all shadow-sm"
                                >
                                    {/* Pipeline header */}
                                    <div
                                        className="flex flex-col md:flex-row md:items-center justify-between p-6 cursor-pointer gap-4 md:gap-0"
                                        onClick={() => setExpandedPipeline(expandedPipeline === pipeline.id ? null : pipeline.id)}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-cyan-500/[0.05] border border-cyan-400/20 flex items-center justify-center shrink-0">
                                                <Package className="w-6 h-6 text-cyan-400" />
                                            </div>
                                            <div>
                                                <h3 className="text-white/90 font-medium tracking-tight mb-1">
                                                    {pipeline.name}
                                                </h3>
                                                <div className="flex items-center gap-2 text-[10px] font-mono text-white/40 uppercase tracking-widest">
                                                    <span>{pipeline.steps.length} Node{pipeline.steps.length !== 1 ? "s" : ""}</span>
                                                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                                                    <span>{pipeline.delivery} Out</span>
                                                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                                                    <span>{new Date(pipeline.createdAt).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); exportPipeline(pipeline); }}
                                                className="p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/10 transition-colors"
                                                title="Export Schema JSON"
                                            >
                                                <Download className="w-4 h-4 text-white/60" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(pipeline.id); }}
                                                className="p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors"
                                                title="Purge Pipeline"
                                            >
                                                {deleteConfirmId === pipeline.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={(e) => { e.stopPropagation(); deletePipeline(pipeline.id); setDeleteConfirmId(null); }} className="text-[10px] font-mono text-red-400 uppercase tracking-widest hover:text-red-300">Confirm</button>
                                                        <span className="text-white/20">|</span>
                                                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }} className="text-[10px] font-mono text-white/40 uppercase tracking-widest hover:text-white">Cancel</button>
                                                    </div>
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                            <div className="w-px h-6 bg-white/10 mx-2 hidden md:block" />
                                            <button                                        
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    setRunningId(pipeline.id);
                                                    setExpandedPipeline(pipeline.id);
                                                    const startTime = Date.now(); // ← capture start time
                                                    try {
                                                        await fetch("http://localhost:4000/api/run-pipeline", {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ pipeline })
                                                        });
                                                        
                                                        const pollInterval = setInterval(async () => {
                                                            try {
                                                                const latest = await fetch("http://localhost:4000/api/latest");
                                                                const data = await latest.json();
                                                                // Only accept results newer than when we clicked Execute
                                                                const resultTime = data.timestamp ? new Date(data.timestamp).getTime() : 0;
                                                                if (data.pipeline && resultTime > startTime) { 
                                                                    setRunResults(prev => ({ ...prev, [pipeline.id]: data.pipeline }));
                                                                    setExpandedPipeline(pipeline.id);
                                                                    setRunningId(null);
                                                                    clearInterval(pollInterval);
                                                                }
                                                            } catch {}
                                                        }, 5000);
                                                        
                                                        setTimeout(() => { 
                                                            clearInterval(pollInterval); 
                                                            setRunningId(null); 
                                                        }, 300_000); 
                                                    } catch {
                                                        setRunningId(null);
                                                    }
                                                }}
                                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                                                    runningId === pipeline.id 
                                                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" 
                                                        : "bg-cyan-500/[0.1] text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400 hover:text-black"
                                                }`}
                                            >
                                                {runningId === pipeline.id ? (
                                                    <><div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /> Executing...</>
                                                ) : (
                                                    <><Play className="w-3.5 h-3.5" /> Execute</>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded details */}
                                    {expandedPipeline === pipeline.id && (
                                        <div className="px-6 pb-6 pt-2 border-t border-white/[0.05] bg-black/20">
                                            
                                            {/* Waiting indicator */}
                                            {runningId === pipeline.id && !runResults[pipeline.id] && (
                                                <div className="mb-6 p-5 rounded-2xl bg-amber-950/20 border border-amber-500/20 flex items-center gap-3">
                                                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                                    <p className="text-xs font-mono text-amber-400 uppercase tracking-widest">
                                                        Pipeline executing — polling for results...
                                                    </p>
                                                </div>
                                            )}

                                            {/* Runtime Results Rendering */}
                                            {runResults[pipeline.id] && (
                                                <div className="mb-6 p-5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30">
                                                    <p className="text-xs font-mono uppercase tracking-widest text-cyan-400 mb-4 flex items-center gap-2">
                                                        <CheckCircle2 className="w-4 h-4" /> Latest Execution Output
                                                    </p>
                                                    <div className="space-y-4">
                                                        {runResults[pipeline.id].steps?.map((step: any, idx: number) => (
                                                            <div key={idx} className="space-y-2">
                                                                <div className={`text-[11px] font-mono tracking-widest uppercase flex items-center gap-2 ${step.status === "success" ? "text-emerald-400" : "text-red-400"}`}>
                                                                    <div className={`w-1.5 h-1.5 rounded-full ${step.status === "success" ? "bg-emerald-400" : "bg-red-400"}`} />
                                                                    Node {step.step} Status: {step.status}
                                                                </div>
                                                                {step.analysis && (
                                                                    <div className="p-4 rounded-xl bg-[#0A0A0A] border border-white/5 text-sm font-light text-white/80 leading-relaxed shadow-inner">
                                                                        {step.analysis}
                                                                    </div>
                                                                )}
                                                                {step.data && (
                                                                    <pre className="p-4 rounded-xl bg-[#0A0A0A] border border-white/5 text-[10px] font-mono text-emerald-400/80 overflow-auto max-h-32 shadow-inner">
                                                                        {JSON.stringify(step.data, null, 2)}
                                                                    </pre>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Visual Sequence Map */}
                                            <div className="space-y-3">
                                                <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-4">Sequence Architecture</p>
                                                {pipeline.steps.map((step, i) => (
                                                    <div key={step.id} className="flex items-start gap-4">
                                                        <div className="flex flex-col items-center">
                                                            <span className="w-7 h-7 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[10px] font-mono text-white/50 shrink-0">
                                                                {String(i + 1).padStart(2, '0')}
                                                            </span>
                                                            {i < pipeline.steps.length - 1 && <div className="w-px h-8 bg-white/10 my-1" />}
                                                        </div>
                                                        <div className="pt-1 w-full">
                                                            {step.type === "x402-service" ? (
                                                                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-2">
                                                                    <div>
                                                                        <p className="text-sm font-medium text-white/90 flex items-center gap-2">
                                                                            <Zap className="w-3.5 h-3.5 text-cyan-400" />
                                                                            {step.service || "Unnamed Target"}
                                                                        </p>
                                                                        <p className="text-[10px] font-mono text-white/40 mt-1">{step.url}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-[10px] uppercase font-mono bg-white/5 px-2 py-1 rounded text-white/50">{step.source}</span>
                                                                        <span className="text-[11px] font-mono text-cyan-400">{((step.maxPrice || 0) / 1_000_000).toFixed(2)} STX Cap</span>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="p-4 rounded-xl bg-fuchsia-500/[0.05] border border-fuchsia-500/10">
                                                                    <p className="text-sm font-medium text-fuchsia-400 flex items-center gap-2 mb-2">
                                                                        <Brain className="w-3.5 h-3.5" /> LLM Analysis Engine
                                                                    </p>
                                                                    <p className="text-[11px] font-mono text-white/50 mb-2">Model: {step.llmModel}</p>
                                                                    <p className="text-xs font-light text-white/60 italic border-l-2 border-fuchsia-500/30 pl-3">"{step.llmPrompt}"</p>
                                                                </div>
                                                            )}
                                                            
                                                            {step.condition && (
                                                                <div className="mt-2 ml-4 flex items-center gap-2 text-[10px] font-mono text-amber-400/80">
                                                                    <div className="w-3 h-px bg-amber-400/30" />
                                                                    <span>IF previous_node.{step.condition.field} {step.condition.operator} {step.condition.value}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}