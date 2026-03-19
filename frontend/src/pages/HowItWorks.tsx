import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Wallet, Bot, Activity, Shield, Zap, Lock, Eye, Globe, CreditCard, XCircle, CheckCircle2, Bell, Send, Terminal } from "lucide-react";
import { useNavigate } from "react-router-dom";

// ─── DATA ────────────────────────────────────────────────────────
const flowSteps = [
  {
    num: "01",
    title: "Create Wallet & Deposit Escrow",
    desc: "Create an escrow wallet on-chain per agent. Each agent gets its own isolated balance with independent spending limits enforced by the Clarity contract.",
    details: [
      "Backend auto-generates agent keypair (index-based HD derivation)",
      "Owner calls create-wallet(agent, dailyLimit, perCallLimit)",
      "Deposit STX into the agent's escrow balance",
      "Register operator (backend) with register-operator — one-time setup",
    ],
    icon: Wallet,
  },
  {
    num: "02",
    title: "Register Operator & Allowlist Services",
    desc: "Register your backend as the operator — it signs agent-pay and pays gas. Allowlist services per-agent. The contract blocks any payment to non-allowlisted services.",
    details: [
      "Owner calls register-operator(operatorAddress) once",
      "Operator signs agent-pay transactions and pays gas fees",
      "Per-agent service allowlist — each agent has its own permissions",
      "Browse marketplace or add service addresses manually",
    ],
    icon: Globe,
  },
  {
    num: "03",
    title: "Agent Discovers X402 Services",
    desc: "The agent queries /.well-known/x402 to discover available services, pricing, and payment addresses. Static and dynamically registered services are included.",
    details: [
      "GET /.well-known/x402 — lists all services with prices",
      "Each service has its own payment address and price",
      "Dynamic services registered via Provider Dashboard appear automatically",
      "Configurable scheduler: once, interval, or pipeline mode",
    ],
    icon: Bot,
  },
  {
    num: "04",
    title: "Operator Signs agent-pay (Escrow Flow)",
    desc: "The operator (backend) calls validate-spend first, then agent-pay. In one atomic transaction: rules checked, STX transfers from escrow to service, spend logged.",
    details: [
      "validate-spend: authorized? active? allowlisted? within limits?",
      "agent-pay: atomic escrow → service transfer (98%) + platform fee (2%)",
      "On-chain spend log: nonce, service, amount, fee, block",
      "Agent needs no gas — operator pays tx fee",
    ],
    icon: CreditCard,
  },
  {
    num: "05",
    title: "Human-in-the-Loop via Telegram",
    desc: "Near daily spending limits, your Telegram bot sends an approval request. Approve or Reject from your phone. All payments logged regardless of threshold.",
    details: [
      "Set approval threshold (e.g. auto-approve below 2 STX)",
      "Near daily limit → Telegram alert with Approve/Reject buttons",
      "2-minute timeout — auto-rejects if no response",
      "All successful payments notify via Telegram with tx details",
    ],
    icon: Bell,
  },
  {
    num: "06",
    title: "Data Delivered — Multiple Destinations",
    desc: "After payment, agent retrieves data with escrow proof header and delivers it via terminal, webhook, API server, or as part of a multi-step pipeline with LLM analysis.",
    details: [
      "Terminal: logs in agent.js for development",
      "Webhook: POST results to your app's URL automatically",
      "API Server: live data at localhost:4000/api/latest",
      "Pipeline mode: chain services + LLM analysis",
    ],
    icon: Send,
  },
];

const safetyFeatures = [
  {
    icon: Lock,
    title: "Escrow Design",
    desc: "User deposits STX into the contract. The agent can only spend through agent-pay — atomic transfer with built-in rule checks. No private key exposure.",
    iconStyle: "text-cyan-400 bg-cyan-500/[0.05] border-cyan-400/20",
  },
  {
    icon: Shield,
    title: "Kill Switch",
    desc: "Instantly freeze all agent activity with one click. The agent can't spend anything while the wallet is deactivated.",
    iconStyle: "text-red-400 bg-red-500/[0.05] border-red-400/20",
  },
  {
    icon: Eye,
    title: "On-Chain Audit Trail",
    desc: "Every payment is logged with a nonce, service address, amount, and block height. Fully transparent and immutable.",
    iconStyle: "text-sky-400 bg-sky-500/[0.05] border-sky-400/20",
  },
  {
    icon: Zap,
    title: "Daily Reset",
    desc: "Spending limits reset every ~144 blocks (~24 hours). Even a compromised agent can only spend up to your daily cap.",
    iconStyle: "text-fuchsia-400 bg-fuchsia-500/[0.05] border-fuchsia-400/20",
  },
];

// ─── COMPONENTS ──────────────────────────────────────────────────

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

// ─── MAIN PAGE ───────────────────────────────────────────────────

export default function HowItWorks() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-[#030303] text-white relative overflow-x-hidden scroll-smooth selection:bg-cyan-400/30 font-sans">
      
      {/* ─── Ambient Aurora Backgrounds (Sky Blue & Indigo) ─── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[10%] left-[-10%] w-[500px] h-[500px] bg-sky-500 opacity-[0.04] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[20%] right-[-10%] w-[600px] h-[600px] bg-indigo-500 opacity-[0.04] blur-[150px] rounded-full mix-blend-screen" />
      </div>

      {/* ─── Header ──────────────────────────────────────── */}
      <header className="relative z-10 max-w-4xl mx-auto px-6 pt-20 pb-12">
        <button
          onClick={() => navigate(-1)}
          className="group flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all duration-300 w-fit mb-12 shadow-md"
        >
          <ArrowLeft className="w-4 h-4 text-white/80 group-hover:text-white transition-colors group-hover:-translate-x-1" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/80 group-hover:text-white transition-colors">Return</span>
        </button>

        <FadeInView>
          <div className="flex items-center gap-3 mb-6">
            <img src="/kova-logo.png" alt="Kova" className="w-8 h-8 rounded-lg" />
            <span className="text-[11px] font-mono text-white/70 tracking-widest uppercase">Protocol Documentation</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-medium mb-6 tracking-tight text-white">
            How Kova Works
          </h1>
          <p className="text-lg text-white/70 max-w-2xl font-light leading-relaxed">
            A technical breakdown of how AI agents pay for services autonomously 
            using a Clarity smart escrow. Deposit once, let your agents operate securely forever.
          </p>
        </FadeInView>
      </header>

      {/* ─── Flow Steps (CYAN ACCENTS) ───────────────── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-6">
          {flowSteps.map((step, i) => (
            <FadeInView key={step.num} delay={i * 100}>
              <div className="group relative flex flex-col md:flex-row gap-6 md:gap-8 p-8 md:p-10 rounded-3xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-cyan-400/20 transition-all duration-500 backdrop-blur-md shadow-lg">
                
                {/* Step number & Icon */}
                <div className="flex-shrink-0 flex flex-row md:flex-col items-center gap-4 md:gap-0">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500/[0.05] border border-cyan-400/20 flex items-center justify-center text-cyan-400 group-hover:scale-105 group-hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all duration-500">
                    <span className="font-mono text-xl font-medium">{step.num}</span>
                  </div>
                  {i < flowSteps.length - 1 && (
                    <div className="hidden md:block w-[1px] h-full min-h-[40px] bg-gradient-to-b from-cyan-400/20 to-transparent my-4" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-3 mb-3">
                    <step.icon className="w-5 h-5 text-white/80 group-hover:text-cyan-400 transition-colors" />
                    <h3 className="font-medium text-xl text-white tracking-tight">{step.title}</h3>
                  </div>
                  <p className="text-white/70 mb-6 font-light leading-relaxed">{step.desc}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {step.details.map((detail, j) => (
                      <div key={j} className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.01] border border-white/[0.03] group-hover:border-white/[0.08] transition-colors">
                        <span className="text-cyan-400/60 text-xs mt-0.5 font-mono font-bold">›</span>
                        <span className="text-sm text-white/80 font-light leading-relaxed">{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </FadeInView>
          ))}
        </div>
      </section>

      {/* ─── X402 Protocol Diagram (CYBERPUNK HIGHLIGHTS) ─── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-20">
        <FadeInView>
          <div className="mb-10">
            <h2 className="text-3xl font-medium mb-3 tracking-tight text-white">The X402 Payment Flow</h2>
            <p className="text-white/70 font-light">What happens under the hood when your agent pays for a service.</p>
          </div>

          <div className="p-1 rounded-3xl bg-gradient-to-b from-white/[0.05] to-transparent shadow-2xl">
            <div className="p-6 md:p-10 rounded-[1.4rem] bg-[#0A0A0A] border border-white/10 overflow-x-auto shadow-inner">
              
              {/* Fake Window Controls */}
              <div className="flex gap-2 mb-8">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              </div>

              <div className="font-mono text-[11px] md:text-sm leading-loose whitespace-nowrap md:whitespace-normal space-y-2">
                
                {/* Step 1 */}
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-white/50">
                  <span className="text-cyan-400 w-24 shrink-0 font-bold">Agent</span>
                  <span className="hidden md:inline text-white/40">── <span className="text-fuchsia-400">GET</span> /.well-known/x402 ──→</span>
                  <span className="md:hidden text-white/40">→ GET /.well-known/x402 →</span>
                  <span className="text-amber-400 font-medium">X402 Service</span>
                </div>
                <p className="pl-4 md:pl-[120px] text-white/60">
                  <span className="text-emerald-400">↩</span> services: [{"{"}name, address, price{"}"}]
                </p>
                <div className="h-4" />

                {/* Step 2 */}
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-white/50">
                  <span className="text-indigo-400 w-24 shrink-0 font-bold">Operator</span>
                  <span className="hidden md:inline text-white/40">── validate-spend(owner, agent, service) ──→</span>
                  <span className="md:hidden text-white/40">→ validate-spend(...) →</span>
                  <span className="text-emerald-400 font-medium">Escrow Contract</span>
                </div>
                <p className="pl-4 md:pl-[120px] text-white/60">
                  <span className="text-emerald-400">✓</span> authorized · <span className="text-emerald-400">✓</span> wallet active · <span className="text-emerald-400">✓</span> allowed · <span className="text-emerald-400">✓</span> within limits
                </p>
                <div className="h-4" />

                {/* Step 3 */}
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-white/50">
                  <span className="text-indigo-400 w-24 shrink-0 font-bold">Operator</span>
                  <span className="hidden md:inline text-white/40">── agent-pay(owner, agent, service, amount) ──→</span>
                  <span className="md:hidden text-white/40">→ agent-pay(...) →</span>
                  <span className="text-emerald-400 font-medium">Escrow Contract</span>
                </div>
                <div className="pl-4 md:pl-[120px] text-white/60 flex flex-col gap-1">
                  <p>→ <span className="text-white">0.49 STX</span> from escrow → service address (atomic)</p>
                  <p>→ <span className="text-white">0.01 STX</span> platform fee → Kova protocol</p>
                  <p className="text-white/40 italic">→ Spend logged: nonce, service, amount, fee, block</p>
                </div>
                <div className="h-4" />

                {/* Step 4 */}
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-white/50">
                  <span className="text-cyan-400 w-24 shrink-0 font-bold">Agent</span>
                  <span className="hidden md:inline text-white/40">── <span className="text-fuchsia-400">GET</span> /api/data + X-PAYMENT header ──→</span>
                  <span className="md:hidden text-white/40">→ GET /api/data →</span>
                  <span className="text-amber-400 font-medium">X402 Service</span>
                </div>
                <p className="pl-4 md:pl-[120px] text-white/80">
                  <span className="text-emerald-400 font-bold drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">↩ 200 OK</span> + data payload <span className="text-white/40 italic">(service verifies on-chain)</span>
                </p>

              </div>
            </div>
          </div>
        </FadeInView>
      </section>

      {/* ─── Safety Features ─────────────────────────────── */}
      <section className="relative z-10 w-full bg-[#080808] border-y border-white/10 py-24 px-6 shadow-2xl">
        <div className="max-w-4xl mx-auto">
          <FadeInView>
            <div className="mb-12">
              <h2 className="text-3xl font-medium mb-3 tracking-tight text-white">Engineered for Safety</h2>
              <p className="text-white/70 font-light">Your agent never holds your private key. Everything is enforced on-chain.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {safetyFeatures.map((f, i) => (
                <FadeInView key={f.title} delay={i * 100}>
                  <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 h-full shadow-lg">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 border ${f.iconStyle}`}>
                      <f.icon className="w-5 h-5" />
                    </div>
                    <h4 className="font-medium text-lg mb-2 text-white tracking-tight">{f.title}</h4>
                    <p className="text-sm text-white/70 font-light leading-relaxed">{f.desc}</p>
                  </div>
                </FadeInView>
              ))}
            </div>
          </FadeInView>
        </div>
      </section>

      {/* ─── Comparison ──────────────────────────────────── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-24 pb-32">
        <FadeInView>
          <div className="mb-12 text-center md:text-left">
            <h2 className="text-3xl font-medium mb-3 tracking-tight text-white">The Kova Advantage</h2>
            <p className="text-white/70 font-light">Why delegated smart escrow matters for autonomous AI.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Without Kova */}
            <div className="p-8 rounded-3xl bg-red-500/[0.02] border border-red-500/10 hover:border-red-500/20 transition-all shadow-[0_0_30px_rgba(239,68,68,0.02)]">
              <h4 className="flex items-center gap-3 font-medium text-red-400 mb-6 text-lg tracking-tight">
                <XCircle className="w-5 h-5" /> Legacy Approach
              </h4>
              <ul className="space-y-4 text-sm text-white/70 font-light">
                <li className="flex items-start gap-3"><span className="text-red-500/80 mt-0.5 font-bold">›</span> Give the agent your private key</li>
                <li className="flex items-start gap-3"><span className="text-red-500/80 mt-0.5 font-bold">›</span> Agent has full access to ALL your funds</li>
                <li className="flex items-start gap-3"><span className="text-red-500/80 mt-0.5 font-bold">›</span> No spending limits or logic constraints</li>
                <li className="flex items-start gap-3"><span className="text-red-500/80 mt-0.5 font-bold">›</span> No kill switch — hope for the best</li>
                <li className="flex items-start gap-3"><span className="text-red-500/80 mt-0.5 font-bold">›</span> Unstructured, off-chain audit trails</li>
              </ul>
            </div>

            {/* With Kova */}
            <div className="p-8 rounded-3xl bg-cyan-500/[0.02] border border-cyan-500/20 hover:border-cyan-400/30 transition-all shadow-[0_0_30px_rgba(34,211,238,0.05)]">
              <h4 className="flex items-center gap-3 font-medium text-cyan-400 mb-6 text-lg tracking-tight">
                <CheckCircle2 className="w-5 h-5" /> With Kova Protocol
              </h4>
              <ul className="space-y-4 text-sm text-white/80 font-light">
                <li className="flex items-start gap-3"><span className="text-cyan-400 mt-0.5 font-bold">›</span> Agent uses isolated key — never sees yours</li>
                <li className="flex items-start gap-3"><span className="text-cyan-400 mt-0.5 font-bold">›</span> Smart contract enforces hard immutable rules</li>
                <li className="flex items-start gap-3"><span className="text-cyan-400 mt-0.5 font-bold">›</span> Daily limits, per-call caps, strict allowlists</li>
                <li className="flex items-start gap-3"><span className="text-cyan-400 mt-0.5 font-bold">›</span> Instant on-chain kill switch</li>
                <li className="flex items-start gap-3"><span className="text-cyan-400 mt-0.5 font-bold">›</span> Every satoshi tracked with a strict nonce</li>
              </ul>
            </div>

          </div>
        </FadeInView>
      </section>

      {/* ─── Footer ─────────────────────────── */}
      <footer className="w-full relative z-10 border-t border-white/10 py-10 px-6 flex flex-col items-center justify-center text-center bg-[#050505]">
        <img src="/kova-logo.png" alt="Kova Logo" className="w-8 h-8 rounded-lg opacity-70 mb-6" />
        <div className="flex gap-8 text-xs font-mono uppercase tracking-widest text-white/60 mb-6">
          <a href="/" className="hover:text-white hover:text-cyan-400 transition-colors">Platform</a>
          <a href="#" className="hover:text-white hover:text-cyan-400 transition-colors">Documentation</a>
          <a href="https://github.com/KamiliaNHayati/kova.git" target="_blank" rel="noopener noreferrer" className="hover:text-white hover:text-cyan-400 transition-colors">GitHub</a>
        </div>
        <div className="text-[10px] text-white/40 uppercase tracking-widest">
          © {new Date().getFullYear()} Kova Protocol. Secured by Bitcoin.
        </div>
      </footer>
    </div>
  );
}