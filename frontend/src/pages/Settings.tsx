import { useState, useEffect } from "react";
import { useWallet } from "../context/WalletContext";
import { Bell, Save, Trash2, TestTube, CheckCircle2, AlertCircle, Eye, EyeOff, XCircle, Clock, Plus, Minus, Send, Globe, ChevronDown, Bot, Shield } from "lucide-react";
import { getSavedAgents, getSelectedAgent, setSelectedAgent, type AgentKeypair } from "../lib/agentKeys";
import { allowService, isServiceAllowed } from "../lib/contracts";
import { openSignatureRequestPopup } from "@stacks/connect";

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
  { 
    name: "Price Feed", 
    description: "Real-time BTC, ETH, STX prices", 
    price: "0.5 STX", 
    endpoint: "/api/price-feed", 
    address: "STEZW9BF0WATG4DXJTHBFP8WKKEANCY70059MHKW" // ✅ matches Services.tsx
  },
  { 
    name: "Text Summarizer", 
    description: "AI-powered text summarization", 
    price: "1 STX", 
    endpoint: "/api/summarize", 
    address: "ST2RXHMZKSQSTMK15JEQK4KP5N2YE66F999A7FSXE" // ✅ matches Services.tsx
  },
  { 
    name: "Image Generator", 
    description: "Generate images from text prompts", 
    price: "2 STX", 
    endpoint: "/api/image", 
    address: "ST2CV6BJQW3TJY1JXNC41ZEJH78H3H7Z6V011ZEC6" // ✅ matches Services.tsx
  },
  { 
    name: "Sentiment Analysis", 
    description: "Market sentiment from social feeds", 
    price: "1.5 STX", 
    endpoint: "/api/sentiment", 
    address: "ST12NKMH3Z1CKW4NV4M76XD3B4JEG1ZWKXXD91HFV" // ✅ matches Services.tsx
  },
  { 
    name: "On-chain Analytics", 
    description: "Whale tracking & DeFi metrics", 
    price: "2 STX", 
    endpoint: "/api/analytics", 
    address: "ST1T38B636V6BFAHTBMHZE3H4J98M3JZXT9SPY4F7" // ✅ matches Services.tsx
  },
];

function FadeInView({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return <div className={className}>{children}</div>;
}

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
    const [txStatus, setTxStatus] = useState("");
    const [showAllServices, setShowAllServices] = useState(false);
    const [allowedEndpoints, setAllowedEndpoints] = useState<string[]>([]);

    useEffect(() => {
        async function fetchAllowed() {
            if (!address || !selectedAgentAddr) return;
            
            let allowed: string[] = [];
            for (const svc of AVAILABLE_SERVICES) {
                try {
                    const resp = await isServiceAllowed(address, selectedAgentAddr, svc.address);
                    // Match mathematical allowance and explicit explicit user clicks
                    if (resp.value === true) allowed.push(svc.endpoint);
                } catch {}
            }
            setAllowedEndpoints(allowed);
        }
        fetchAllowed();
    }, [address, selectedAgentAddr, activeTab, txStatus]);

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

    async function handleSave() {
        if (!address || !!txStatus) return; // Prevent double-clicks (debounce)
        
        if (activeTab === "notifications") {
            setTxStatus("Requesting wallet signature...");
            let nonce = Date.now().toString();
            try {
                const nRes = await fetch("http://localhost:4000/api/nonce");
                const nData = await nRes.json();
                if (nData.nonce) nonce = nData.nonce;
            } catch (e) { console.error("Could not fetch server nonce."); }

            const messageToSign = `kova:link-telegram:${address}:${nonce}`;

            openSignatureRequestPopup({
                message: messageToSign,
                network: "testnet",
                appDetails: { name: "Kova", icon: window.location.origin + "/favicon.ico" },
                onFinish: async (data) => {
                    setTxStatus("Saving config to backend...");
                    try {
                        const res = await fetch("http://localhost:4000/api/save-telegram-config", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                owner: address,
                                botToken: telegramConfig.botToken,
                                chatId: telegramConfig.chatId,
                                thresholdSTX: telegramConfig.thresholdSTX,
                                nonce,
                                publicKey: data.publicKey,
                                signature: data.signature,
                            })
                        });
                        
                        if (!res.ok) {
                            const err = await res.json();
                            setTxStatus(`Auth failed: ${err.error || "Unknown"}`);
                            setTimeout(() => setTxStatus(""), 4000);
                            return;
                        }

                        saveTelegramConfig(address, telegramConfig);
                        setTxStatus("");
                        setSaved(true);
                        setTimeout(() => setSaved(false), 2000);
                    } catch (err) {
                        setTxStatus("Local backend not running");
                        setTimeout(() => setTxStatus(""), 3000);
                    }
                },
                onCancel: () => {
                    setTxStatus("Signature canceled");
                    setTimeout(() => setTxStatus(""), 3000);
                }
            });
            return;
        }

        const agentAddr = selectedAgentAddr;
        if (!agentAddr) return;

        const newEndpoint = scheduleConfig.serviceEndpoints; 
        const serviceAddr = AVAILABLE_SERVICES.find(s => s.endpoint === newEndpoint)?.address;

        const saveAndNotify = async () => {
            const configKey = agentAddr || address;
            saveScheduleConfig(configKey, scheduleConfig);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            
            // Sync with running backend
            try {
                await fetch("http://localhost:4000/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mode: scheduleConfig.mode,
                        intervalValue: toMinutes(scheduleConfig.intervalValue, scheduleConfig.intervalUnit),
                        serviceEndpoints: scheduleConfig.serviceEndpoints,
                        ownerAddress: address,
                        agentAddress: agentAddr,
                        deliveryMode: scheduleConfig.deliveryMode,    
                        webhookUrl: scheduleConfig.webhookUrl,
                    })
                });
            } catch { console.log("Backend not running"); }
        };

        if (serviceAddr) {
            setTxStatus("Checking on-chain rules...");
            try {
                const resp = await isServiceAllowed(address, agentAddr, serviceAddr);
                if (resp.value === false) {
                    setTxStatus("Please sign transaction to allow this service...");
                    allowService(agentAddr, serviceAddr, (data) => {
                        if (data && data.error) {
                            setTxStatus(`Error: ${data.error}`);
                        } else {
                            setTxStatus("Tx submitted! Settings will save locally.");
                            saveAndNotify();
                            setTimeout(() => setTxStatus(""), 4000);
                        }
                    });
                    return; 
                }
            } catch (err) {
                console.error(err);
                setTxStatus("Error checking service status");
                console.error("Failed to check service status:", err);
                let errMsg = "Failed to check service on-chain";
                if (err instanceof Error) errMsg = err.message;
                setTxStatus(`Error: ${errMsg}. Check console.`);
                setTimeout(() => setTxStatus(""), 4000);
                return; // Do not blindly save if the on-chain validation throws a technical error
            }
        }
        
        setTxStatus("");
        saveAndNotify();
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
    <div className="min-h-screen w-full bg-[#030303] text-white pt-10 pb-20 px-6 font-sans relative overflow-x-hidden">
      
      {/* Subtle Monochrome Auroras */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-white opacity-[0.02] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[20%] right-[-10%] w-[600px] h-[600px] bg-white opacity-[0.02] blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10 animate-fade-in">
        
        {/* ─── Header ──────────────────────────────── */}
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-medium text-white tracking-tight mb-2">Platform Settings</h1>
            <p className="text-text-muted text-sm mb-6">
                Configure notifications and per-agent behavior
            </p>
        </div>

        {/* ─── Agent Selector (Monochrome Glass) ─────────────────── */}
        {agents.length > 0 && (
          <div className="mb-10 max-w-sm relative z-40">
            <label className="block text-[10px] font-mono text-cyan-400/80 mb-2 uppercase tracking-widest">Configure Agent</label>
            <button
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.08] rounded-2xl hover:bg-white/[0.04] transition-all shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/[0.05] border border-cyan-400/20 flex items-center justify-center shadow-inner">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-white/90">{selectedAgent?.label || "Select Agent"}</p>
                  <p className="text-[10px] font-mono text-cyan-400/60 truncate max-w-[200px]">{selectedAgentAddr || "—"}</p>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-white/40 transition-transform duration-300 ${agentDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            
            {agentDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50 py-1">
                {agents.map((agent, idx) => (
                  <button
                    key={agent.address}
                    onClick={() => handleSelectAgent(agent.address)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left ${agent.address === selectedAgentAddr ? "bg-white/[0.02] relative" : ""}`}
                  >
                    {agent.address === selectedAgentAddr && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />}
                    <Bot className={`w-4 h-4 flex-shrink-0 ${agent.address === selectedAgentAddr ? "text-cyan-400" : "text-white/40"}`} />
                    <div>
                        <p className={`text-sm font-medium ${agent.address === selectedAgentAddr ? "text-white" : "text-white/70"}`}>{agent.label}</p>
                        <p className={`text-[10px] font-mono truncate max-w-[220px] ${agent.address === selectedAgentAddr ? "text-cyan-400/60" : "text-white/40"}`}>{agent.address}</p>
                    </div>
                    </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Tab Navigation (Pills) ───────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-8">
          {tabs.map(tab => (
            <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                ? "bg-white text-black shadow-md" 
                : "bg-white/[0.02] border border-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.04]"
                }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Status ─── */}
        {txStatus && (
          <div className="flex items-center gap-3 p-4 mb-6 rounded-2xl bg-cyan-500/[0.05] border border-cyan-400/20 backdrop-blur-md max-w-2xl">
            <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-cyan-400 font-light drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">{txStatus}</span>
          </div>
        )}

        <div className="max-w-2xl">

          {/* ═══════ NOTIFICATIONS TAB ═══════ */}
          {activeTab === "notifications" && (
            <FadeInView>
              <div className="rounded-3xl bg-white/[0.02] border border-white/[0.05] overflow-hidden backdrop-blur-sm">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 md:p-8 border-b border-white/[0.05]">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-sky-500/[0.1] border border-sky-400/20 flex items-center justify-center">
                      <Bell className="w-5 h-5 text-sky-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-lg text-white/90 tracking-tight">Telegram Setup</h3>
                      <p className="text-xs text-white/40 font-light mt-0.5">Human-in-the-loop payment verification</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTelegramConfig({ ...telegramConfig, enabled: !telegramConfig.enabled })}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${telegramConfig.enabled ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.4)]" : "bg-white/10 border border-white/5"}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${telegramConfig.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
                  </button>
                </div>

                {/* Body */}
                <div className={`p-6 md:p-8 space-y-8 transition-opacity duration-300 ${telegramConfig.enabled ? "opacity-100" : "opacity-30 pointer-events-none"}`}>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/[0.03] shadow-inner">
                      <p className="font-medium text-white/90 mb-4 text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Quick Configuration
                      </p>
                      <ol className="space-y-3 text-white/50 text-sm font-light leading-relaxed">
                        <li>1. Open Telegram → search <strong>@BotFather</strong> → send <code className="font-mono text-[10px] bg-white/10 px-1 py-0.5 rounded text-white/80">/newbot</code></li>
                        <li>2. Copy the token and paste it here</li>
                        <li>3. Click "Test Connection" to verify</li>
                        <li>4. Send <code className="font-mono text-[10px] bg-white/10 px-1 py-0.5 rounded text-white/80">/start</code> to your new bot to lock in your Chat ID</li>
                      </ol>
                    </div>

                    <div className="grid grid-rows-3 gap-3">
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-4 hover:bg-white/[0.04] transition-colors">
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/[0.1] border border-cyan-400/20 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div>
                            <p className="text-sm font-medium text-white/90">Auto-Approve</p>
                            <p className="text-[11px] text-white/40 font-light mt-0.5">Payments below your threshold process instantly — no interruptions.</p>
                            </div>
                        </div>
                        
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-4 hover:bg-white/[0.04] transition-colors">
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/[0.1] border border-cyan-400/20 flex items-center justify-center shrink-0">
                            <Bell className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div>
                            <p className="text-sm font-medium text-white/90">Threshold Alert</p>
                            <p className="text-[11px] text-white/40 font-light mt-0.5">Above threshold? Get a message with <strong className="text-white/80">Approve</strong> / <strong className="text-white/80">Reject</strong> buttons.</p>
                            </div>
                        </div>
                        
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-4 hover:bg-white/[0.04] transition-colors">
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/[0.1] border border-cyan-400/20 flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div>
                            <p className="text-sm font-medium text-white/90">Activity Log</p>
                            <p className="text-[11px] text-white/40 font-light mt-0.5">Every payment is logged directly to your Telegram with tx details.</p>
                            </div>
                        </div>
                    </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Bot Token */}
                    <div>
                      <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Telegram Bot Token</label>
                      <div className="relative flex gap-3">
                        <div className="relative flex-1">
                          <input
                            type={showToken ? "text" : "password"}
                            value={telegramConfig.botToken}
                            onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
                            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                            className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner pr-12"
                          />
                          <button
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/10 text-white/40 transition-colors"
                            title={showToken ? "Hide" : "Show"}
                          >
                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <button
                          onClick={handleTest}
                          disabled={testing || !telegramConfig.botToken}
                          className="px-6 py-3.5 rounded-xl bg-white text-black font-semibold text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 shadow-[0_0_15px_rgba(255,255,255,0.15)] flex items-center gap-2"
                        >
                          {testing ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <TestTube className="w-4 h-4" />}
                          Test Connection
                        </button>
                      </div>
                      
                      {testResult && (
                        <div className={`flex items-center gap-2 mt-3 text-xs font-mono p-3 rounded-xl border ${testResult.ok ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                          {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                          {testResult.msg}
                        </div>
                      )}
                    </div>

                    <hr className="border-white/[0.05]" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* Chat ID */}
                      <div>
                        <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Your Chat ID</label>
                        <input
                          type="text"
                          value={telegramConfig.chatId}
                          onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })}
                          placeholder="Auto-detected on /start"
                          className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner"
                        />
                      </div>

                      {/* Threshold */}
                      <div>
                        <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Approval Threshold</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={telegramConfig.thresholdSTX}
                            onChange={(e) => setTelegramConfig({ ...telegramConfig, thresholdSTX: e.target.value })}
                            className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40 font-mono">STX</span>
                        </div>
                      </div>
                    </div>
                  </div>
                

                {/* Footer */}
                <div className="flex items-center justify-between p-6 md:p-8 border-t border-white/[0.05] bg-white/[0.01]">
                  <button
                    onClick={handleClearTelegram}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-widest text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Reset
                  </button>
                  <div className="flex items-center gap-4">
                    {saved && (
                      <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5 uppercase tracking-widest">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={!!txStatus}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500/[0.1] border border-cyan-400/20 hover:bg-cyan-400 hover:text-black text-cyan-400 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" />
                      Save Settings
                    </button>
                  </div>
                </div>
              </div>
            </FadeInView>
          )}

          {/* ═══════ SCHEDULER TAB ═══════ */}
          {activeTab === "scheduler" && (
            <FadeInView>
              <div className="rounded-3xl bg-white/[0.02] border border-white/[0.05] overflow-hidden backdrop-blur-sm">
                {/* Header */}
                <div className="flex items-center gap-4 p-6 md:p-8 border-b border-white/[0.05]">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/[0.1] border border-amber-400/20 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-lg text-white/90 tracking-tight">Agent Scheduler</h3>
                    <p className="text-xs text-white/40 font-light mt-0.5">Control execution frequency and logic loops.</p>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 md:p-8 space-y-8">
                  {/* Schedule Mode */}
                  <div>
                    <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3">Execution Mode</label>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { value: "once", label: "Manual Trigger", desc: "Execute once and halt.", icon: "▶" },
                        { value: "interval", label: "Autonomous Loop", desc: "Run continuously on interval.", icon: "∞" },
                      ].map((mode) => (
                        <button
                          key={mode.value}
                          onClick={() => setScheduleConfig({ ...scheduleConfig, mode: mode.value })}
                          className={`p-5 rounded-2xl border text-left transition-all duration-300 ${
                            scheduleConfig.mode === mode.value
                              ? "border-cyan-400 bg-cyan-500/[0.05] shadow-[0_0_15px_rgba(34,211,238,0.1)]"
                              : "border-white/[0.05] hover:border-white/20 bg-white/[0.01]"
                          }`}
                        >
                          <span className={`text-xl ${scheduleConfig.mode === mode.value ? "text-cyan-400" : "text-white/40"}`}>{mode.icon}</span>
                          <div className={`text-sm font-medium mt-3 ${scheduleConfig.mode === mode.value ? "text-white/90" : "text-white/60"}`}>{mode.label}</div>
                          <div className="text-[11px] font-light text-white/40 mt-1">{mode.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Interval Config */}
                  {scheduleConfig.mode === "interval" && (
                    <div className="animate-fade-in-scale">
                      <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3">Interval Frequency</label>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setScheduleConfig({ ...scheduleConfig, intervalValue: Math.max(1, scheduleConfig.intervalValue - 1) })}
                            className="p-3 rounded-xl bg-white/[0.02] border border-white/10 hover:border-cyan-400/50 hover:text-cyan-400 transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={scheduleConfig.intervalValue}
                            onChange={(e) => setScheduleConfig({ ...scheduleConfig, intervalValue: parseInt(e.target.value) || 1 })}
                            className="w-20 px-3 py-3 text-center rounded-xl bg-[#0A0A0A] border border-white/10 text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
                          />
                          <button
                            onClick={() => setScheduleConfig({ ...scheduleConfig, intervalValue: scheduleConfig.intervalValue + 1 })}
                            className="p-3 rounded-xl bg-white/[0.02] border border-white/10 hover:border-cyan-400/50 hover:text-cyan-400 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex rounded-xl border border-white/10 overflow-hidden bg-white/[0.02]">
                          {["minutes", "hours", "days"].map((unit) => (
                            <button
                              key={unit}
                              onClick={() => setScheduleConfig({ ...scheduleConfig, intervalUnit: unit })}
                              className={`px-4 py-3 text-[11px] font-mono uppercase tracking-widest transition-colors ${
                                scheduleConfig.intervalUnit === unit
                                  ? "bg-white text-black"
                                  : "text-white/40 hover:text-white hover:bg-white/[0.04]"
                              }`}
                            >
                              {unit}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Target Services */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest">Target Endpoint</label>
                      <button 
                        onClick={() => setShowAllServices(!showAllServices)}
                        className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 uppercase tracking-widest transition-colors"
                      >
                        {showAllServices ? "Show Allowed Only" : "Show Marketplace"}
                      </button>
                    </div>
                    <p className="text-[10px] text-text-muted mb-3" title="Allowed services only — click 'Show all' to view marketplace">
                        Select which X402 services the agent should pay for on each run.
                    </p>
                    <div className="space-y-3">
                      {AVAILABLE_SERVICES.filter(s => showAllServices || allowedEndpoints.includes(s.endpoint) || scheduleConfig.serviceEndpoints === s.endpoint).map((svc) => {
                        const isEnabled = scheduleConfig.serviceEndpoints === svc.endpoint;
                        const isAllowed = allowedEndpoints.includes(svc.endpoint);

                        return (
                          <div key={svc.endpoint} className={`w-full flex flex-col p-4 rounded-2xl border transition-all ${isEnabled ? "border-cyan-400/30 bg-cyan-500/[0.05]" : "border-white/[0.05] bg-white/[0.01] hover:border-white/20"}`}>
                            <button
                              onClick={() => setScheduleConfig({ ...scheduleConfig, serviceEndpoints: svc.endpoint })}
                              className="w-full flex items-center gap-4 text-left"
                            >
                              <div className={`w-5 h-5 flex items-center justify-center shrink-0 rounded-full border ${isEnabled ? "border-cyan-400 bg-cyan-400" : "border-white/20"}`}>
                                {isEnabled && <CheckCircle2 className="w-5 h-5 text-[#030303]" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm font-medium ${isEnabled ? "text-white" : "text-white/80"}`}>{svc.name}</div>
                                <div className="text-[11px] font-light text-white/40 mt-0.5">{svc.description}</div>
                              </div>
                              <span className="text-[10px] font-mono text-white/40 shrink-0">{svc.price}</span>
                            </button>
                            
                            {isEnabled && !isAllowed && (
                              <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center justify-between">
                                <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest flex items-center gap-2">
                                  <Shield className="w-3.5 h-3.5" /> Service unallowed by this agent.
                                </span>
                                <button 
                                  onClick={handleSave} 
                                  className="px-4 py-2 bg-white hover:bg-gray-200 text-black text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                                >
                                  Sign to Allow
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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

                {/* Footer */}
                <div className="flex items-center justify-end p-6 md:p-8 border-t border-white/[0.05] bg-white/[0.01]">
                <div className="text-sm text-accent max-w-[50%] truncate">
                    {txStatus}
                </div>
                  <div className="flex items-center gap-4">
                    {saved && (
                      <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5 uppercase tracking-widest">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={!!txStatus}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500/[0.1] border border-cyan-400/20 hover:bg-cyan-400 hover:text-black text-cyan-400 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" />
                      Save Settings
                    </button>
                  </div>
                </div>
              </div>
            </FadeInView>
          )}

          {/* ═══════ DATA DELIVERY TAB ═══════ */}
          {activeTab === "delivery" && (
            <FadeInView>
              <div className="rounded-3xl bg-white/[0.02] border border-white/[0.05] overflow-hidden backdrop-blur-sm">
                {/* Header */}
                <div className="flex items-center gap-4 p-6 md:p-8 border-b border-white/[0.05]">
                  <div className="w-12 h-12 rounded-xl bg-fuchsia-500/[0.1] border border-fuchsia-400/20 flex items-center justify-center">
                    <Send className="w-5 h-5 text-fuchsia-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-lg text-white/90 tracking-tight">Data Delivery</h3>
                    <p className="text-xs text-white/40 font-light mt-0.5">Choose how your agent delivers results after each service run.</p>
                  </div>
                </div>

                <div className="p-6 md:p-8 space-y-8">
                    {/* Explanation */}
                    <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 text-sm">
                        <p className="font-medium text-accent mb-2">What is Data Delivery?</p>
                        <p className="text-text-muted leading-relaxed">
                            After your agent pays for and retrieves data from X402 services, it needs to deliver the results somewhere. By default, results are only logged to the terminal. You can also forward them to your own app via <strong>Webhook</strong>, or serve them locally as a <strong>REST API</strong> that any app can fetch.
                        </p>
                    </div>                  
                  
                  {/* Delivery mode selector */}
                  <div>
                    <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3">Delivery Protocol</label>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { value: "off", label: "Local Terminal", desc: "Log to agent.js console (Dev).", icon: "📺" },
                        { value: "webhook", label: "Webhook Push", desc: "POST payload to remote URL.", icon: "📤" },
                        { value: "api", label: "Local API", desc: "Serve at localhost:4000.", icon: "🌐" },
                        { value: "both", label: "Hybrid", desc: "Webhook + API concurrent.", icon: "⚡" },
                      ].map((dm) => (
                        <button
                          key={dm.value}
                          onClick={() => setScheduleConfig({ ...scheduleConfig, deliveryMode: dm.value })}
                          className={`p-5 rounded-2xl border text-left transition-all duration-300 ${
                            scheduleConfig.deliveryMode === dm.value
                              ? "border-cyan-400 bg-cyan-500/[0.05] shadow-[0_0_15px_rgba(34,211,238,0.1)]"
                              : "border-white/[0.05] hover:border-white/20 bg-white/[0.01]"
                          }`}
                        >
                          <span className={`text-xl ${scheduleConfig.deliveryMode === dm.value ? "text-cyan-400" : "text-white/40"}`}>{dm.icon}</span>
                          <div className={`text-sm font-medium mt-3 ${scheduleConfig.deliveryMode === dm.value ? "text-white/90" : "text-white/60"}`}>{dm.label}</div>
                          <div className="text-[11px] font-light text-white/40 mt-1">{dm.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Webhook URL */}
                  {(scheduleConfig.deliveryMode === "webhook" || scheduleConfig.deliveryMode === "both") && (
                    <div className="animate-fade-in-scale">
                      <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3">Webhook Endpoint</label>
                      <input
                        type="text"
                        value={scheduleConfig.webhookUrl}
                        onChange={(e) => setScheduleConfig({ ...scheduleConfig, webhookUrl: e.target.value })}
                        placeholder="https://api.your-app.com/kova-data"
                        className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner"
                      />
                      <p className="text-[10px] text-white/40 mt-3 font-light leading-relaxed">
                        Agent will POST JSON data to this URL after each run. Your app receives it automatically — no polling needed.
                      </p>
                    </div>
                  )}

                  {/* API Info */}
                  {(scheduleConfig.deliveryMode === "api" || scheduleConfig.deliveryMode === "both") && (
                    <div className="animate-fade-in-scale p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                      <div className="flex items-center gap-2 font-medium text-sm text-white/80 mb-2">
                        <Globe className="w-4 h-4 text-cyan-400" />
                        Agent API Server
                      </div>
                      <p className="text-xs text-white/40 font-light mb-4">Your agent will serve the latest verified data payload via GET request at:</p>
                      <code className="block px-4 py-3.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-cyan-400 font-mono text-sm select-all text-center">
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
                            <strong className="text-text">Production:</strong> webhook URLs and config are stored on backend databases securely.
                        </span>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end p-6 md:p-8 border-t border-white/[0.05] bg-white/[0.01]">
                  <div className="flex items-center gap-4">
                    {saved && (
                      <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5 uppercase tracking-widest">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={!!txStatus}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500/[0.1] border border-cyan-400/20 hover:bg-cyan-400 hover:text-black text-cyan-400 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" />
                      Save Settings
                    </button>
                  </div>
                </div>
              </div>
            </FadeInView>
          )}

          <div className="mt-8 text-center p-6 rounded-3xl border border-dashed border-white/[0.05] bg-white/[0.01]">
            <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest leading-loose">
              Demo: Configs stored in localStorage.<br/>
              Production: Encrypted & Synced via Kova KMS.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}