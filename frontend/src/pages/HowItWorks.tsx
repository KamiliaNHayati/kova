import { ArrowLeft, Wallet, Bot, Activity, Shield, Zap, Lock, Eye, Globe, CreditCard, XCircle, CheckCircle2, Bell, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";

const flowSteps = [
    {
        num: "01",
        title: "Create Wallet & Deposit Escrow",
        desc: "You create an escrow wallet on-chain and deposit STX. The contract holds your funds and enforces spending rules — agents can only pay within your limits.",
        details: [
            "Auto-generates your first agent keypair (no manual input)",
            "Set daily spending limit (e.g. 10 STX/day)",
            "Set per-call limit (e.g. 2 STX per API call)",
            "Deposit STX into the escrow — agents draw from this balance",
        ],
        icon: Wallet,
        gradient: "from-orange-600 to-accent",
    },
    {
        num: "02",
        title: "Allowlist Trusted Services",
        desc: "Whitelist only the services your agent can pay. If a service isn't on the list, the contract blocks the payment — no exceptions.",
        details: [
            "Browse the marketplace or add service addresses",
            "Each service is an X402-enabled API endpoint",
            "Agent can only pay allowlisted services",
            "Remove services anytime to revoke access",
        ],
        icon: Globe,
        gradient: "from-accent to-amber-500",
    },
    {
        num: "03",
        title: "Agent Discovers & Calls Services",
        desc: "Your AI agent runs on a schedule, discovers X402 services, and gets payment requirements automatically.",
        details: [
            "Configurable scheduler: run every 5 min, 1 hour, etc.",
            "Agent calls service → gets HTTP 402: \"Pay 0.5 STX\"",
            "Agent reads the payment requirements",
            "Works with any X402-enabled service",
        ],
        icon: Bot,
        gradient: "from-amber-500 to-yellow-500",
    },
    {
        num: "04",
        title: "Escrow Payment (agent-pay)",
        desc: "The agent calls agent-pay on the escrow contract. In one atomic transaction: rules are checked, STX transfers from escrow to service, and the spend is logged.",
        details: [
            "validate-spend: agent authorized? wallet active? service allowed? within limits?",
            "agent-pay: atomic transfer from escrow → service address",
            "On-chain spend log with nonce, service, amount, block",
            "No user interaction needed — fully autonomous after deposit",
        ],
        icon: CreditCard,
        gradient: "from-teal-500 to-emerald-500",
    },
    {
        num: "05",
        title: "Human-in-the-Loop Approval",
        desc: "For high-value payments, your Telegram bot sends an approval request. You tap Approve or Reject — the agent waits for your decision.",
        details: [
            "Set your threshold (e.g. auto-approve below 1 STX)",
            "Above threshold → Telegram notification with buttons",
            "Approve ✅ or Reject ❌ from your phone",
            "All payments logged to your Telegram with tx details",
        ],
        icon: Bell,
        gradient: "from-emerald-500 to-cyan-500",
    },
    {
        num: "06",
        title: "Data Delivered to Your Apps",
        desc: "After payment, the agent retrieves the data and delivers it wherever you need — terminal, webhook, or a local API that any app can fetch.",
        details: [
            "Terminal: log output for debugging",
            "Webhook: POST results to your app's URL",
            "API Server: serve data at localhost:4000/api/latest",
            "Pipeline mode: chain multiple services + LLM analysis",
        ],
        icon: Send,
        gradient: "from-cyan-400 to-teal-400",
    },
];

const safetyFeatures = [
    {
        icon: Lock,
        title: "Escrow Design",
        desc: "User deposits STX into the contract. The agent can only spend through agent-pay — atomic transfer with built-in rule checks. No private key exposure.",
    },
    {
        icon: Shield,
        title: "Kill Switch",
        desc: "Instantly freeze all agent activity with one click. The agent can't spend anything while the wallet is deactivated.",
    },
    {
        icon: Eye,
        title: "On-Chain Audit Trail",
        desc: "Every payment is logged with a nonce, service address, amount, and block height. Fully transparent and immutable.",
    },
    {
        icon: Zap,
        title: "Daily Reset",
        desc: "Spending limits reset every ~144 blocks (~24 hours). Even a compromised agent can only spend up to your daily cap.",
    },
];

export default function HowItWorks() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-background text-text">
            {/* Background effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-accent/5 blur-3xl animate-[float-slow_20s_ease-in-out_infinite]" />
                <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-[#06B6D4]/5 blur-3xl animate-[float-slow_25s_ease-in-out_infinite_reverse]" />
            </div>

            {/* Header */}
            <header className="relative z-10 max-w-5xl mx-auto px-8 pt-10 pb-6">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-text-muted hover:text-text transition-colors mb-8"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back</span>
                </button>

                <div className="flex items-center gap-4 mb-4">
                    <img src="/kova-logo.png" alt="Kova" className="w-10 h-10 rounded-lg" />
                    <span className="text-sm font-medium text-text-muted tracking-wider uppercase">Kova Protocol</span>
                </div>

                <h1 className="text-4xl md:text-5xl font-bold mb-4">
                    How <span className="bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent">Kova</span> Works
                </h1>
                <p className="text-lg text-text-muted max-w-2xl leading-relaxed">
                    A step-by-step breakdown of how AI agents pay for services autonomously
                    using an escrow smart contract — deposit once, agents pay forever.
                </p>
            </header>

            {/* Flow Steps */}
            <section className="relative z-10 max-w-5xl mx-auto px-8 py-12">
                <div className="space-y-6">
                    {flowSteps.map((step, i) => (
                        <div key={step.num} className="group">
                            <div className="relative flex gap-6 p-6 rounded-2xl bg-surface/50 border border-border hover:border-accent/30 transition-all duration-300">
                                {/* Step number */}
                                <div className="flex-shrink-0">
                                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg`}>
                                        <span className="text-white font-bold text-lg">{step.num}</span>
                                    </div>
                                    {i < flowSteps.length - 1 && (
                                        <div className="w-px h-6 bg-border mx-auto mt-3" />
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-2">
                                        <step.icon className="w-5 h-5 text-accent" />
                                        <h3 className="font-bold text-xl">{step.title}</h3>
                                    </div>
                                    <p className="text-text-muted mb-4 leading-relaxed">{step.desc}</p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {step.details.map((detail, j) => (
                                            <div key={j} className="flex items-start gap-2 text-sm">
                                                <span className="text-accent mt-0.5">›</span>
                                                <span className="text-text-muted">{detail}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* X402 Protocol Diagram */}
            <section className="relative z-10 max-w-5xl mx-auto px-8 py-12">
                <h2 className="text-2xl font-bold mb-2">The X402 Payment Flow</h2>
                <p className="text-text-muted mb-2">What happens under the hood when your agent pays for a service</p>
                <p className="text-xs text-text-muted/60 mb-8 italic">The endpoints below (e.g. /api/data) are examples. Kova works with any X402-enabled service — price feeds, AI APIs, translation services, and more.</p>

                <div className="p-6 rounded-2xl bg-surface/50 border border-border">
                    <div className="font-mono text-sm leading-loose text-text-muted space-y-1">
                        <p><span className="text-accent">Agent</span> ──GET /api/data──→ <span className="text-teal-400">X402 Service</span></p>
                        <p className="pl-4 text-xs">↩ HTTP 402: "Pay 0.5 STX to ST..."</p>
                        <p className="mt-2"><span className="text-accent">Agent</span> ──validate-spend(owner, service, 500000)──→ <span className="text-purple-400">Escrow Contract</span></p>
                        <p className="pl-4 text-xs">✓ agent authorized · ✓ wallet active · ✓ service allowed · ✓ within daily limit · ✓ within per-call limit</p>
                        <p className="mt-2"><span className="text-accent">Agent</span> ──agent-pay(owner, service, 500000)──→ <span className="text-purple-400">Escrow Contract</span></p>
                        <p className="pl-4 text-xs">→ Contract transfers 0.5 STX from escrow → service address (on-chain)</p>
                        <p className="pl-4 text-xs">→ Spend logged: nonce, service, amount, block</p>
                        <p className="mt-2"><span className="text-accent">Agent</span> ──GET /api/data──→ <span className="text-teal-400">X402 Service</span></p>
                        <p className="pl-4 text-xs text-success">↩ 200 OK + data response (service sees payment on-chain)</p>
                    </div>
                </div>
            </section>

            {/* Safety Section */}
            <section className="relative z-10 max-w-5xl mx-auto px-8 py-12">
                <h2 className="text-2xl font-bold mb-2">Why It's Safe</h2>
                <p className="text-text-muted mb-8">Your agent never has your private key. The escrow contract enforces everything on-chain.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {safetyFeatures.map((f) => (
                        <div key={f.title} className="p-5 rounded-xl bg-surface/50 border border-border hover:border-accent/20 transition-colors">
                            <f.icon className="w-6 h-6 text-accent mb-3" />
                            <h4 className="font-semibold mb-1">{f.title}</h4>
                            <p className="text-sm text-text-muted leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Comparison */}
            <section className="relative z-10 max-w-5xl mx-auto px-8 py-12 pb-20">
                <h2 className="text-2xl font-bold mb-2">Without vs With Kova</h2>
                <p className="text-text-muted mb-8">Why delegated spending matters for AI agents</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-6 rounded-xl bg-danger/5 border border-danger/20">
                        <h4 className="flex items-center gap-2 font-bold text-danger mb-3"><XCircle className="w-5 h-5" /> Without Kova</h4>
                        <ul className="space-y-2 text-sm text-text-muted">
                            <li>• Give the agent your private key</li>
                            <li>• Agent has full access to ALL your funds</li>
                            <li>• No spending limits or controls</li>
                            <li>• No kill switch — hope for the best</li>
                            <li>• No audit trail</li>
                        </ul>
                    </div>
                    <div className="p-6 rounded-xl bg-success/5 border border-success/20">
                        <h4 className="flex items-center gap-2 font-bold text-success mb-3"><CheckCircle2 className="w-5 h-5" /> With Kova</h4>
                        <ul className="space-y-2 text-sm text-text-muted">
                            <li>• Agent has its own key — never sees yours</li>
                            <li>• Contract enforces rules — agent can only spend within limits</li>
                            <li>• Daily limits, per-call caps, allowlists</li>
                            <li>• Instant kill switch</li>
                            <li>• Every spend logged on-chain</li>
                        </ul>
                    </div>
                </div>
            </section>
        </div>
    );
}
