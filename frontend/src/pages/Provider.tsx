import { useState, useEffect } from "react";
import { useWallet } from "../context/WalletContext";
import {
    getServiceCount,
    getUserService,
    registerService,
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
} from "lucide-react";

interface ServiceInfo {
    name: string;
    description: string;
    url: string;
    pricePerCall: number;
    active: boolean;
}

export default function Provider() {
    const { address } = useWallet();
    const [services, setServices] = useState<ServiceInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showRegister, setShowRegister] = useState(false);
    const [copiedSnippet, setCopiedSnippet] = useState(false);

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
                        active: v.active?.value === true, // ✅ explicit boolean check
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
        
        // Register in server.js for immediate discovery
        try {
            await fetch("http://localhost:3402/api/register-service", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.toLowerCase().replace(/\s+/g, "-"),
                    description,
                    url,
                    priceSTX: (parseInt(price) / 1_000_000).toString(),
                    address: address, // provider's wallet address
                })
            });
        } catch (e) {
            console.error("Failed to register in server:", e);
        }

        // Also register on-chain
        registerService(name, description, url, parseInt(price), () => {
            setShowRegister(false);
            setName(""); setDescription(""); setUrl(""); setPrice("");
            setTestResult("idle"); setTestMessage("");
            setTimeout(loadServices, 3000);
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
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Server className="w-8 h-8 text-accent" />
                        Provider Dashboard
                    </h1>
                    <p className="text-text-muted mt-2">
                        Register and manage your x402-protected services
                    </p>
                </div>
                <button
                    onClick={() => setShowRegister(!showRegister)}
                    className="flex items-center gap-2 px-5 py-3 bg-accent hover:bg-accent-hover text-white rounded-xl font-medium transition-all shadow-lg"
                >
                    <Plus className="w-5 h-5" />
                    Register Service
                </button>
            </div>

            {/* Quick Setup Guide */}
            <div className="glass rounded-2xl border border-border/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Code className="w-6 h-6 text-accent" />
                    <h2 className="text-xl font-semibold text-white">
                        Quick Setup — x402-stacks
                    </h2>
                </div>
                <p className="text-text-muted text-sm mb-4">
                    Add payment-gated endpoints to your Express.js API in 3 lines. Agents
                    pay automatically via the x402 protocol.
                </p>
                <div className="relative">
                    <pre className="bg-black/40 border border-border/30 rounded-xl p-4 text-sm text-green-400 font-mono overflow-x-auto">
                        {`npm install x402-stacks

// In your Express.js server:
import { paymentMiddleware } from 'x402-stacks';

app.get('/api/your-endpoint',
  paymentMiddleware({
    amount: STXtoMicroSTX(0.1), // 0.1 STX
    address: '${address?.slice(0, 20)}...',
    network: 'testnet',
  }),
  (req, res) => res.json({ data: '...' })
);`}
                    </pre>
                    <button
                        onClick={copySnippet}
                        className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    >
                        <Copy className="w-4 h-4 text-white" />
                    </button>
                    {copiedSnippet && (
                        <span className="absolute top-3 right-14 text-xs text-success font-medium">
                            Copied!
                        </span>
                    )}
                </div>
            </div>

            {/* Register Form */}
            {showRegister && (
                <div className="glass rounded-2xl border border-accent/30 p-6 space-y-4 animate-slide-up">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Zap className="w-5 h-5 text-accent" />
                        Register New Service
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-text-muted mb-1">
                                Service Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Price Feed"
                                className="w-full px-4 py-3 bg-black/30 border border-border/50 rounded-xl text-white placeholder-text-muted/50 focus:border-accent focus:outline-none"
                                maxLength={40}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-text-muted mb-1">
                                Price per Call (microSTX)
                            </label>
                            <input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="e.g. 500000 (0.5 STX)"
                                className="w-full px-4 py-3 bg-black/30 border border-border/50 rounded-xl text-white placeholder-text-muted/50 focus:border-accent focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-text-muted mb-1">
                                API URL
                            </label>
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="e.g. https://api.example.com/price-feed"
                                className="w-full px-4 py-3 bg-black/30 border border-border/50 rounded-xl text-white placeholder-text-muted/50 focus:border-accent focus:outline-none"
                                maxLength={100}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-text-muted mb-1">
                                Description
                            </label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="e.g. Real-time crypto prices"
                                className="w-full px-4 py-3 bg-black/30 border border-border/50 rounded-xl text-white placeholder-text-muted/50 focus:border-accent focus:outline-none"
                                maxLength={100}
                            />
                        </div>
                    </div>
                    {/* Test Result */}
                    {testMessage && (
                        <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${testResult === "pass" ? "bg-success/10 text-success border border-success/20" :
                                testResult === "fail" ? "bg-danger/10 text-danger border border-danger/20" :
                                    "bg-accent/10 text-accent border border-accent/20"
                            }`}>
                            {testResult === "testing" && <Loader2 className="w-4 h-4 animate-spin" />}
                            {testResult === "pass" && <CheckCircle2 className="w-4 h-4" />}
                            {testResult === "fail" && <XCircle className="w-4 h-4" />}
                            {testMessage}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={() => testEndpoint(url)}
                            disabled={!url || testResult === "testing"}
                            className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-border/50 text-white rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {testResult === "testing" ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <PlayCircle className="w-4 h-4" />
                            )}
                            Test Endpoint
                        </button>
                        <button
                            onClick={handleRegister}
                            disabled={!name || !url || !price}
                            className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Register on-chain
                        </button>
                        <button
                            onClick={() => { setShowRegister(false); setTestResult("idle"); setTestMessage(""); }}
                            className="px-6 py-3 bg-white/5 hover:bg-white/10 text-text-muted rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Your Services */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">Your Services</h2>
                    <button
                        onClick={loadServices}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4 text-text-muted" />
                    </button>
                </div>

                {loading ? (
                    <div className="glass rounded-2xl border border-border/50 p-12 text-center">
                        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-4" />
                        <p className="text-text-muted">Loading services...</p>
                    </div>
                ) : services.length === 0 ? (
                    <div className="glass rounded-2xl border border-border/50 p-12 text-center">
                        <Server className="w-12 h-12 text-text-muted/30 mx-auto mb-4" />
                        <p className="text-text-muted text-lg mb-2">No services yet</p>
                        <p className="text-text-muted/60 text-sm">
                            Register your first x402-protected API endpoint above
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {services.map((svc, i) => (
                            <div
                                key={i}
                                className="glass rounded-2xl border border-border/50 p-5 flex items-center justify-between group hover:border-accent/30 transition-all"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                                        <Zap className="w-5 h-5 text-accent" />
                                    </div>
                                    <div>
                                        <h3 className="text-white font-medium">{svc.name}</h3>
                                        <p className="text-text-muted text-sm">{svc.description}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-accent font-mono text-sm">
                                        {(svc.pricePerCall / 1_000_000).toFixed(2)} STX
                                    </span>
                                    <div
                                        className={`px-2 py-1 rounded-full text-xs ${svc.active
                                            ? "bg-success/10 text-success"
                                            : "bg-danger/10 text-danger"
                                            }`}
                                    >
                                        {svc.active ? "Active" : "Inactive"}
                                    </div>
                                    {svc.url && (
                                        <a
                                            href={svc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                                        >
                                            <ExternalLink className="w-4 h-4 text-text-muted" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Security Note */}
            <div className="glass rounded-2xl border border-border/50 p-5 flex items-start gap-4">
                <Shield className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
                <div>
                    <h3 className="text-white font-medium mb-1">x402 Security</h3>
                    <p className="text-text-muted text-sm leading-relaxed">
                        Payments are verified on-chain via the Stacks blockchain facilitator.
                        Agents sign transactions that are settled atomically — no double
                        spending, no chargebacks. Your API only grants access after
                        confirmed payment.
                    </p>
                </div>
            </div>
        </div>
    );
}
