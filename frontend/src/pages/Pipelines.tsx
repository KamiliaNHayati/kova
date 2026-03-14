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
    ChevronDown,
    ChevronUp,
    Package,
    Zap,
    Settings2,
    Clock,
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
const HARDCODED_MARKETPLACE: MarketService[] = [
    { name: "Price Feed", url: "http://localhost:3402/api/price-feed", pricePerCall: 500000, description: "Real-time crypto price data (BTC, ETH, STX)", ownerAddress: "STWEW038MP9DGVVMBZMVBJ6KZXC39Y5NHWY5CC37" },
    { name: "Text Summarizer", url: "http://localhost:3402/api/summarize", pricePerCall: 1000000, description: "AI-powered text summarization", ownerAddress: "STWEW038MP9DGVVMBZMVBJ6KZXC39Y5NHWY5CC37" },
];

// ─── Constants ───
const OPERATORS = [
    { value: ">", label: ">" },
    { value: "<", label: "<" },
    { value: "==", label: "==" },
    { value: "!=", label: "!=" },
    { value: "contains", label: "contains" },
];

const LLM_MODELS = [
    { value: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (Free)" },
    { value: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (Free)" },
    { value: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1 (Free)" },
    { value: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (Free)" },
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

    // Builder state
    const [pipelineName, setPipelineName] = useState("");
    const [steps, setSteps] = useState<PipelineStep[]>([]);
    const [delivery, setDelivery] = useState<"terminal" | "webhook" | "api">("terminal");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [scheduleInterval, setScheduleInterval] = useState<number | undefined>(undefined);

    // Marketplace services
    const [marketServices, setMarketServices] = useState<MarketService[]>([]);
    const [loadingMarket, setLoadingMarket] = useState(false);

    useEffect(() => {
        if (address) loadMarketplaceServices();
    }, [address]);

    async function loadMarketplaceServices() {
        if (!address) return;
        setLoadingMarket(true);
        const agents = getSavedAgents(address);
        const allowedServices: MarketService[] = [];

        for (const svc of HARDCODED_MARKETPLACE) {
            let isAllowedByAnyAgent = false;
            for (const agent of agents) {
                try {
                    const resp = await isServiceAllowed(address, agent.address, svc.ownerAddress);
                    if (resp.value === true) {
                        isAllowedByAnyAgent = true;
                        break;
                    }
                } catch { }
            }
            if (isAllowedByAnyAgent) {
                allowedServices.push(svc);
            }
        }
        setMarketServices(allowedServices);
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
                llmModel: LLM_MODELS[0].value,
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
        const blob = new Blob([JSON.stringify(pipeline, null, 2)], {
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
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <GitBranch className="w-8 h-8 text-accent" />
                        Pipelines
                    </h1>
                    <p className="text-text-muted mt-2">
                        Build multi-step workflows. Agent executes each step as a separate
                        x402 payment.
                    </p>
                </div>
                <button
                    onClick={() => setShowBuilder(!showBuilder)}
                    className="flex items-center gap-2 px-5 py-3 bg-accent hover:bg-accent-hover text-white rounded-xl font-medium transition-all shadow-lg"
                >
                    <Plus className="w-5 h-5" />
                    New Pipeline
                </button>
            </div>

            {/* Builder */}
            {showBuilder && (
                <div className="glass rounded-2xl border border-accent/30 p-6 space-y-6 animate-slide-up">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-accent" />
                        Pipeline Builder
                    </h2>

                    {/* Pipeline Name */}
                    <div>
                        <label className="block text-sm text-text-muted mb-1.5">
                            Pipeline Name
                        </label>
                        <input
                            type="text"
                            value={pipelineName}
                            onChange={(e) => setPipelineName(e.target.value)}
                            placeholder="e.g. Morning Market Briefing"
                            className="w-full px-4 py-3 bg-black/30 border border-border/50 rounded-xl text-white placeholder-text-muted/50 focus:border-accent focus:outline-none"
                            maxLength={50}
                        />
                    </div>

                    {/* Schedule */}
                    <div>
                        <label className="block text-sm text-text-muted mb-1.5 flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Schedule (Optional)
                        </label>
                        <select
                            value={scheduleInterval || ""}
                            onChange={(e) => setScheduleInterval(e.target.value ? parseInt(e.target.value) : undefined)}
                            className="w-full px-4 py-3 bg-black/30 border border-border/50 rounded-xl text-white focus:border-accent focus:outline-none appearance-none"
                        >
                            <option value="">Run Once Manually</option>
                            <option value="5">Every 5 minutes</option>
                            <option value="15">Every 15 minutes</option>
                            <option value="30">Every 30 minutes</option>
                            <option value="60">Every 1 hour</option>
                            <option value="1440">Every 24 hours</option>
                        </select>
                    </div>

                    {/* Steps */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider">
                            Steps
                        </h3>

                        {steps.map((step, i) => (
                            <div key={step.id} className="space-y-2">
                                {/* Arrow between steps */}
                                {i > 0 && (
                                    <div className="flex justify-center py-1">
                                        <ArrowDown className="w-5 h-5 text-accent/50" />
                                    </div>
                                )}

                                <div className="p-4 rounded-xl bg-black/20 border border-border/30 space-y-3">
                                    {/* Step header */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                                                {i + 1}
                                            </span>
                                            {step.type === "x402-service" ? (
                                                <span className="text-sm font-medium text-white flex items-center gap-1.5">
                                                    <Zap className="w-4 h-4 text-amber-400" />
                                                    x402 Service Call
                                                </span>
                                            ) : (
                                                <span className="text-sm font-medium text-white flex items-center gap-1.5">
                                                    <Brain className="w-4 h-4 text-purple-400" />
                                                    LLM Analysis
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => removeStep(i)}
                                            className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* x402 Service step fields */}
                                    {step.type === "x402-service" && (
                                        <div className="space-y-3">
                                            {/* Source toggle */}
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => updateStep(i, { source: "marketplace" })}
                                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${step.source === "marketplace"
                                                            ? "bg-accent/20 text-accent border border-accent/30"
                                                            : "bg-white/5 text-text-muted border border-border/30 hover:bg-white/10"
                                                        }`}
                                                >
                                                    <Search className="w-3.5 h-3.5" />
                                                    From Marketplace
                                                </button>
                                                <button
                                                    onClick={() => updateStep(i, { source: "manual" })}
                                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${step.source === "manual"
                                                            ? "bg-accent/20 text-accent border border-accent/30"
                                                            : "bg-white/5 text-text-muted border border-border/30 hover:bg-white/10"
                                                        }`}
                                                >
                                                    <Keyboard className="w-3.5 h-3.5" />
                                                    Enter Manually
                                                </button>
                                            </div>

                                            {/* Marketplace picker */}
                                            {step.source === "marketplace" && (
                                                <div>
                                                    {loadingMarket ? (
                                                        <p className="text-xs text-text-muted">
                                                            Loading services...
                                                        </p>
                                                    ) : marketServices.length === 0 ? (
                                                        <p className="text-xs text-text-muted">
                                                            No services on marketplace yet. Register one in
                                                            the Provider page.
                                                        </p>
                                                    ) : (
                                                        <div className="grid gap-2 max-h-40 overflow-y-auto">
                                                            {marketServices.map((svc, j) => (
                                                                <button
                                                                    key={j}
                                                                    onClick={() =>
                                                                        selectFromMarketplace(i, svc)
                                                                    }
                                                                    className={`flex items-center justify-between p-3 rounded-lg text-left transition-all ${step.service === svc.name
                                                                            ? "bg-accent/10 border border-accent/30"
                                                                            : "bg-white/5 border border-border/20 hover:bg-white/10"
                                                                        }`}
                                                                >
                                                                    <div>
                                                                        <p className="text-sm text-white font-medium">
                                                                            {svc.name}
                                                                        </p>
                                                                        <p className="text-xs text-text-muted">
                                                                            {svc.description}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-xs font-mono text-accent">
                                                                        {(svc.pricePerCall / 1_000_000).toFixed(2)}{" "}
                                                                        STX
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Manual input */}
                                            {step.source === "manual" && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs text-text-muted mb-1">
                                                            Service Name
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={step.service || ""}
                                                            onChange={(e) =>
                                                                updateStep(i, { service: e.target.value })
                                                            }
                                                            placeholder="e.g. price-feed"
                                                            className="w-full px-3 py-2 bg-black/30 border border-border/50 rounded-lg text-sm text-white placeholder-text-muted/40 focus:border-accent focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-text-muted mb-1">
                                                            Service Address
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={step.serviceAddress || ""}
                                                            onChange={(e) =>
                                                                updateStep(i, {
                                                                    serviceAddress: e.target.value,
                                                                })
                                                            }
                                                            placeholder="ST..."
                                                            className="w-full px-3 py-2 bg-black/30 border border-border/50 rounded-lg text-sm text-white font-mono placeholder-text-muted/40 focus:border-accent focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-text-muted mb-1">
                                                            API URL
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={step.url || ""}
                                                            onChange={(e) =>
                                                                updateStep(i, { url: e.target.value })
                                                            }
                                                            placeholder="https://api.example.com/data"
                                                            className="w-full px-3 py-2 bg-black/30 border border-border/50 rounded-lg text-sm text-white placeholder-text-muted/40 focus:border-accent focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-text-muted mb-1">
                                                            Max Price (µSTX)
                                                        </label>
                                                        <input
                                                            type="number"
                                                            value={step.maxPrice || ""}
                                                            onChange={(e) =>
                                                                updateStep(i, {
                                                                    maxPrice: parseInt(e.target.value) || 0,
                                                                })
                                                            }
                                                            placeholder="500000"
                                                            className="w-full px-3 py-2 bg-black/30 border border-border/50 rounded-lg text-sm text-white placeholder-text-muted/40 focus:border-accent focus:outline-none"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Selected from marketplace display */}
                                            {step.source === "marketplace" && step.service && (
                                                <div className="p-2 rounded-lg bg-accent/5 border border-accent/10 text-xs text-text-muted">
                                                    ✅ Selected: <span className="text-white font-medium">{step.service}</span>
                                                    {" — "}
                                                    <span className="text-accent">
                                                        {((step.maxPrice || 0) / 1_000_000).toFixed(2)} STX
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* LLM Analysis step fields */}
                                    {step.type === "llm-analysis" && (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs text-text-muted mb-1">
                                                    Model (OpenRouter Free Tier)
                                                </label>
                                                <select
                                                    value={step.llmModel}
                                                    onChange={(e) =>
                                                        updateStep(i, { llmModel: e.target.value })
                                                    }
                                                    className="w-full px-3 py-2 bg-black/30 border border-border/50 rounded-lg text-sm text-white focus:border-accent focus:outline-none"
                                                >
                                                    {LLM_MODELS.map((m) => (
                                                        <option key={m.value} value={m.value}>
                                                            {m.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-text-muted mb-1">
                                                    Analysis Prompt
                                                </label>
                                                <textarea
                                                    value={step.llmPrompt || ""}
                                                    onChange={(e) =>
                                                        updateStep(i, { llmPrompt: e.target.value })
                                                    }
                                                    placeholder="Analyze the combined data and provide a BUY/SELL/HOLD recommendation..."
                                                    rows={3}
                                                    className="w-full px-3 py-2 bg-black/30 border border-border/50 rounded-lg text-sm text-white placeholder-text-muted/40 focus:border-accent focus:outline-none resize-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-text-muted mb-1">
                                                    API Key (optional — leave blank for Kova's free tier)
                                                </label>
                                                <input
                                                    type="password"
                                                    value={step.llmApiKey || ""}
                                                    onChange={(e) =>
                                                        updateStep(i, { llmApiKey: e.target.value })
                                                    }
                                                    placeholder="sk-or-... (your OpenRouter key)"
                                                    className="w-full px-3 py-2 bg-black/30 border border-border/50 rounded-lg text-sm text-white placeholder-text-muted/40 focus:border-accent focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Condition (optional, for steps after the first) */}
                                    {i > 0 && step.type === "x402-service" && (
                                        <div className="pt-2 border-t border-border/20">
                                            <label className="flex items-center gap-2 text-xs text-text-muted mb-2 cursor-pointer">
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
                                                            setSteps(
                                                                steps.map((s, j) =>
                                                                    j === i ? { ...rest } as PipelineStep : s
                                                                )
                                                            );
                                                        }
                                                    }}
                                                    className="rounded border-border/50 bg-black/30"
                                                />
                                                Conditional — only run if previous step meets criteria
                                            </label>
                                            {step.condition && (
                                                <div className="grid grid-cols-3 gap-2">
                                                    <input
                                                        type="text"
                                                        value={step.condition.field}
                                                        onChange={(e) =>
                                                            updateStep(i, {
                                                                condition: {
                                                                    ...step.condition!,
                                                                    field: e.target.value,
                                                                },
                                                            })
                                                        }
                                                        placeholder="result.field"
                                                        className="px-3 py-2 bg-black/30 border border-border/50 rounded-lg text-xs text-white placeholder-text-muted/40 focus:border-accent focus:outline-none font-mono"
                                                    />
                                                    <select
                                                        value={step.condition.operator}
                                                        onChange={(e) =>
                                                            updateStep(i, {
                                                                condition: {
                                                                    ...step.condition!,
                                                                    operator: e.target.value as any,
                                                                },
                                                            })
                                                        }
                                                        className="px-3 py-2 bg-black/30 border border-border/50 rounded-lg text-xs text-white focus:border-accent focus:outline-none"
                                                    >
                                                        {OPERATORS.map((op) => (
                                                            <option key={op.value} value={op.value}>
                                                                {op.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="text"
                                                        value={step.condition.value}
                                                        onChange={(e) =>
                                                            updateStep(i, {
                                                                condition: {
                                                                    ...step.condition!,
                                                                    value: e.target.value,
                                                                },
                                                            })
                                                        }
                                                        placeholder="value"
                                                        className="px-3 py-2 bg-black/30 border border-border/50 rounded-lg text-xs text-white placeholder-text-muted/40 focus:border-accent focus:outline-none"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Add step buttons */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={addServiceStep}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border/40 rounded-xl text-sm text-text-muted hover:border-accent/40 hover:text-accent transition-all"
                            >
                                <Globe className="w-4 h-4" />
                                + x402 Service Step
                            </button>
                            <button
                                onClick={addLLMStep}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-purple-500/30 rounded-xl text-sm text-text-muted hover:border-purple-500/50 hover:text-purple-400 transition-all"
                            >
                                <Brain className="w-4 h-4" />
                                + LLM Analysis Step
                            </button>
                        </div>
                    </div>

                    {/* Delivery */}
                    <div>
                        <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
                            Delivery
                        </h3>
                        <div className="flex gap-2 mb-3">
                            {(["terminal", "webhook", "api"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setDelivery(mode)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${delivery === mode
                                            ? "bg-accent/20 text-accent border border-accent/30"
                                            : "bg-white/5 text-text-muted border border-border/30 hover:bg-white/10"
                                        }`}
                                >
                                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                </button>
                            ))}
                        </div>
                        {delivery === "webhook" && (
                            <input
                                type="text"
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder="https://your-app.com/webhook"
                                className="w-full px-4 py-3 bg-black/30 border border-border/50 rounded-xl text-white placeholder-text-muted/50 focus:border-accent focus:outline-none"
                            />
                        )}
                    </div>

                    {/* Save */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={savePipeline}
                            disabled={!pipelineName || steps.length === 0}
                            className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Save Pipeline
                        </button>
                        <button
                            onClick={() => {
                                setShowBuilder(false);
                                setPipelineName("");
                                setSteps([]);
                            }}
                            className="px-6 py-3 bg-white/5 hover:bg-white/10 text-text-muted rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Pipeline List */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Your Pipelines</h2>

                {pipelines.length === 0 ? (
                    <div className="glass rounded-2xl border border-border/50 p-12 text-center">
                        <GitBranch className="w-12 h-12 text-text-muted/30 mx-auto mb-4" />
                        <p className="text-text-muted text-lg mb-2">No pipelines yet</p>
                        <p className="text-text-muted/60 text-sm">
                            Create your first multi-step workflow above
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {pipelines.map((pipeline) => (
                            <div
                                key={pipeline.id}
                                className="glass rounded-2xl border border-border/50 overflow-hidden group hover:border-accent/30 transition-all"
                            >
                                {/* Pipeline header */}
                                <div
                                    className="flex items-center justify-between p-5 cursor-pointer"
                                    onClick={() =>
                                        setExpandedPipeline(
                                            expandedPipeline === pipeline.id ? null : pipeline.id
                                        )
                                    }
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                                            <Package className="w-5 h-5 text-accent" />
                                        </div>
                                        <div>
                                            <h3 className="text-white font-medium">
                                                {pipeline.name}
                                            </h3>
                                            <p className="text-text-muted text-sm">
                                                {pipeline.steps.length} step
                                                {pipeline.steps.length !== 1 ? "s" : ""} ·{" "}
                                                {pipeline.delivery} delivery ·{" "}
                                                {new Date(pipeline.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                exportPipeline(pipeline);
                                            }}
                                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                                            title="Export JSON"
                                        >
                                            <Download className="w-4 h-4 text-text-muted" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deletePipeline(pipeline.id);
                                            }}
                                            className="p-2 rounded-lg bg-white/5 hover:bg-danger/10 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4 text-text-muted hover:text-danger" />
                                        </button>
                                        {expandedPipeline === pipeline.id ? (
                                            <ChevronUp className="w-5 h-5 text-text-muted" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5 text-text-muted" />
                                        )}
                                    </div>
                                </div>

                                {/* Expanded details */}
                                {expandedPipeline === pipeline.id && (
                                    <div className="px-5 pb-5 border-t border-border/30 pt-4 space-y-3">
                                        {pipeline.steps.map((step, i) => (
                                            <div key={step.id} className="flex items-start gap-3">
                                                <span className="w-6 h-6 rounded-md bg-accent/20 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0 mt-0.5">
                                                    {i + 1}
                                                </span>
                                                <div className="text-sm">
                                                    {step.type === "x402-service" ? (
                                                        <>
                                                            <p className="text-white font-medium">
                                                                {step.service || "Unnamed service"}
                                                            </p>
                                                            <p className="text-text-muted text-xs">
                                                                {step.url} ·{" "}
                                                                {((step.maxPrice || 0) / 1_000_000).toFixed(2)}{" "}
                                                                STX · {step.source}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <p className="text-purple-400 font-medium">
                                                                LLM Analysis
                                                            </p>
                                                            <p className="text-text-muted text-xs">
                                                                {step.llmModel} · "{step.llmPrompt?.slice(0, 60)}
                                                                ..."
                                                            </p>
                                                        </>
                                                    )}
                                                    {step.condition && (
                                                        <p className="text-xs text-amber-400 mt-1">
                                                            ⚡ Condition: {step.condition.field}{" "}
                                                            {step.condition.operator} {step.condition.value}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {/* Run instruction */}
                                        <div className="mt-4 p-3 rounded-xl bg-black/30 border border-border/20">
                                            <p className="text-xs text-text-muted mb-1.5 font-medium">
                                                Run this pipeline:
                                            </p>
                                            <code className="text-xs text-accent font-mono">
                                                SCHEDULE_MODE=pipeline PIPELINE_FILE=./{pipeline.name
                                                    .replace(/\s+/g, "-")
                                                    .toLowerCase()}
                                                .json node agent.js
                                            </code>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
