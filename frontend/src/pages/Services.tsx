import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import {
  allowService,
  disallowService,
  isServiceAllowed,
} from "../lib/contracts";
import {
  Globe,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  CheckCircle2,
  Zap,
  FileText,
  Image,
  BarChart3,
  BrainCircuit,
  Store,
  ExternalLink,
  Search,
} from "lucide-react";

const STORAGE_KEY = "kova-allowed-services";
const EXPLICIT_KEY = "kova-allowed-services-explicit"; // tracks which specific services were clicked

// Marketplace services — in production, this comes from an on-chain registry
const MARKETPLACE_SERVICES = [
  {
    name: "Price Feed",
    description: "Real-time crypto price data (BTC, ETH, STX) with 2% change tracking",
    address: "STWEW038MP9DGVVMBZMVBJ6KZXC39Y5NHWY5CC37",
    price: "0.5 STX",
    category: "Data",
    icon: BarChart3,
    url: "http://localhost:3402/api/price-feed",
    verified: true,
  },
  {
    name: "Text Summarizer",
    description: "AI-powered text summarization using GPT models. Send long content, get concise summaries.",
    address: "STWEW038MP9DGVVMBZMVBJ6KZXC39Y5NHWY5CC37",
    price: "1 STX",
    category: "AI",
    icon: FileText,
    url: "http://localhost:3402/api/summarize",
    verified: true,
  },
  {
    name: "Image Generator",
    description: "Generate AI images from text prompts. Powered by DALL-E and Stability AI.",
    address: "STWEW038MP9DGVVMBZMVBJ6KZXC39Y5NHWY5CC37",
    price: "2 STX",
    category: "AI",
    icon: Image,
    url: "http://localhost:3402/api/image",
    verified: true,
  },
  {
    name: "Sentiment Analysis",
    description: "Analyze market sentiment from social media and news feeds for trading signals.",
    address: "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDNEF55B3MFHQR",
    price: "1.5 STX",
    category: "AI",
    icon: BrainCircuit,
    url: "https://api.example.com/sentiment",
    verified: false,
  },
  {
    name: "On-chain Analytics",
    description: "Deep analysis of wallet activity, whale movements, and DeFi protocol metrics.",
    address: "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDNEF55B3MFHQR",
    price: "2 STX",
    category: "Data",
    icon: Zap,
    url: "https://api.example.com/analytics",
    verified: false,
  },
];

function getSavedServices(owner: string): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return data[owner] || [];
  } catch {
    return [];
  }
}

function saveServices(owner: string, services: string[]) {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    data[owner] = services;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { }
}

interface AllowedService {
  address: string;
  allowed: boolean;
}

export default function Services() {
  const { address } = useWallet();
  const [services, setServices] = useState<AllowedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [addAddr, setAddAddr] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [tab, setTab] = useState<"marketplace" | "allowlist">("marketplace");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  useEffect(() => {
    if (!address) return;
    loadAllowedServices();
  }, [address]);

  async function loadAllowedServices() {
    setLoading(true);
    const saved = getSavedServices(address!);
    const results: AllowedService[] = [];

    for (const addr of saved) {
      try {
        const resp = await isServiceAllowed(address!, addr);
        results.push({
          address: addr,
          allowed: resp.value === true,
        });
      } catch {
        results.push({ address: addr, allowed: false });
      }
    }

    setServices(results);
    setLoading(false);
  }

  function handleAllow(serviceAddr: string, serviceName?: string) {
    setTxStatus("Confirm in your wallet...");
    allowService(serviceAddr, () => {
      setTxStatus("Transaction submitted! Waiting for confirmation...");

      const saved = getSavedServices(address!);
      if (!saved.includes(serviceAddr)) {
        saveServices(address!, [...saved, serviceAddr]);
      }

      // Track explicitly allowed service name
      if (serviceName) {
        try {
          const data = JSON.parse(localStorage.getItem(EXPLICIT_KEY) || "{}");
          const list: string[] = data[address!] || [];
          if (!list.includes(serviceName)) list.push(serviceName);
          data[address!] = list;
          localStorage.setItem(EXPLICIT_KEY, JSON.stringify(data));
        } catch { }
      }

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const resp = await isServiceAllowed(address!, serviceAddr);
          if (resp.value === true || attempts >= 24) {
            clearInterval(poll);
            setTxStatus(resp.value === true ? "Service allowed!" : "");
            setTimeout(() => setTxStatus(""), 3000);
            loadAllowedServices();
          }
        } catch {
          if (attempts >= 24) {
            clearInterval(poll);
            setTxStatus("");
          }
        }
      }, 5000);
    });
  }

  function handleDisallow(serviceAddr: string) {
    setTxStatus("Confirm in your wallet...");
    disallowService(serviceAddr, () => {
      setTxStatus("Transaction submitted! Waiting for confirmation...");

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const resp = await isServiceAllowed(address!, serviceAddr);
          if (resp.value !== true || attempts >= 24) {
            clearInterval(poll);
            setTxStatus(resp.value !== true ? "Service removed!" : "");
            setTimeout(() => setTxStatus(""), 3000);
            loadAllowedServices();
          }
        } catch {
          if (attempts >= 24) {
            clearInterval(poll);
            setTxStatus("");
          }
        }
      }, 5000);
    });
  }

  function handleAddByAddress() {
    if (!addAddr.startsWith("ST") && !addAddr.startsWith("SP")) return;
    handleAllow(addAddr, undefined);
    setAddAddr("");
  }

  function handleRemoveFromList(addr: string) {
    const saved = getSavedServices(address!);
    saveServices(address!, saved.filter((s) => s !== addr));
    setServices(services.filter((s) => s.address !== addr));
  }

  function isAllowlisted(name: string, addr: string): boolean {
    // Check if this specific service was explicitly allowed by the user
    try {
      const data = JSON.parse(localStorage.getItem(EXPLICIT_KEY) || "{}");
      const list: string[] = data[address!] || [];
      return list.includes(name) && services.some((s) => s.address === addr && s.allowed);
    } catch {
      return services.some((s) => s.address === addr && s.allowed);
    }
  }

  const categories = ["All", ...new Set(MARKETPLACE_SERVICES.map((s) => s.category))];

  const filteredServices = MARKETPLACE_SERVICES.filter((s) => {
    const matchesSearch =
      searchQuery === "" ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "All" || s.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Services</h1>
        <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border">
          <button
            onClick={() => setTab("marketplace")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "marketplace" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
          >
            <Store className="w-3.5 h-3.5" />
            Marketplace
          </button>
          <button
            onClick={() => setTab("allowlist")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "allowlist" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            My Allowlist
          </button>
        </div>
      </div>
      <p className="text-text-muted text-sm mb-6">
        {tab === "marketplace"
          ? "Browse available X402 services and add them to your allowlist"
          : "Manage which services your agent can pay"}
      </p>

      {txStatus && (
        <div className="flex items-center gap-3 p-3 mb-6 rounded-lg bg-accent/10 border border-accent/20">
          {txStatus !== "Service allowed!" && txStatus !== "Service removed!" ? (
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-accent animate-fade-in-scale" />
          )}
          <span className="text-sm text-accent font-medium">{txStatus}</span>
        </div>
      )}

      {/* ═══════ MARKETPLACE TAB ═══════ */}
      {tab === "marketplace" && (
        <div>
          {/* Search + Filter */}
          <div className="flex gap-3 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="flex gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${categoryFilter === cat
                    ? "bg-accent/10 text-accent border border-accent/20"
                    : "bg-surface border border-border text-text-muted hover:text-text"
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Service Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServices.map((svc) => {
              const Icon = svc.icon;
              const allowed = isAllowlisted(svc.name, svc.address);

              return (
                <div
                  key={svc.name}
                  className="group p-5 rounded-xl bg-surface border border-border hover:border-accent/30 transition-all duration-200 hover:shadow-lg hover:shadow-accent/5"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                        <Icon className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-semibold text-sm">{svc.name}</h3>
                          {svc.verified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                          )}
                        </div>
                        <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                          {svc.category}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-accent">{svc.price}</span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-text-muted mb-4 line-clamp-2">{svc.description}</p>

                  {/* Address */}
                  <div className="text-[10px] text-text-muted font-mono mb-4 truncate" title={svc.address}>
                    {svc.address}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {allowed ? (
                      <button
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-success/10 text-success border border-success/20"
                        disabled
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Allowed
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAllow(svc.address, svc.name)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-accent hover:bg-accent-hover text-white transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Allow Service
                      </button>
                    )}
                    <a
                      href={svc.url}
                      target="_blank"
                      rel="noopener"
                      className="px-3 py-2 rounded-lg text-xs text-text-muted border border-border hover:border-accent/30 hover:text-text transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Production note */}
          <p className="text-[10px] text-text-muted/50 mt-6 text-center">
            📝 Demo: hardcoded services. Production: on-chain service registry where anyone can list their X402 API.
          </p>
        </div>
      )}

      {/* ═══════ ALLOWLIST TAB ═══════ */}
      {tab === "allowlist" && (
        <div>
          {/* Quick add by address */}
          <div className="p-6 rounded-xl bg-surface border border-border mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-accent" />
              <h3 className="font-semibold">Allow Service Address</h3>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Add a service address to your wallet's on-chain allowlist. Only
              allowed services can receive payments from your agent.
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Service principal address (ST...)"
                value={addAddr}
                onChange={(e) => setAddAddr(e.target.value)}
                className="flex-1 px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-sm font-mono text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={handleAddByAddress}
                disabled={!addAddr}
                className="px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Allow
              </button>
            </div>
          </div>

          {/* Allowed services list */}
          <h3 className="font-semibold mb-4">Allowed Services</h3>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-16 text-text-muted">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No services allowed yet.</p>
              <p className="text-xs mt-1">
                Add a service address above or browse the{" "}
                <button onClick={() => setTab("marketplace")} className="text-accent underline">
                  Marketplace
                </button>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {services.map((svc) => {
                const marketplaceInfo = MARKETPLACE_SERVICES.find((m) => m.address === svc.address);

                return (
                  <div
                    key={svc.address}
                    className="flex items-center justify-between p-5 rounded-xl bg-surface border border-border hover:border-border-hover transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${svc.allowed ? "bg-success" : "bg-text-muted"}`}
                      />
                      <div>
                        {marketplaceInfo && (
                          <span className="text-xs font-medium text-accent mr-2">{marketplaceInfo.name}</span>
                        )}
                        <span className="text-sm font-mono">{svc.address}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {svc.allowed ? (
                        <button
                          onClick={() => handleDisallow(svc.address)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Allowed
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAllow(svc.address)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-text-muted hover:text-text hover:bg-border transition-colors"
                        >
                          <ShieldOff className="w-3.5 h-3.5" />
                          Allow
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveFromList(svc.address)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Remove from list"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
