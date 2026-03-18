import { useEffect, useState, useRef } from "react";
import { useWallet } from "../context/WalletContext";
import {
  allowService,
  disallowService,
  isServiceAllowed,
  getServiceCount,
  getUserService,
} from "../lib/contracts";
import { getSavedAgents, type AgentKeypair } from "../lib/agentKeys";
import {
  Globe,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  CheckCircle2,
  Zap,
  FileText,
  Image as ImageIcon,
  BarChart3,
  BrainCircuit,
  Store,
  ExternalLink,
  Search,
  Bot,
  ChevronDown,
  Cpu,
  AlertTriangle
} from "lucide-react";

const STORAGE_KEY = "kova-allowed-services";
const EXPLICIT_KEY = "kova-allowed-services-explicit";

// Marketplace services
const MARKETPLACE_SERVICES = [
  {
    name: "Price Feed",
    description: "Real-time crypto price data (BTC, ETH, STX) with 2% change tracking",
    address: "STEZW9BF0WATG4DXJTHBFP8WKKEANCY70059MHKW",
    price: "0.5 STX",
    category: "Data",
    icon: BarChart3,
    url: "http://localhost:3402/api/price-feed",
    verified: true,
  },
  {
    name: "Text Summarizer",
    description: "AI-powered text summarization using GPT models. Send long content, get concise summaries.",
    address: "ST2RXHMZKSQSTMK15JEQK4KP5N2YE66F999A7FSXE",
    price: "1 STX",
    category: "AI",
    icon: FileText,
    url: "http://localhost:3402/api/summarize",
    verified: true,
  },
  {
    name: "Image Generator",
    description: "Generate AI images from text prompts. Powered by DALL-E and Stability AI.",
    address: "ST2CV6BJQW3TJY1JXNC41ZEJH78H3H7Z6V011ZEC6",
    price: "2 STX",
    category: "AI",
    icon: ImageIcon,
    url: "http://localhost:3402/api/image",
    verified: true,
  },
  {
    name: "Sentiment Analysis",
    description: "Analyze market sentiment from social media and news feeds for trading signals.",
    address: "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDNEF55B3MFHQR_",
    price: "1.5 STX",
    category: "AI",
    icon: BrainCircuit,
    url: "https://api.example.com/sentiment",
    verified: false,
  },
  {
    name: "On-chain Analytics",
    description: "Deep analysis of wallet activity, whale movements, and DeFi protocol metrics.",
    address: "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDNEF55B3MFHQR__",
    price: "2 STX",
    category: "Data",
    icon: Zap,
    url: "https://api.example.com/analytics",
    verified: false,
  },
];

function getSavedServices(owner: string, agentAddr?: string): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const key = agentAddr ? `${owner}-${agentAddr}` : owner;
    return data[key] || [];
  } catch {
    return [];
  }
}

function saveServices(owner: string, agentAddr: string, services: string[]) {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const key = `${owner}-${agentAddr}`;
    data[key] = services;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function detectCategory(name: string, description: string): string {
  const text = (name + " " + description).toLowerCase();
  if (text.includes("price") || text.includes("feed") || text.includes("data") || text.includes("analytic")) return "Data";
  if (text.includes("ai") || text.includes("summar") || text.includes("image") || text.includes("sentiment") || text.includes("llm")) return "AI";
  if (text.includes("weather") || text.includes("news") || text.includes("market")) return "Data";
  return "Custom";
}

interface AllowedService {
  address: string;
  name?: string;
  allowed: boolean;
}

// Fade Animation Wrapper
function FadeInView({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) {
  const domRef = useRef<HTMLDivElement>(null);
  const [isVisible, setVisible] = useState(false);

  useEffect(() => {
    const el = domRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={domRef}
      className={`transition-all duration-1000 ease-out ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function Services() {
  const { address } = useWallet();
  const [services, setServices] = useState<AllowedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingService, setLoadingService] = useState<string | null>(null);
  const [addAddr, setAddAddr] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [tab, setTab] = useState<"marketplace" | "allowlist">("marketplace");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [agents, setAgents] = useState<AgentKeypair[]>([]);
  const [selectedAgentIdx, setSelectedAgentIdx] = useState(0);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [onChainServices, setOnChainServices] = useState<any[]>([]);

  const agentAddr = agents[selectedAgentIdx]?.address;
  const isReady = !!address && !!agentAddr;

  async function pushAudit(action: string, details: any) {
    if (!address) return;
    try {
      await fetch("http://localhost:4000/api/audit-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, owner: address, ...details })
      });
    } catch {}
  }

  useEffect(() => {
    if (!address) return;
    setAgents(getSavedAgents(address));
  }, [address]);

  useEffect(() => {
    if (!address || agents.length === 0) {
      setLoading(false);
      return;
    }
    loadAllowedServices();
  }, [selectedAgentIdx, agents, address]);

  async function loadAllowedServices() {
    setLoading(true);
    const agentAddr = agents[selectedAgentIdx]?.address;
    if (!agentAddr || !address) { setLoading(false); return; }

    const savedAddrs = getSavedServices(address, agentAddr);
    const marketplaceAddrs = MARKETPLACE_SERVICES.map(s => s.address);
    const allAddrs = [...new Set([...savedAddrs, ...marketplaceAddrs])];

    const checks = await Promise.all(
      allAddrs.map(async (addr) => {
        try {
          const resp = await isServiceAllowed(address, agentAddr, addr);
          const allowed = !!(resp?.value === true || resp?.value?.value === true);
          if (allowed && !savedAddrs.includes(addr)) {
            const saved = getSavedServices(address, agentAddr);
            saveServices(address, agentAddr, [...saved, addr]);
          }
          return { address: addr, allowed };
        } catch {
          return { address: addr, allowed: false };
        }
      })
    );
    setServices(checks.filter(c => c.allowed || savedAddrs.includes(c.address)));
    setLoading(false);
  }

  useEffect(() => {
      loadOnChainServices();
  }, []); 

  async function loadOnChainServices() {
    try {
        const resp = await fetch("http://localhost:3402/api/services");
        if (!resp.ok) return;
        const data = await resp.json();
        const svcs = (data.services || [])
            .filter((s: any) => s.active)
            .map((s: any) => ({
                name: s.name,
                description: s.description,
                address: s.address,
                price: (() => {
                  const stx = parseFloat(String(s.priceSTX ?? ""));
                  if (!isNaN(stx) && stx > 0) return `${stx.toFixed(2)} STX`;
                  const micro = Number(s.price);
                  if (!isNaN(micro) && micro > 0) return `${(micro / 1_000_000).toFixed(2)} STX`;
                  return "0.00 STX";
                })(),
                category: detectCategory(s.name, s.description),
                icon: Zap,
                url: s.url,
                verified: false,
            }))
            .filter((s: any) => !MARKETPLACE_SERVICES.some(m => m.name === s.name));
        setOnChainServices(svcs);
    } catch (e) {
    }
  }

  function handleAllow(serviceAddr: string, serviceName: string) {
    const agentAddr = agents[selectedAgentIdx]?.address;
    if (!address) { setTxStatus("Connect wallet first"); return; }
    if (!agentAddr) { setTxStatus("Select an agent first"); return; }
    setTxStatus("Confirm in your wallet...");
    setLoadingService(serviceName);
    allowService(agentAddr, serviceAddr, (data) => {
      if (data && data.error) {
        setTxStatus(`Error: ${data.error}`);
        setLoadingService(null);
        setTimeout(() => setTxStatus(""), 4000);
        return;
      }

      setTxStatus("Transaction submitted! Waiting for confirmation...");

      const saved = getSavedServices(address!, agentAddr);
      if (!saved.includes(serviceAddr)) {
        saveServices(address!, agentAddr, [...saved, serviceAddr]);
      }

      if (serviceName) {
        try {
          const storeKey = `${EXPLICIT_KEY}-${agentAddr}`;
          const stored = JSON.parse(localStorage.getItem(storeKey) || "{}");
          const list: string[] = stored[address!] || [];
          if (!list.includes(serviceAddr)) list.push(serviceAddr);
          stored[address!] = list;
          localStorage.setItem(storeKey, JSON.stringify(stored));
        } catch { }
      }

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const resp = await isServiceAllowed(address!, agentAddr, serviceAddr);
          if (resp.value === true || attempts >= 24) {
            clearInterval(poll);
            if (resp.value === true) pushAudit("ALLOW_SERVICE", { agentAddr, serviceAddr, serviceName });
            setTxStatus(resp.value === true ? "Service allowed!" : "");
            setLoadingService(null);
            setTimeout(() => setTxStatus(""), 3000);
            loadAllowedServices();
          }
        } catch {
          if (attempts >= 24) {
            clearInterval(poll);
            setTxStatus("");
            setLoadingService(null);
          }
        }
      }, 5000);
    });
  }

  function handleDisallow(serviceAddr: string, serviceName: string) {
    const agentAddr = agents[selectedAgentIdx]?.address;
    if (!address || !agentAddr) return;
    setTxStatus("Confirm in your wallet...");
    setLoadingService(serviceName);
    disallowService(agentAddr, serviceAddr, (data) => {
      if (data && data.error) {
        setTxStatus(`Error: ${data.error}`);
        setLoadingService(null);
        setTimeout(() => setTxStatus(""), 4000);
        return;
      }
      
      setTxStatus("Transaction submitted! Waiting for confirmation...");

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const resp = await isServiceAllowed(address!, agentAddr, serviceAddr);
          if (resp.value !== true || attempts >= 24) {
            clearInterval(poll);
            if (resp.value !== true) pushAudit("DISALLOW_SERVICE", { agentAddr, serviceAddr });
            setTxStatus(resp.value !== true ? "Service removed!" : "");
            setLoadingService(null);
            setTimeout(() => setTxStatus(""), 3000);
            loadAllowedServices();
          }
        } catch {
          if (attempts >= 24) {
            clearInterval(poll);
            setTxStatus("");
            setLoadingService(null);
          }
        }
      }, 5000);
    });
  }

  function handleAddByAddress() {
    if (!addAddr.startsWith("ST") && !addAddr.startsWith("SP")) return;
    handleAllow(addAddr, "Unknown");
    setAddAddr("");
  }

  function handleRemoveFromList(addr: string) {
    const agentAddr = agents[selectedAgentIdx]?.address;
    if (!agentAddr) return;
    const saved = getSavedServices(address!, agentAddr);
    saveServices(address!, agentAddr, saved.filter((s) => s !== addr));
    setServices(services.filter((s) => s.address !== addr));
  }

  function isAllowlistedByAddress(addr: string): boolean {
    return services.some(s => s.address === addr && s.allowed);
  }

  const allServices = [
      ...MARKETPLACE_SERVICES,
      ...onChainServices.filter(s => 
          !MARKETPLACE_SERVICES.some(m => m.name === s.name)
      )
  ];

  const filteredServices = allServices.filter((s) => {
    const matchesSearch = searchQuery === "" ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "All" || s.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen w-full bg-[#030303] text-white pt-10 pb-20 px-6 font-sans relative overflow-x-hidden">
      
      {/* Subtle Monochrome Auroras */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-white opacity-[0.02] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[20%] right-[-10%] w-[600px] h-[600px] bg-white opacity-[0.02] blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10 animate-fade-in">
        
        {/* ─── Header & Tabs ──────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-medium text-white tracking-tight mb-2">Service Marketplace</h1>
            <p className="text-white/50 font-light max-w-xl">
              {tab === "marketplace"
                ? "Browse available X402 protocol services and allowlist them for your agent."
                : "Manage the strict boundary of services your agent is authorized to pay."}
            </p>
          </div>

          <div className="flex gap-1.5 p-1.5 rounded-2xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-md w-fit">
            <button
              onClick={() => setTab("marketplace")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-medium transition-all duration-300 ${
                tab === "marketplace" ? "bg-white text-black shadow-md" : "text-white/50 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Store className="w-4 h-4" />
              Marketplace
            </button>
            <button
              onClick={() => setTab("allowlist")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-medium transition-all duration-300 ${
                tab === "allowlist" ? "bg-white text-black shadow-md" : "text-white/50 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              My Allowlist
            </button>
          </div>
        </div>

        {/* ─── Status & Notifications ────────────────────────────── */}
        {txStatus && (
          <div className="flex items-center gap-3 p-4 mb-8 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md">
            {txStatus !== "Service allowed!" && txStatus !== "Service removed!" ? (
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            )}
            <span className="text-sm text-cyan-400 font-light drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">{txStatus}</span>
          </div>
        )}

        {/* ─── Agent Selector (Monochrome Glass) ─────────────────── */}
        {agents.length > 0 && (
          <div className="mb-8 max-w-sm relative z-40">
            <label className="block text-[10px] font-mono text-cyan-400/80 mb-2 uppercase tracking-widest">Configuring Allowlist For</label>
            <button
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.08] rounded-2xl hover:bg-white/[0.04] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/[0.05] border border-cyan-400/20 flex items-center justify-center shadow-inner">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-white/90">{agents[selectedAgentIdx]?.label || "Agent Node"}</p>
                  <p className="text-[10px] font-mono text-cyan-400/60 truncate max-w-[200px]">{agentAddr || "—"}</p>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-white/40 transition-transform duration-300 ${agentDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            
            {agentDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50 py-1">
                {agents.map((agent, idx) => (
                  <button
                    key={agent.address}
                    onClick={() => { setSelectedAgentIdx(idx); setAgentDropdownOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left ${idx === selectedAgentIdx ? "bg-white/[0.02] relative" : ""}`}
                  >
                    {idx === selectedAgentIdx && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />}
                    <Bot className={`w-4 h-4 flex-shrink-0 ${idx === selectedAgentIdx ? "text-cyan-400" : "text-white/40"}`} />
                    <div>
                      <p className={`text-sm font-medium ${idx === selectedAgentIdx ? "text-white" : "text-white/70"}`}>{agent.label}</p>
                      <p className={`text-[10px] font-mono truncate max-w-[220px] ${idx === selectedAgentIdx ? "text-cyan-400/60" : "text-white/40"}`}>{agent.address}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ MARKETPLACE TAB ═══════ */}
        {tab === "marketplace" && (
          <div className="animate-fade-in-scale">
            
            {/* Search + Filter */}
            <div className="flex flex-col md:flex-row gap-4 mb-8">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  placeholder="Search autonomous services..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-2xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner focus:shadow-[0_0_10px_rgba(34,211,238,0.1)]"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {["All", ...new Set(allServices.map(s => s.category))].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-5 py-3 rounded-2xl text-xs font-medium transition-all duration-300 ${categoryFilter === cat
                      ? "bg-cyan-500/[0.1] text-cyan-400 border border-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                      : "bg-white/[0.02] border border-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.04]"
                      }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Service Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredServices.map((svc, i) => {
                const Icon = svc.icon;
                const allowed = isAllowlistedByAddress(svc.address);

                return (
                  <FadeInView key={svc.name} delay={i * 50}>
                    <div className="group h-full flex flex-col p-6 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 backdrop-blur-sm">
                      
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center group-hover:border-cyan-400/30 group-hover:bg-cyan-500/[0.05] transition-colors">
                            <Icon className="w-5 h-5 text-white/70 group-hover:text-cyan-400 transition-colors" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-white/90">{svc.name}</h3>
                              {svc.verified && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                              )}
                            </div>
                            <span className="text-[10px] font-mono uppercase tracking-widest text-white/40 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded-full">
                              {svc.category}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="mb-4">
                        <span className="text-xl font-medium text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">{svc.price}</span>
                        <p className="text-[10px] font-mono text-white/30 uppercase mt-1">
                          + 2% Protocol Fee
                        </p>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-white/50 font-light mb-6 flex-1">{svc.description}</p>

                      {/* Address */}
                      <div className="px-3 py-2 rounded-xl bg-[#0A0A0A] border border-white/5 text-[10px] font-mono text-white/40 truncate mb-6" title={svc.address}>
                        {svc.address}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3 mt-auto">
                        {allowed ? (
                          <button disabled className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-xs font-semibold uppercase tracking-wider bg-cyan-500/[0.1] text-cyan-400 border border-cyan-400/20">
                            <ShieldCheck className="w-4 h-4" />
                            Allowed
                          </button>
                        ) : loadingService === svc.name ? (
                          <button disabled className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-xs font-semibold uppercase tracking-wider bg-white/10 text-white/50 cursor-not-allowed">
                            <div className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                            Pending
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAllow(svc.address, svc.name)}
                            disabled={!isReady || loadingService === svc.name}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                              !isReady
                                ? "bg-white/[0.02] border border-white/[0.05] text-white/30 cursor-not-allowed"
                                : "bg-white text-black hover:scale-[1.02] shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                            }`}
                          >
                            <Plus className="w-4 h-4" />
                            Allowlist
                          </button>
                        )}
                        <a
                          href={svc.url}
                          target="_blank"
                          rel="noopener"
                          className="px-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center justify-center"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </FadeInView>
                );
              })}
            </div>

            <div className="mt-12 text-center p-6 rounded-3xl border border-white/[0.05] bg-white/[0.01]">
              <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest leading-loose">
                Demo: Hardcoded X402 Services. <br/>
                Production: Trustless On-Chain Registry.
              </p>
            </div>
          </div>
        )}

        {/* ═══════ ALLOWLIST TAB ═══════ */}
        {tab === "allowlist" && (
          <div className="animate-fade-in-scale">
            
            {/* Quick add by address */}
            <div className="p-6 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] mb-10 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-cyan-500/[0.05] border border-cyan-400/20">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                </div>
                <h3 className="font-medium text-white/90">Manual Address Allowlist</h3>
              </div>
              <p className="text-sm text-white/50 font-light mb-6">
                Add a custom X402 service address to your agent's on-chain rule matrix. The smart contract will strictly enforce this perimeter.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Service principal address (ST...)"
                  value={addAddr}
                  onChange={(e) => setAddAddr(e.target.value)}
                  className="flex-1 px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner focus:shadow-[0_0_10px_rgba(34,211,238,0.1)]"
                />
                <button
                  onClick={handleAddByAddress}
                  disabled={!addAddr}
                  className="px-8 py-3.5 bg-white hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-[0_0_15px_rgba(255,255,255,0.15)]"
                >
                  Append Rule
                </button>
              </div>
            </div>

            {/* Allowed services list */}
            <h3 className="font-medium text-white/90 mb-6 text-lg">Active Contract Boundaries</h3>

            {loading ? (
              <div className="flex flex-col items-center justify-center min-h-[30vh] text-white">
                <div className="relative w-10 h-10 flex items-center justify-center mb-4">
                  <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
                  <div className="absolute inset-0 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">Verifying Rules</p>
              </div>
            ) : services.length === 0 ? (
              <div className="text-center py-20 p-8 rounded-3xl border border-dashed border-white/10 bg-white/[0.01]">
                <Globe className="w-12 h-12 mx-auto mb-4 text-white/20" />
                <p className="text-white/70 font-medium mb-2">No boundaries established.</p>
                <p className="text-sm text-white/40 font-light">
                  Add a service address above or browse the{" "}
                  <button onClick={() => setTab("marketplace")} className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 decoration-cyan-400/30 transition-colors">
                    Marketplace
                  </button>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {services.map((svc, i) => {
                  const marketplaceInfo = MARKETPLACE_SERVICES.find((m) => m.address === svc.address);

                  return (
                    <FadeInView key={svc.address} delay={i * 50}>
                      <div className="flex flex-col md:flex-row md:items-center justify-between p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-colors gap-4 md:gap-0">
                        
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${svc.allowed ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" : "bg-white/20"}`} />
                          <div>
                            {marketplaceInfo ? (
                              <h4 className="text-sm font-medium text-white/90 mb-1">{marketplaceInfo.name}</h4>
                            ) : (
                              <h4 className="text-sm font-medium text-white/50 mb-1 italic">Custom Service</h4>
                            )}
                            <span className="text-[11px] font-mono text-white/50">{svc.address}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 w-full md:w-auto">
                          {svc.allowed ? (
                            loadingService === marketplaceInfo?.name ? (
                              <button disabled className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest text-white/40 bg-white/5 border border-white/5 cursor-not-allowed">
                                <div className="w-3 h-3 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                                Removing
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDisallow(svc.address, marketplaceInfo?.name || "Unknown")}
                                disabled={!isReady || loadingService === marketplaceInfo?.name}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest bg-cyan-500/[0.1] text-cyan-400 border border-cyan-400/20 hover:bg-red-500/[0.1] hover:text-red-400 hover:border-red-500/30 transition-all group"
                              >
                                {loadingService === marketplaceInfo?.name ? <div className="w-3 h-3 border-2 border-cyan-400/50 border-t-transparent rounded-full animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 group-hover:hidden" />}
                                <Trash2 className="w-3.5 h-3.5 hidden group-hover:block" />
                                <span className="group-hover:hidden">Authorized</span>
                                <span className="hidden group-hover:inline">Revoke</span>
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => handleAllow(svc.address, marketplaceInfo?.name || "Unknown")}
                              disabled={!isReady || loadingService === marketplaceInfo?.name}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest bg-white/[0.03] text-white/60 border border-white/10 hover:text-white hover:bg-white/10 transition-all"
                            >
                              {loadingService === marketplaceInfo?.name ? <div className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                              Restore Rule
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveFromList(svc.address)}
                            className="p-3 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
                            title="Remove from interface"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                      </div>
                    </FadeInView>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}