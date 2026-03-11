import { useState, useEffect } from "react";
import { useWallet } from "../context/WalletContext";
import { Bell, Save, Trash2, TestTube, CheckCircle2, AlertCircle, Eye, EyeOff, XCircle, Clock, Plus, Minus, Send, Globe, ChevronDown, Bot } from "lucide-react";
import { getSavedAgents, getSelectedAgent, setSelectedAgent, type AgentKeypair } from "../lib/agentKeys";

interface TelegramConfig {
    botToken: string;
    chatId: string;
    thresholdSTX: string;
    enabled: boolean;
}

interface ScheduleConfig {
    mode: string;
    intervalValue: number;
    intervalUnit: string;
    serviceEndpoints: string;
    deliveryMode: string;
    webhookUrl: string;
}

const TELEGRAM_KEY = "kova-telegram-config";
const SCHEDULE_KEY = "kova-schedule-config";

function getTelegramConfig(address: string): TelegramConfig {
    try {
        const raw = localStorage.getItem(`${TELEGRAM_KEY}-${address}`);
        if (raw) return JSON.parse(raw);
    } catch { }
    return { botToken: "", chatId: "", thresholdSTX: "0.05", enabled: false };
}

function getScheduleConfig(address: string): ScheduleConfig {
    try {
        const raw = localStorage.getItem(`${SCHEDULE_KEY}-${address}`);
        if (raw) return JSON.parse(raw);
    } catch { }
    return { mode: "once", intervalValue: 5, intervalUnit: "minutes", serviceEndpoints: "/api/price-feed", deliveryMode: "off", webhookUrl: "" };
}

function saveTelegramConfig(address: string, config: TelegramConfig) {
    localStorage.setItem(`${TELEGRAM_KEY}-${address}`, JSON.stringify(config));
}

function saveScheduleConfig(address: string, config: ScheduleConfig) {
    localStorage.setItem(`${SCHEDULE_KEY}-${address}`, JSON.stringify(config));
}

function toMinutes(value: number, unit: string): number {
    if (unit === "hours") return value * 60;
    if (unit === "days") return value * 60 * 24;
    return value;
}

const AVAILABLE_SERVICES = [
    { name: "Price Feed", description: "Real-time BTC, ETH, STX prices", price: "0.5 STX", endpoint: "/api/price-feed" },
    { name: "Text Summarizer", description: "AI-powered text summarization", price: "1 STX", endpoint: "/api/summarize" },
    { name: "Image Generator", description: "Generate images from text prompts", price: "2 STX", endpoint: "/api/image" },
    { name: "Sentiment Analysis", description: "Market sentiment from social feeds", price: "1.5 STX", endpoint: "/api/sentiment" },
    { name: "On-chain Analytics", description: "Whale tracking & DeFi metrics", price: "2 STX", endpoint: "/api/analytics" },
];

export default function Settings() {
    const { address } = useWallet();
    const [activeTab, setActiveTab] = useState<"notifications" | "scheduler" | "delivery">("notifications");
    const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({ botToken: "", chatId: "", thresholdSTX: "0.05", enabled: false });
    const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({ mode: "once", intervalValue: 5, intervalUnit: "minutes", serviceEndpoints: "/api/price-feed", deliveryMode: "off", webhookUrl: "" });
    const [saved, setSaved] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [showToken, setShowToken] = useState(false);
    const [agents, setAgents] = useState<AgentKeypair[]>([]);
    const [selectedAgentAddr, setSelectedAgentAddr] = useState<string>("");
    const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);

    useEffect(() => {
        if (address) {
            const savedAgents = getSavedAgents(address);
            setAgents(savedAgents);
            const selected = getSelectedAgent(address) || savedAgents[0]?.address || "";
            setSelectedAgentAddr(selected);
            // Load config for selected agent
            setTelegramConfig(getTelegramConfig(address));
            loadAgentConfig(selected);
        }
    }, [address]);

    function loadAgentConfig(agentAddr: string) {
        if (!address) return;
        const configKey = agentAddr || address;
        setScheduleConfig(getScheduleConfig(configKey));
    }

    function handleSelectAgent(agentAddr: string) {
        setSelectedAgentAddr(agentAddr);
        setAgentDropdownOpen(false);
        if (address) {
            setSelectedAgent(address, agentAddr);
            loadAgentConfig(agentAddr);
        }
    }

    function handleSave() {
        if (!address) return;
        if (activeTab === "notifications") {
            saveTelegramConfig(address, telegramConfig);
        } else {
            const configKey = selectedAgentAddr || address;
            saveScheduleConfig(configKey, scheduleConfig);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }

    function handleClearTelegram() {
        if (!address) return;
        const empty: TelegramConfig = { botToken: "", chatId: "", thresholdSTX: "0.05", enabled: false };
        setTelegramConfig(empty);
        saveTelegramConfig(address, empty);
        setTestResult(null);
    }

    async function handleTest() {
        if (!telegramConfig.botToken) {
            setTestResult({ ok: false, msg: "Enter a bot token first" });
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            const resp = await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/getMe`);
            const data = await resp.json();
            if (data.ok) {
                setTestResult({ ok: true, msg: `Connected to @${data.result.username}` });
            } else {
                setTestResult({ ok: false, msg: data.description || "Invalid token" });
            }
        } catch {
            setTestResult({ ok: false, msg: "Network error — check your connection" });
        }
        setTesting(false);
    }

    const tabs = [
        { id: "notifications" as const, label: "Notifications", icon: Bell },
        { id: "scheduler" as const, label: "Scheduler", icon: Clock },
        { id: "delivery" as const, label: "Data Delivery", icon: Send },
    ];

    const selectedAgent = agents.find(a => a.address === selectedAgentAddr);

    return (
        <div>
            <h1 className="text-2xl font-bold mb-2">Settings</h1>
            <p className="text-text-muted text-sm mb-6">
                Configure notifications and per-agent behavior
            </p>

            {/* Agent Selector */}
            {agents.length > 0 && (
                <div className="mb-6 max-w-md">
                    <label className="block text-xs text-text-muted mb-1.5 uppercase">Configure Agent</label>
                    <div className="relative">
                        <button
                            onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-surface border border-border rounded-xl hover:border-accent/40 transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                                    <Bot className="w-4 h-4 text-warning" />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-medium text-white">{selectedAgent?.label || "Select Agent"}</p>
                                    <p className="text-[10px] font-mono text-text-muted truncate max-w-[250px]">{selectedAgentAddr || "No agents"}</p>
                                </div>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${agentDropdownOpen ? "rotate-180" : ""}`} />
                        </button>
                        {agentDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl overflow-hidden shadow-xl z-50">
                                {agents.map((agent) => (
                                    <button
                                        key={agent.address}
                                        onClick={() => handleSelectAgent(agent.address)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/5 transition-colors text-left ${agent.address === selectedAgentAddr ? "bg-accent/10 border-l-2 border-accent" : ""}`}
                                    >
                                        <Bot className="w-4 h-4 text-warning flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-white">{agent.label}</p>
                                            <p className="text-[10px] font-mono text-text-muted truncate max-w-[250px]">{agent.address}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 rounded-xl bg-surface-2/50 border border-border mb-6 max-w-md">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                            ? "bg-accent text-white shadow-sm"
                            : "text-text-muted hover:text-text"
                            }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="max-w-2xl">

                {/* ═══ NOTIFICATIONS TAB ═══ */}
                {activeTab === "notifications" && (
                    <div className="rounded-2xl bg-surface border border-border overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#229ED9]/10 flex items-center justify-center">
                                    <Bell className="w-5 h-5 text-[#229ED9]" />
                                </div>
                                <div>
                                    <h3 className="font-semibold">Telegram Notifications</h3>
                                    <p className="text-xs text-text-muted">Human-in-the-loop approval via Telegram</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setTelegramConfig({ ...telegramConfig, enabled: !telegramConfig.enabled })}
                                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${telegramConfig.enabled ? "bg-accent" : "bg-border"}`}
                            >
                                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${telegramConfig.enabled ? "translate-x-6.5" : "translate-x-0.5"}`} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className={`p-6 space-y-6 transition-opacity duration-300 ${telegramConfig.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>

                            {/* Top Row: Instructions + Features */}
                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                                <div className="lg:col-span-2 p-5 rounded-2xl bg-accent/5 border border-accent/10 shadow-inner h-full">
                                    <p className="font-semibold text-accent mb-4">Quick Setup Guide</p>
                                    <ol className="space-y-3 text-text-muted text-sm">
                                        <li className="flex gap-2 items-start"><span className="text-accent shrink-0 font-mono bg-accent/10 w-5 h-5 flex items-center justify-center rounded">1</span> <span className="pt-0.5">Open Telegram → search <strong>@BotFather</strong> → send <code>/newbot</code></span></li>
                                        <li className="flex gap-2 items-start"><span className="text-accent shrink-0 font-mono bg-accent/10 w-5 h-5 flex items-center justify-center rounded">2</span> <span className="pt-0.5">Copy the token and paste it here</span></li>
                                        <li className="flex gap-2 items-start"><span className="text-accent shrink-0 font-mono bg-accent/10 w-5 h-5 flex items-center justify-center rounded">3</span> <span className="pt-0.5">Click "Test Connection" to verify</span></li>
                                        <li className="flex gap-2 items-start"><span className="text-accent shrink-0 font-mono bg-accent/10 w-5 h-5 flex items-center justify-center rounded">4</span> <span className="pt-0.5">Send <code>/start</code> to your bot to lock in your Chat ID</span></li>
                                    </ol>
                                </div>
                                <div className="lg:col-span-3 grid grid-rows-3 gap-3 h-full">
                                    <div className="p-4 rounded-2xl bg-surface-2/30 border border-border flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center shrink-0">
                                            <CheckCircle2 className="w-5 h-5 text-success" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">Auto-Approve</p>
                                            <p className="text-[11px] text-text-muted">Payments below your threshold process instantly — no interruptions.</p>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-surface-2/30 border border-border flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center shrink-0">
                                            <Bell className="w-5 h-5 text-warning" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">Threshold Alert</p>
                                            <p className="text-[11px] text-text-muted">Above your threshold? You get a Telegram message with <strong className="text-success">Approve</strong> / <strong className="text-danger">Reject</strong> buttons.</p>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-surface-2/30 border border-border flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                                            <Clock className="w-5 h-5 text-accent" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">Activity Log</p>
                                            <p className="text-[11px] text-text-muted">Every payment — approved or rejected — is logged to your Telegram with tx details.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Row: Inputs */}
                            <div className="bg-surface-2/20 p-6 rounded-2xl border border-border/50 shadow-inner space-y-6">
                                {/* Bot Token */}
                                <div>
                                    <label className="block text-sm font-medium mb-1.5 text-white">Telegram Bot Token</label>
                                    <div className="relative">
                                        <input
                                            type={showToken ? "text" : "password"}
                                            value={telegramConfig.botToken}
                                            onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
                                            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                                            className="w-full px-4 py-3 bg-[#00000040] border border-border/60 rounded-xl text-sm text-white font-mono placeholder:text-text-muted/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all shadow-inner pr-20"
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                            <button
                                                onClick={() => setShowToken(!showToken)}
                                                className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted transition-colors"
                                                title={showToken ? "Hide" : "Show"}
                                            >
                                                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-text-muted mt-2 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> Never shared. Stored locally in your browser.
                                    </p>
                                </div>

                                {/* Test */}
                                <div>
                                    <button
                                        onClick={handleTest}
                                        disabled={testing || !telegramConfig.botToken}
                                        className="flex items-center justify-center w-full sm:w-auto gap-2 px-5 py-2.5 rounded-xl bg-[#229ED9]/10 text-[#229ED9] border border-[#229ED9]/20 text-sm font-semibold hover:bg-[#229ED9]/20 hover:border-[#229ED9]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {testing ? (
                                            <div className="w-4 h-4 border-2 border-[#229ED9] border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <TestTube className="w-4 h-4" />
                                        )}
                                        Test Connection
                                    </button>
                                    {testResult && (
                                        <div className={`flex items-center gap-2 mt-3 text-sm p-3 rounded-lg border ${testResult.ok ? "bg-success/10 text-success border-success/20" : "bg-danger/10 text-danger border-danger/20"}`}>
                                            {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                                            {testResult.msg}
                                        </div>
                                    )}
                                </div>

                                <hr className="border-border/50" />

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    {/* Chat ID */}
                                    <div>
                                        <label className="block text-sm font-medium mb-1.5 text-white">Your Chat ID</label>
                                        <input
                                            type="text"
                                            value={telegramConfig.chatId}
                                            onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })}
                                            placeholder="Auto-detected on /start"
                                            className="w-full px-4 py-3 bg-[#00000040] border border-border/60 rounded-xl text-sm font-mono text-white placeholder:text-text-muted/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all shadow-inner"
                                        />
                                    </div>

                                    {/* Threshold */}
                                    <div>
                                        <label className="block text-sm font-medium mb-1.5 text-white">Approval Threshold</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={telegramConfig.thresholdSTX}
                                                onChange={(e) => setTelegramConfig({ ...telegramConfig, thresholdSTX: e.target.value })}
                                                className="w-full px-4 py-3 bg-[#00000040] border border-border/60 rounded-xl text-sm font-mono text-white placeholder:text-text-muted/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all shadow-inner"
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-text-muted font-medium pl-2">STX</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between p-5 border-t border-border bg-surface-2/30">
                            <button
                                onClick={handleClearTelegram}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-danger hover:bg-danger/10 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Clear
                            </button>
                            <div className="flex items-center gap-3">
                                {saved && (
                                    <span className="text-sm text-success flex items-center gap-1">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Saved!
                                    </span>
                                )}
                                <button
                                    onClick={handleSave}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
                                >
                                    <Save className="w-4 h-4" />
                                    Save Settings
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ SCHEDULER TAB ═══ */}
                {activeTab === "scheduler" && (
                    <div className="rounded-2xl bg-surface border border-border overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center gap-3 p-5 border-b border-border">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-accent" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Agent Scheduler</h3>
                                <p className="text-xs text-text-muted">Configure when and how often the agent runs services</p>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-5 space-y-5">
                            {/* Schedule Mode */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Schedule Mode</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { value: "once", label: "Manual", desc: "Run once, then exit", icon: "▶️" },
                                        { value: "interval", label: "Interval", desc: "Repeating schedule", icon: "🔄" },
                                    ].map((mode) => (
                                        <button
                                            key={mode.value}
                                            onClick={() => setScheduleConfig({ ...scheduleConfig, mode: mode.value })}
                                            className={`p-3 rounded-lg border text-left transition-all ${scheduleConfig.mode === mode.value
                                                ? "border-accent bg-accent/5"
                                                : "border-border hover:border-border-hover"
                                                }`}
                                        >
                                            <span className="text-lg">{mode.icon}</span>
                                            <div className="text-xs font-medium mt-1">{mode.label}</div>
                                            <div className="text-[10px] text-text-muted">{mode.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Interval with unit selector */}
                            {scheduleConfig.mode === "interval" && (
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">Run every</label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setScheduleConfig({ ...scheduleConfig, intervalValue: Math.max(1, scheduleConfig.intervalValue - 1) })}
                                                className="p-1.5 rounded-lg bg-surface-2 border border-border hover:border-accent/30 transition-colors"
                                            >
                                                <Minus className="w-3.5 h-3.5" />
                                            </button>
                                            <input
                                                type="number"
                                                min="1"
                                                value={scheduleConfig.intervalValue}
                                                onChange={(e) => setScheduleConfig({ ...scheduleConfig, intervalValue: parseInt(e.target.value) || 1 })}
                                                className="w-16 px-3 py-2 text-center rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:border-accent"
                                            />
                                            <button
                                                onClick={() => setScheduleConfig({ ...scheduleConfig, intervalValue: scheduleConfig.intervalValue + 1 })}
                                                className="p-1.5 rounded-lg bg-surface-2 border border-border hover:border-accent/30 transition-colors"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        {/* Unit selector */}
                                        <div className="flex rounded-lg border border-border overflow-hidden">
                                            {["minutes", "hours", "days"].map((unit) => (
                                                <button
                                                    key={unit}
                                                    onClick={() => setScheduleConfig({ ...scheduleConfig, intervalUnit: unit })}
                                                    className={`px-3 py-2 text-xs font-medium transition-colors ${scheduleConfig.intervalUnit === unit
                                                        ? "bg-accent text-white"
                                                        : "bg-surface-2 text-text-muted hover:text-text"
                                                        }`}
                                                >
                                                    {unit}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Services to monitor */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Services to call</label>
                                <p className="text-[10px] text-text-muted mb-3">
                                    Select which X402 services the agent should pay for on each run.
                                </p>
                                <div className="space-y-2">
                                    {AVAILABLE_SERVICES.map((svc) => {
                                        const endpoints = scheduleConfig.serviceEndpoints.split(",").map(s => s.trim()).filter(Boolean);
                                        const isEnabled = endpoints.includes(svc.endpoint);

                                        return (
                                            <button
                                                key={svc.endpoint}
                                                onClick={() => {
                                                    let newEndpoints: string[];
                                                    if (isEnabled) {
                                                        newEndpoints = endpoints.filter(e => e !== svc.endpoint);
                                                    } else {
                                                        newEndpoints = [...endpoints, svc.endpoint];
                                                    }
                                                    setScheduleConfig({
                                                        ...scheduleConfig,
                                                        serviceEndpoints: newEndpoints.join(", ") || "/api/price-feed"
                                                    });
                                                }}
                                                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${isEnabled
                                                    ? "border-accent bg-accent/5"
                                                    : "border-border hover:border-border-hover"
                                                    }`}
                                            >
                                                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${isEnabled ? "bg-accent" : "bg-surface-2 border border-border"}`}>
                                                    {isEnabled && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium">{svc.name}</div>
                                                    <div className="text-[10px] text-text-muted">{svc.description}</div>
                                                </div>
                                                <span className="text-xs font-mono text-accent shrink-0">{svc.price}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Production note */}
                            <div className="p-3 rounded-xl bg-accent/5 border border-accent/10 text-[10px] text-text-muted flex items-start gap-2">
                                <AlertCircle className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                                <span>
                                    <strong className="text-text">Demo:</strong> schedule config is saved locally.{" "}
                                    <strong className="text-text">Production:</strong> config syncs automatically from UI → backend → agent.
                                </span>
                            </div>

                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end p-5 border-t border-border bg-surface-2/30">
                            <div className="flex items-center gap-3">
                                {saved && (
                                    <span className="text-sm text-success flex items-center gap-1">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Saved!
                                    </span>
                                )}
                                <button
                                    onClick={handleSave}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
                                >
                                    <Save className="w-4 h-4" />
                                    Save Settings
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── Data Delivery Tab ──────────────────── */}
                {activeTab === "delivery" && (
                    <div className="rounded-xl bg-surface border border-border overflow-hidden">
                        {/* Header */}
                        <div className="p-5 border-b border-border bg-surface-2/30">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Send className="w-5 h-5 text-accent" />
                                Data Delivery
                            </h2>
                            <p className="text-sm text-text-muted mt-1">
                                Choose how your agent delivers results after each service run.
                            </p>
                        </div>

                        <div className="p-5 space-y-5">
                            {/* Explanation */}
                            <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 text-sm">
                                <p className="font-medium text-accent mb-2">What is Data Delivery?</p>
                                <p className="text-text-muted leading-relaxed">
                                    After your agent pays for and retrieves data from X402 services, it needs to deliver the results somewhere. By default, results are only logged to the terminal. You can also forward them to your own app via <strong>Webhook</strong>, or serve them locally as a <strong>REST API</strong> that any app can fetch.
                                </p>
                            </div>

                            {/* Delivery mode selector */}
                            <div>
                                <label className="block text-sm font-medium mb-3">Delivery Mode</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { value: "off", label: "Terminal Only", desc: "Just log to terminal", icon: "📺" },
                                        { value: "webhook", label: "Webhook", desc: "POST results to your URL", icon: "📤" },
                                        { value: "api", label: "API Server", desc: "Serve at localhost:4000", icon: "🌐" },
                                        { value: "both", label: "Both", desc: "Webhook + API combined", icon: "⚡" },
                                    ].map((dm) => (
                                        <button
                                            key={dm.value}
                                            onClick={() => setScheduleConfig({ ...scheduleConfig, deliveryMode: dm.value })}
                                            className={`p-4 rounded-xl border text-left transition-all ${scheduleConfig.deliveryMode === dm.value
                                                ? "border-accent bg-accent/10 shadow-[0_0_15px_rgba(244,121,31,0.1)]"
                                                : "border-border hover:border-border-hover bg-surface-2/20"
                                                }`}
                                        >
                                            <span className="text-2xl">{dm.icon}</span>
                                            <div className="text-sm font-semibold mt-2">{dm.label}</div>
                                            <div className="text-[11px] text-text-muted mt-0.5">{dm.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Webhook URL */}
                            {(scheduleConfig.deliveryMode === "webhook" || scheduleConfig.deliveryMode === "both") && (
                                <div className="p-4 rounded-xl bg-surface-2/30 border border-border space-y-3">
                                    <label className="text-sm font-medium flex items-center gap-1.5">
                                        <Send className="w-4 h-4 text-accent" />
                                        Webhook URL
                                    </label>
                                    <input
                                        type="text"
                                        value={scheduleConfig.webhookUrl}
                                        onChange={(e) => setScheduleConfig({ ...scheduleConfig, webhookUrl: e.target.value })}
                                        placeholder="https://your-app.com/api/kova-data"
                                        className="w-full px-4 py-3 rounded-xl bg-background border border-border text-sm font-mono focus:outline-none focus:border-accent"
                                    />
                                    <p className="text-[10px] text-text-muted">
                                        Agent will POST JSON data to this URL after each run. Your app receives it automatically — no polling needed.
                                    </p>
                                </div>
                            )}

                            {/* API Info */}
                            {(scheduleConfig.deliveryMode === "api" || scheduleConfig.deliveryMode === "both") && (
                                <div className="p-4 rounded-xl bg-surface-2/30 border border-border space-y-3">
                                    <div className="flex items-center gap-1.5 font-medium text-sm">
                                        <Globe className="w-4 h-4 text-accent" />
                                        Agent API Server
                                    </div>
                                    <p className="text-sm text-text-muted">Your agent will serve live results at:</p>
                                    <code className="block px-4 py-3 rounded-xl bg-background border border-border text-accent font-mono text-sm select-all">
                                        http://localhost:4000/api/latest
                                    </code>
                                    <p className="text-[10px] text-text-muted">
                                        Any app, script, or browser can fetch this URL to get the freshest data your agent paid for.
                                    </p>
                                </div>
                            )}

                            {/* Production note */}
                            <div className="p-3 rounded-xl bg-accent/5 border border-accent/10 text-[10px] text-text-muted flex items-start gap-2">
                                <AlertCircle className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                                <span>
                                    <strong className="text-text">Demo:</strong> delivery config is saved locally.{" "}
                                    <strong className="text-text">Production:</strong> webhook URLs are encrypted and stored securely.
                                </span>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end p-5 border-t border-border bg-surface-2/30">
                            <div className="flex items-center gap-3">
                                {saved && (
                                    <span className="text-sm text-success flex items-center gap-1">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Saved!
                                    </span>
                                )}
                                <button
                                    onClick={handleSave}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
                                >
                                    <Save className="w-4 h-4" />
                                    Save Settings
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer note */}
                <p className="text-[10px] text-text-muted/50 mt-4 text-center flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-3 h-3" /> Demo: settings stored in localStorage. Production: encrypted via Secrets Manager.
                </p>
            </div>
        </div>
    );
}
