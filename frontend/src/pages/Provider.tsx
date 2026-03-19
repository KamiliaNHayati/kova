import { useState, useEffect } from "react";
import { useWallet } from "../context/WalletContext";
import {
    getServiceCount,
    getUserService,
    registerService,
    deleteService,
} from "../lib/contracts";
import {
    Server,
    Plus,
    ExternalLink,
    Copy,
    Code,
    Zap,
    Shield,
    RefreshCw,
    PlayCircle,
    CheckCircle2,
    XCircle,
    Loader2,
    Trash2,
    Cpu
} from "lucide-react";

interface ServiceInfo {
    name: string;
    description: string;
    url: string;
    pricePerCall: number;
    active: boolean;
    paymentAddress?: string; 
}

export default function Provider() {
    const { address } = useWallet();
    const [services, setServices] = useState<ServiceInfo[]>([]);
    const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [showRegister, setShowRegister] = useState(false);
    const [copiedSnippet, setCopiedSnippet] = useState(false);
    const [paymentAddress, setPaymentAddress] = useState("");
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

    // Test endpoint state
    const [testResult, setTestResult] = useState<"idle" | "testing" | "pass" | "fail">("idle");
    const [testMessage, setTestMessage] = useState("");

    // Form state
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [url, setUrl] = useState("");
    const [price, setPrice] = useState("");

    useEffect(() => {
        if (address) loadServices();
    }, [address]);

    async function loadServices() {
        setLoading(true);
        try {
            const countResult = await getServiceCount(address!);
            const count = parseInt(countResult?.value || "0");
            const svcs: ServiceInfo[] = [];
            for (let i = 0; i < Math.min(count, 10); i++) {
                const svc = await getUserService(address!, i);
                const v = svc?.value?.value; // ✅ drill into nested value
                if (v) {
                    svcs.push({
                        name: v.name?.value || "",
                        description: v.description?.value || "",
                        url: v.url?.value || "",
                        pricePerCall: parseInt(v["price-per-call"]?.value || "0"),
                        active: v.active?.value === true,
                        paymentAddress: v["payment-address"]?.value || address!
                    });
                }
            }
            setServices(svcs);
        } catch (e) {
            console.error(e);
            setServices([]);
        }
        setLoading(false);
    }

    async function testEndpoint(testUrl: string) {
        if (!testUrl) {
            setTestResult("fail");
            setTestMessage("Please enter a URL first");
            return;
        }
        setTestResult("testing");
        setTestMessage("Pinging endpoint...");
        try {
            const resp = await fetch(testUrl, { method: "GET", signal: AbortSignal.timeout(8000) });
            if (resp.status === 402) {
                setTestResult("pass");
                setTestMessage("✅ Endpoint returns 402 — x402 verified!");
            } else if (resp.ok) {
                setTestResult("fail");
                setTestMessage(`⚠️ Returns ${resp.status} — needs x402 paymentMiddleware`);
            } else {
                setTestResult("fail");
                setTestMessage(`❌ Returns ${resp.status} — check your server`);
            }
        } catch (err: any) {
            setTestResult("fail");
            setTestMessage(`❌ Cannot reach endpoint — is the server running?`);
        }
    }

    async function handleRegister() {
        if (!name || !url || !price) return;
        const payAddr = paymentAddress || address!;

        // 1. Save to server FIRST — if this fails, stop entirely
        try {
            const resp = await fetch("http://localhost:3402/api/register-service", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.toLowerCase().replace(/\s+/g, "-"),
                    description,
                    url,
                    priceSTX: (parseFloat(price) / 1_000_000).toFixed(6),
                    address: payAddr,
                })
            });
            if (!resp.ok) {
                const err = await resp.json();
                alert(`Server error: ${err.error}`);
                return; // ← stop here, don't register on-chain
            }
        } catch (e) {
            alert("Cannot reach service server. Is it running?");
            return; // ← stop here
        }

        // 2. Only register on-chain if server succeeded
        registerService(name, description, url, parseInt(price), payAddr, () => {
            setShowRegister(false);
            setName(""); setDescription(""); setUrl(""); setPrice("");
            setPaymentAddress("");
            setTestResult("idle"); setTestMessage("");
            setTimeout(loadServices, 3000);
        });
    }

    async function handleDelete(index: number) {
        setDeleteConfirm(index); 
    }

    async function confirmDelete() {
        const index = deleteConfirm!;
        setDeleteConfirm(null);
        setDeletingIndex(index);

        const svcName = services[index]?.name;
        if (svcName) {
            try {
                await fetch(`http://localhost:3402/api/services/${svcName}`, { method: "DELETE" });
            } catch (e) {
                console.error("Failed to delete from server registry:", e);
            }
        }

        deleteService(index, (data) => {
            if (data?.error) {
                alert(`Error: ${data.error}`);
                setDeletingIndex(null);
                return;
            }
            setTimeout(() => { setDeletingIndex(null); loadServices(); }, 8000);
        });
    }

    function copySnippet() {
        const snippet = `import { paymentMiddleware, STXtoMicroSTX } from 'x402-stacks';

app.get('/api/your-endpoint',
  paymentMiddleware({
    amount: STXtoMicroSTX(0.1),
    address: '${address}',
    network: 'testnet',
    facilitatorUrl: 'https://x402-backend-7eby.onrender.com',
  }),
  (req, res) => {
    res.json({ data: 'Your premium content' });
  }
);`;
        navigator.clipboard.writeText(snippet);
        setCopiedSnippet(true);
        setTimeout(() => setCopiedSnippet(false), 2000);
    }

    return (
        <div className="min-h-screen w-full bg-[#030303] text-white pt-10 pb-20 px-6 font-sans relative overflow-x-hidden">
            {/* Subtle Monochrome Auroras */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-white opacity-[0.02] blur-[120px] rounded-full mix-blend-screen" />
                <div className="absolute bottom-[20%] right-[-10%] w-[600px] h-[600px] bg-white opacity-[0.02] blur-[150px] rounded-full mix-blend-screen" />
            </div>

            <div className="max-w-4xl mx-auto relative z-10 animate-fade-in space-y-10">
                
                {/* ─── Header ────────────────────────────────────────────── */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 rounded-xl bg-cyan-500/[0.1] border border-cyan-400/20">
                                <Server className="w-6 h-6 text-cyan-400" />
                            </div>
                            <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white">Provider Dashboard</h1>
                        </div>
                        <p className="text-white/50 font-light max-w-xl">
                            Register and manage your X402-protected services on the autonomous network.
                        </p>
                    </div>
                        <button
                            onClick={() => {
                                const next = !showRegister;
                                setShowRegister(next);
                                if (next) {
                                    setTimeout(() => {
                                        document.querySelector(".register-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                                    }, 50);
                                }
                            }}
                            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-cyan-400 hover:bg-cyan-300 text-black rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)]"
                        >
                            {showRegister ? (
                                <>
                                    <XCircle className="w-4 h-4" />
                                    Cancel
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4" />
                                    Register Service
                                </>
                            )}
                        </button>
                </div>

                {/* ─── Quick Setup Guide ─────────────────────────────────── */}
                <div className="p-6 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6 border-b border-white/[0.05] pb-4">
                        <Code className="w-5 h-5 text-cyan-400" />
                        <h2 className="text-lg font-medium text-white/90 tracking-tight">
                            Quick Setup — x402-stacks
                        </h2>
                    </div>
                    <p className="text-white/50 text-sm font-light mb-6 leading-relaxed">
                        Add payment-gated endpoints to your Express.js API in 3 lines. Agents
                        pay automatically via the X402 protocol before processing requests.
                    </p>
                    <div className="relative">
                        <pre className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 text-xs md:text-sm text-emerald-400 font-mono overflow-x-auto shadow-inner leading-loose">
                            {`npm install x402-stacks\n\n// In your Express.js server:\nimport { paymentMiddleware } from 'x402-stacks';\n\napp.get('/api/your-endpoint',\n  paymentMiddleware({\n    amount: STXtoMicroSTX(0.1), // 0.1 STX\n    address: '${address || "YOUR_ADDRESS"}...',\n    network: 'testnet',\n  }),\n  (req, res) => res.json({ data: '...' })\n);`}
                        </pre>
                        <button
                            onClick={copySnippet}
                            className="absolute top-4 right-4 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                            title="Copy snippet"
                        >
                            {copiedSnippet ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/60 hover:text-cyan-400" />}
                        </button>
                    </div>
                </div>

                {/* ─── Register Form ─────────────────────────────────────── */}
                {showRegister && (
                     <div className="register-form p-6 md:p-8 rounded-3xl bg-white/[0.02] border border-cyan-400/20 backdrop-blur-sm space-y-6">
                        <h3 className="text-lg font-medium text-white flex items-center gap-3 border-b border-white/[0.05] pb-4 mb-6">
                            <Zap className="w-5 h-5 text-cyan-400" />
                            Initialize New Service
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Service Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Price Feed"
                                    className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner"
                                    maxLength={40}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Price per Call (microSTX)</label>
                                <input
                                    type="number"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    placeholder="e.g. 500000 (0.5 STX)"
                                    className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">API URL</label>
                                <input
                                    type="text"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="e.g. https://api.example.com/price-feed"
                                    className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner"
                                    maxLength={100}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Description</label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="e.g. Real-time crypto prices"
                                    className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner"
                                    maxLength={100}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">
                                    Payment Address <span className="text-white/20 normal-case tracking-normal ml-2 font-sans font-light">(optional — defaults to your address)</span>
                                </label>
                                <input
                                    type="text"
                                    value={paymentAddress}
                                    onChange={(e) => setPaymentAddress(e.target.value)}
                                    placeholder={address || "ST..."}
                                    className="w-full px-4 py-3.5 bg-[#0A0A0A] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.02] transition-all shadow-inner"
                                />
                                <p className="text-[10px] text-white/30 font-light mt-2">
                                    STX payments for this service will be sent to this address.
                                </p>
                            </div>
                        </div>

                        {/* Test Result Box */}
                        {testMessage && (
                            <div className={`p-4 rounded-xl text-sm flex items-center gap-3 font-mono transition-colors ${
                                testResult === "pass" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                testResult === "fail" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                                "bg-white/[0.02] text-white/60 border border-white/10"
                            }`}>
                                {testResult === "testing" && <Loader2 className="w-4 h-4 animate-spin text-white/50" />}
                                {testResult === "pass" && <CheckCircle2 className="w-4 h-4" />}
                                {testResult === "fail" && <XCircle className="w-4 h-4" />}
                                {testMessage}
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/[0.05]">
                            <button
                                onClick={() => testEndpoint(url)}
                                disabled={!url || testResult === "testing"}
                                className="px-6 py-3.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {testResult === "testing" ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <PlayCircle className="w-4 h-4 text-cyan-400" />
                                )}
                                Test Endpoint
                            </button>
                            <button
                                onClick={handleRegister}
                                disabled={!name || !url || !price}
                                className="flex-1 px-6 py-3.5 bg-cyan-400 hover:bg-cyan-300 text-black rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                            >
                                Register on-chain
                            </button>
                            <button
                                onClick={() => { setShowRegister(false); setTestResult("idle"); setTestMessage(""); }}
                                className="px-6 py-3.5 bg-transparent hover:bg-red-500/10 text-white/40 hover:text-red-400 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── Your Services ─────────────────────────────────────── */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
                        <h2 className="text-xl font-medium text-white tracking-tight">Active Services</h2>
                        <button
                            onClick={loadServices}
                            className="p-2 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.08] transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className="w-4 h-4 text-cyan-400" />
                        </button>
                    </div>

                    {loading ? (
                        <div className="p-12 rounded-3xl bg-white/[0.02] border border-white/[0.05] text-center flex flex-col items-center">
                            <div className="relative w-10 h-10 flex items-center justify-center mb-4">
                                <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
                                <div className="absolute inset-0 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                            </div>
                            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40">Querying Contract</p>
                        </div>
                    ) : services.length === 0 ? (
                        <div className="p-16 rounded-3xl bg-white/[0.01] border border-dashed border-white/10 text-center">
                            <Server className="w-12 h-12 text-white/20 mx-auto mb-4" />
                            <p className="text-white/70 font-medium mb-2">No services registered</p>
                            <p className="text-white/40 text-sm font-light">
                                Register your first X402-protected API endpoint to monetize your data.
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {services.map((svc, i) => (
                                <div
                                    key={i}
                                    className="p-6 rounded-2xl bg-white/[0.01] border border-white/[0.05] flex flex-col md:flex-row md:items-center justify-between group hover:border-cyan-400/30 hover:bg-cyan-500/[0.02] transition-all gap-4"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-cyan-500/[0.05] border border-cyan-400/20 flex items-center justify-center shrink-0">
                                            <Zap className="w-5 h-5 text-cyan-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-white/90 font-medium tracking-tight mb-0.5">{svc.name}</h3>
                                            <p className="text-white/40 text-xs font-light">{svc.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 ml-16 md:ml-0">
                                        <div className="flex flex-col items-end mr-2">
                                            <span className="text-cyan-400 font-mono text-sm drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                                                {(svc.pricePerCall / 1_000_000).toFixed(2)} <span className="text-[10px] text-cyan-400/50">STX</span>
                                            </span>
                                            <span className={`text-[9px] font-mono uppercase tracking-widest flex items-center gap-1 ${svc.active ? "text-emerald-400" : "text-red-400"}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${svc.active ? "bg-emerald-400" : "bg-red-400"}`} />
                                                {svc.active ? "Active" : "Inactive"}
                                            </span>
                                        </div>
                                        {svc.url && (
                                            <a
                                                href={svc.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/10 transition-colors"
                                                title="View endpoint"
                                            >
                                                <ExternalLink className="w-4 h-4 text-white/50 hover:text-white transition-colors" />
                                            </a>
                                        )}
                                        <button
                                            onClick={() => handleDelete(i)}
                                            disabled={deletingIndex === i}
                                            className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-red-500/10 text-white/30 hover:text-red-400 hover:border-red-500/20 transition-colors disabled:opacity-40"
                                            title="Delete service"
                                        >
                                            {deletingIndex === i ? (
                                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ─── Security Note ─────────────────────────────────────── */}
                <div className="p-6 rounded-3xl bg-[#0A0A0A] border border-white/[0.05] flex items-start gap-4 shadow-inner">
                    <Shield className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-white/90 font-medium mb-1.5 tracking-tight">X402 Protocol Security</h3>
                        <p className="text-white/40 text-xs font-light leading-relaxed">
                            Payments are verified cryptographically via the Stacks blockchain. Agents sign transactions that settle atomically — absolutely zero risk of double spending or chargebacks. Your API only releases data payloads after a confirmed on-chain settlement.
                        </p>
                    </div>
                </div>

                {/* ─── Delete Confirmation Modal ─── */}
                {deleteConfirm !== null && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
                        <div className="relative p-8 rounded-3xl bg-[#0A0A0A] border border-red-500/20 shadow-2xl max-w-sm w-full">
                            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
                                <Trash2 className="w-5 h-5 text-red-400" />
                            </div>
                            <h3 className="text-white font-medium text-lg mb-2">Remove Service?</h3>
                            <p className="text-white/50 text-sm font-light mb-8 leading-relaxed">
                                This will remove <span className="text-white/80 font-medium">{services[deleteConfirm]?.name}</span> from both the on-chain registry and the service server. This cannot be undone.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="flex-1 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white/60 hover:text-white text-xs font-bold uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-bold uppercase tracking-widest transition-all"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}