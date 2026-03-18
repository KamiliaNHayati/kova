import { useEffect, useState, useRef } from "react";
import * as THREE from "three";
// @ts-ignore
import NET from "vanta/dist/vanta.net.min";
import { useWallet } from "../context/WalletContext";
import {
  Shield,
  Zap,
  Lock,
  Eye,
  ArrowRight,
  Wallet,
  Bot,
  Activity,
  CheckCircle2,
  Terminal,
  Network
} from "lucide-react";

// ─── DATA ────────────────────────────────────────────────────────
const features = [
  {
    icon: Lock,
    title: "On-Chain Spending Rules",
    desc: "Daily limits, per-call caps, and service allowlists — all enforced securely by Clarity smart contracts on the Stacks blockchain.",
    colSpan: "md:col-span-2 lg:col-span-8", // Full width on tablet, wide on desktop
  },
  {
    icon: Zap,
    title: "X402 Payments",
    desc: "Your AI agent discovers services and negotiates HTTP 402 paywalls instantly.",
    colSpan: "md:col-span-1 lg:col-span-4", // Half width on tablet, narrow on desktop
  },
  {
    icon: Eye,
    title: "Full Transparency",
    desc: "Every satoshi spent is logged on-chain with strict nonce-based tracking.",
    colSpan: "md:col-span-1 lg:col-span-4", // Half width on tablet, narrow on desktop
  },
  {
    icon: Shield,
    title: "Instant Kill Switch",
    desc: "Maintain absolute control. One click freezes all agent spending immediately.",
    colSpan: "md:col-span-2 lg:col-span-8", // Full width on tablet, wide on desktop
  },
];

const steps = [
  {
    num: "01",
    icon: Wallet,
    title: "Fund & Restrict",
    desc: "Deposit STX into the smart escrow and set your hard spending limits.",
  },
  {
    num: "02",
    icon: Bot,
    title: "Deploy Agent",
    desc: "Your AI autonomously navigates X402 paywalls within your boundaries.",
  },
  {
    num: "03",
    icon: Activity,
    title: "Monitor & Kill",
    desc: "Track every transaction live on-chain, and pull the plug instantly if needed.",
  },
];

// ─── COMPONENTS ──────────────────────────────────────────────────

// Vanta Background - Tidy, dark, and highly optimized
function Background3D() {
  const [vantaEffect, setVantaEffect] = useState<any>(null);
  const vantaRef = useRef(null);

  useEffect(() => {
    if (!vantaEffect) {
      setVantaEffect(
        NET({
          el: vantaRef.current,
          THREE: THREE,
          color: 0x444444, // Subtle grey
          backgroundColor: 0x030303, // True black
          backgroundAlpha: 1.0,
          points: 6.00,
          maxDistance: 24.00,
          spacing: 30.00,
          showDots: true,
          speed: 0.1, 
        })
      );
    }
    return () => {
      if (vantaEffect) vantaEffect.destroy();
    };
  }, [vantaEffect]);

  return <div ref={vantaRef} className="absolute inset-0 pointer-events-none z-0 opacity-20 mix-blend-screen" />;
}

// Fade Animation Wrapper (Now accepts className for grid support!)
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

// Cleaned up, centered glass terminal
function LiveFlowDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % 6);
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  const flowSteps = [
    { label: "Agent requests /.well-known/x402", color: "text-white/60" },
    { label: "Paywall Hit: 402 Payment Required (0.5 STX)", color: "text-amber-400/80" },
    { label: "Verifying Clarity smart contract rules...", color: "text-white/80" },
    { label: "✓ Rules validated · Escrow transferred", color: "text-emerald-400" },
    { label: "200 OK — Data payload delivered", color: "text-white" },
  ];

  const isSuccessState = step >= 3 && step < 5;

  return (
    <div className="relative max-w-2xl mx-auto mt-16 w-full">
      {/* Background glow that reacts to success state */}
      <div className={`absolute -inset-4 blur-3xl transition-colors duration-1000 rounded-full opacity-30 ${isSuccessState ? "bg-emerald-500/20" : "bg-white/5"}`} />
      
      <div className={`relative p-6 md:p-8 rounded-3xl bg-white/[0.02] border backdrop-blur-xl shadow-2xl transition-all duration-700 ${isSuccessState ? "border-emerald-500/30" : "border-white/[0.08]"}`}>
        
        {/* Terminal Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <Terminal className="w-4 h-4 text-white/40" />
            <span className="text-xs font-mono text-white/60 tracking-widest uppercase">Kova_Agent_Node</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 border ${isSuccessState ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-white/[0.03] border-white/[0.05] text-white/40"}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isSuccessState ? "bg-emerald-400" : "bg-amber-400/80 animate-pulse"}`} />
            {isSuccessState ? "Settled" : "Processing"}
          </div>
        </div>

        {/* Terminal Body */}
        <div className="space-y-4 font-mono text-xs md:text-sm text-left">
          {flowSteps.map((s, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 transition-all duration-500 ${
                  i <= step && step < 5 ? "opacity-100 translate-x-0" : "opacity-0 pointer-events-none h-0 overflow-hidden"
              }`}
            >
              <span className="text-white/30 mt-0.5">{`>`}</span>
              <span className={i === step ? s.color + " font-medium" : "text-white/40"}>
                {s.label}
              </span>
              {i < step && <CheckCircle2 className="w-4 h-4 text-emerald-500/60 ml-auto shrink-0" />}
              {i === step && <div className="w-2 h-4 bg-white/60 animate-pulse ml-2 mt-0.5" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────

export default function Landing() {
  const { connect } = useWallet();

  return (
    <div className="min-h-screen w-full bg-[#030303] text-white relative overflow-x-hidden scroll-smooth selection:bg-white/20">
      
      {/* ─── Ambient Aurora ──────────────────── */}
      {/* Kept tidy and strictly in the background to avoid layout leaks */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <Background3D />
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-white opacity-[0.03] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#f4791f] opacity-[0.03] blur-[150px] rounded-full mix-blend-screen" />
      </div>

      {/* ─── Floating Nav ──────────────────────────────────── */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between w-[90%] max-w-4xl px-3 py-3 rounded-2xl border border-white/[0.08] bg-[#030303]/60 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-3 pl-2 cursor-pointer">
          <img src="/kova-logo.png" alt="Kova" className="w-7 h-7 rounded-lg grayscale contrast-125" />
          <span className="text-sm font-bold tracking-widest uppercase">Kova</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-xs font-mono text-white/50 uppercase tracking-widest">
          <a href="#features" className="hover:text-white transition-colors">Platform</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">Protocol</a>
        </div>

        <button
          onClick={() => connect()}
          className="px-5 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-300 hover:bg-white/90"
        >
          Connect
        </button>
      </nav>

      {/* ─── Hero Section ─────────────────────────────────── */}
      <section className="relative z-10 w-full pt-40 pb-24 px-6 flex flex-col items-center text-center">
        <div className="max-w-4xl mx-auto w-full">
          <FadeInView delay={100}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-xs font-mono uppercase tracking-widest text-white/60 bg-white/[0.02] backdrop-blur-md mb-8">
              <Network className="w-3.5 h-3.5" />
              Secured by Stacks & Bitcoin
            </div>
          </FadeInView>

          <FadeInView delay={200}>
            <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-white/90 leading-[1.1]">
              Unleash your AI. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">
                Control its spending.
              </span>
            </h1>
            <p className="mt-6 text-base md:text-lg text-white/50 max-w-2xl mx-auto font-light leading-relaxed">
              Kova is a smart escrow protocol where Clarity contracts enforce hard rules for autonomous AI agents navigating X402 paywalls.
            </p>
          </FadeInView>

          <FadeInView delay={400}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => connect()}
                className="w-full sm:w-auto px-8 py-3.5 bg-white text-black font-bold uppercase tracking-wider text-xs rounded-xl transition-all duration-300 hover:scale-105"
              >
                Launch App
              </button>
              <a
                href="/how-it-works"
                className="w-full sm:w-auto px-8 py-3.5 bg-white/[0.03] border border-white/10 text-white font-bold uppercase tracking-wider text-xs rounded-xl transition-all duration-300 hover:bg-white/[0.08]"
              >
                Read Docs
              </a>
            </div>
          </FadeInView>

          <FadeInView delay={600}>
            <LiveFlowDemo />
          </FadeInView>
        </div>
      </section>

      {/* ─── Bento Box Features ─────────────────────────────────── */}
      <section id="features" className="relative z-10 w-full px-6 py-24 border-t border-white/[0.05] bg-[#030303]/50">
        <div className="max-w-6xl mx-auto w-full">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-medium text-white tracking-tight">
              Designed for autonomy. Built for trust.
            </h2>
            <p className="mt-4 text-white/50 text-sm font-light max-w-xl mx-auto">
              Everything your agent needs to operate smoothly, entirely gated by immutable rules.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 md:gap-6">
            {features.map((f, i) => (
              <FadeInView key={f.title} delay={i * 100} className={f.colSpan}>
                <div className="p-8 md:p-10 rounded-3xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-500 h-full flex flex-col">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.05] flex items-center justify-center text-white/80 mb-8">
                    <f.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-medium mb-3 text-white/90">{f.title}</h3>
                  <p className="text-sm text-white/50 font-light leading-relaxed">{f.desc}</p>
                </div>
              </FadeInView>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it Works (Horizontal Timeline) ──────────────────── */}
      <section id="how-it-works" className="relative z-10 w-full px-6 py-24">
        <div className="max-w-6xl mx-auto w-full">
          <div className="flex flex-col items-center mb-16">
            <div className="px-4 py-1.5 rounded-full border border-white/10 text-xs font-mono uppercase tracking-widest text-white/60 bg-white/[0.02] mb-6">
              Protocol Flow
            </div>
            <h2 className="text-3xl md:text-4xl font-medium text-white tracking-tight text-center">
              Three steps to automation
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Desktop connecting line */}
            <div className="hidden md:block absolute top-[44px] left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent z-0" />

            {steps.map((s, i) => (
              <FadeInView key={s.num} delay={i * 150}>
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full bg-[#030303] border border-white/[0.08] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,255,255,0.02)] relative">
                    {/* Inner glowing ring */}
                    <div className="absolute inset-2 rounded-full border border-white/10 bg-white/[0.02]" />
                    <span className="text-lg font-mono text-white/80 z-10">{s.num}</span>
                  </div>
                  <h3 className="font-medium text-xl text-white/90 mb-3">{s.title}</h3>
                  <p className="text-sm text-white/50 font-light max-w-[250px] leading-relaxed">{s.desc}</p>
                </div>
              </FadeInView>
            ))}
          </div>
        </div>
      </section>
      {/* ─── CTA ─────────────────────────── */}
      <section className="relative z-10 w-full px-6 py-24 border-t border-white/[0.05]">
          <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-medium text-white mb-4">
                  Ready to let your agent work?
              </h2>
              <p className="text-white/50 text-sm mb-8 font-light">
                  Deploy on Stacks testnet in minutes. No mainnet fees.
              </p>
              <button
                  onClick={() => connect()}
                  className="px-10 py-4 bg-white text-black font-bold uppercase tracking-wider text-xs rounded-xl hover:scale-105 transition-all duration-300"
              >
                  Get Started
              </button>
          </div>
      </section>

      {/* ─── Footer ─────────────────────────── */}
      <footer className="w-full relative z-10 border-t border-white/[0.05] py-10 px-6 flex flex-col items-center justify-center text-center bg-[#030303]">
        <img src="/kova-logo.png" alt="Kova Logo" className="w-8 h-8 rounded-lg grayscale opacity-50 mb-6" />
        <div className="flex gap-8 text-xs font-mono uppercase tracking-widest text-white/40 mb-6">
          <a href="#" className="hover:text-white transition-colors">Platform</a>
          <a href="/how-it-works" className="hover:text-white transition-colors">Documentation</a>
          <a href="https://github.com/KamiliaNHayati/kova.git" className="hover:text-white transition-colors">GitHub</a>
        </div>
        <div className="text-[10px] text-white/30 uppercase tracking-widest">
          © {new Date().getFullYear()} Kova Protocol — Built on Stacks · x402 Protocol
        </div>
      </footer>
    </div>
  );
}