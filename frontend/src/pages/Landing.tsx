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
    colSpan: "md:col-span-2 lg:col-span-8",
    iconStyle: "text-cyan-400 bg-cyan-500/[0.05] border-cyan-400/20",
  },
  {
    icon: Zap,
    title: "X402 Payments",
    desc: "Your AI agent discovers services and negotiates HTTP 402 paywalls instantly.",
    colSpan: "md:col-span-1 lg:col-span-4",
    iconStyle: "text-fuchsia-400 bg-fuchsia-500/[0.05] border-fuchsia-400/20",
  },
  {
    icon: Eye,
    title: "Full Transparency",
    desc: "Every satoshi spent is logged on-chain with strict nonce-based tracking.",
    colSpan: "md:col-span-1 lg:col-span-4",
    iconStyle: "text-sky-400 bg-sky-500/[0.05] border-sky-400/20",
  },
  {
    icon: Shield,
    title: "Instant Kill Switch",
    desc: "Maintain absolute control. One click freezes all agent spending immediately.",
    colSpan: "md:col-span-2 lg:col-span-8",
    iconStyle: "text-red-400 bg-red-500/[0.05] border-red-400/20",
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

// Cleaned up, centered glass terminal
function LiveFlowDemo() {
  const [step, setStep] = useState(0);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => {
        if (prev >= 4) {
          setResetting(true);
          setTimeout(() => { setResetting(false); setStep(0); }, 1500);
          return prev;
        }
        return prev + 1;
      });
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  const flowSteps = [
    { label: "Agent requests /.well-known/x402", color: "text-white/60" },
    { label: "Paywall Hit: 402 Payment Required (0.5 STX)", color: "text-fuchsia-400/90" },
    { label: "Verifying Clarity smart contract rules...", color: "text-sky-400/90" },
    { label: "✓ Rules validated · Escrow transferred", color: "text-emerald-400" },
    { label: "200 OK — Data payload delivered", color: "text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]" },
  ];

  const isSuccessState = step >= 3 && step < 5;

  return (
    <div className="relative max-w-2xl mx-auto mt-16 w-full">
      {/* Background glow that reacts to success state */}
      <div className={`absolute -inset-4 blur-3xl transition-colors duration-1000 rounded-full opacity-30 ${isSuccessState ? "bg-cyan-500/20" : "bg-white/5"}`} />

      <div className={`relative p-6 md:p-8 rounded-3xl bg-white/[0.02] border backdrop-blur-xl shadow-2xl transition-all duration-700 ${isSuccessState ? "border-cyan-500/30" : "border-white/[0.08]"}`}>

        {/* Terminal Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <Terminal className="w-4 h-4 text-cyan-400/60" />
            <span className="text-xs font-mono text-white/60 tracking-widest uppercase">Kova_Agent_Node</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 border ${isSuccessState ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-white/[0.03] border-white/[0.05] text-white/40"}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isSuccessState ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" : "bg-amber-400/80 animate-pulse"}`} />
            {isSuccessState ? "Settled" : "Processing"}
          </div>
        </div>

        {/* Terminal Body */}
        <div className="space-y-4 font-mono text-xs md:text-sm text-left">
          {flowSteps.map((s, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 transition-all duration-500 ${i <= step && step < 5 ? "opacity-100 translate-x-0" : "opacity-0 pointer-events-none h-0 overflow-hidden"
                }`}
            >
              <span className="text-white/30 mt-0.5">{`>`}</span>
              <span className={i === step ? s.color + " font-medium" : "text-white/40"}>
                {s.label}
              </span>
              {i < step && <CheckCircle2 className="w-4 h-4 text-cyan-500/60 ml-auto shrink-0" />}
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bg-[#030303] text-white relative overflow-x-hidden scroll-smooth selection:bg-cyan-400/30">

      {/* ─── Ambient Aurora (Sky & Indigo to match Dashboard) ─── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <Background3D />
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-sky-500 opacity-[0.04] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-500 opacity-[0.04] blur-[150px] rounded-full mix-blend-screen" />
      </div>

      {/* ─── Floating Nav ──────────────────────────────────── */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-4xl rounded-2xl border border-white/[0.08] bg-[#030303]/60 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between px-3 py-3">
          <div className="flex items-center gap-3 pl-2 cursor-pointer">
            <img src="/kova-logo.svg" alt="Kova" className="w-7 h-7 rounded-lg" />
            <span className="text-sm font-bold tracking-widest uppercase">Kova</span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-xs font-mono text-white/50 uppercase tracking-widest">
            <a href="#features" className="hover:text-white transition-colors">Platform</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">Protocol</a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => connect()}
              className="px-5 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-300 hover:bg-gray-200 shadow-[0_0_10px_rgba(255,255,255,0.1)]"
            >
              Connect
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl border border-white/10 hover:bg-white/[0.05] transition-colors"
            >
              <div className="w-4 h-3 flex flex-col justify-between">
                <div className={`h-px bg-white/70 transition-all duration-300 ${mobileMenuOpen ? "rotate-45 translate-y-1.5" : ""}`} />
                <div className={`h-px bg-white/70 transition-all duration-300 ${mobileMenuOpen ? "opacity-0" : ""}`} />
                <div className={`h-px bg-white/70 transition-all duration-300 ${mobileMenuOpen ? "-rotate-45 -translate-y-1.5" : ""}`} />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.05] px-6 py-4 flex flex-col gap-4">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-mono uppercase tracking-widest text-white/50 hover:text-white transition-colors py-1"
            >
              Platform
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-mono uppercase tracking-widest text-white/50 hover:text-white transition-colors py-1"
            >
              Protocol
            </a>
          </div>
        )}
      </nav>

      {/* ─── Hero Section ─────────────────────────────────── */}
      <section className="relative z-10 w-full pt-40 pb-24 px-6 flex flex-col items-center text-center">
        <div className="max-w-4xl mx-auto w-full">
          <FadeInView delay={100}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-400/20 text-xs font-mono uppercase tracking-widest text-cyan-400 bg-cyan-500/[0.05] backdrop-blur-md mb-8">
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
                className="w-full sm:w-auto px-8 py-3.5 bg-cyan-400 hover:bg-cyan-300 text-black font-bold uppercase tracking-wider text-xs rounded-xl transition-all duration-300 hover:scale-105 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
              >
                Launch App
              </button>
              <a
                href="/how-it-works"
                className="w-full sm:w-auto px-8 py-3.5 bg-white/[0.03] border border-white/10 text-white hover:bg-white/[0.08] font-bold uppercase tracking-wider text-xs rounded-xl transition-all duration-300"
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
                <div className="group p-8 md:p-10 rounded-3xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-500 h-full flex flex-col">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-8 border transition-colors duration-500 ${f.iconStyle}`}>
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
            <div className="px-4 py-1.5 rounded-full border border-cyan-400/20 text-xs font-mono uppercase tracking-widest text-cyan-400 bg-cyan-500/[0.05] mb-6">
              Protocol Flow
            </div>
            <h2 className="text-3xl md:text-4xl font-medium text-white tracking-tight text-center">
              Three steps to automation
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Desktop connecting line */}
            <div className="hidden md:block absolute top-[44px] left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent z-0" />

            {steps.map((s, i) => (
              <FadeInView key={s.num} delay={i * 150}>
                <div className="relative z-10 flex flex-col items-center text-center group">
                  <div className="w-24 h-24 rounded-full bg-[#030303] border border-white/[0.08] group-hover:border-cyan-400/30 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(34,211,238,0.02)] group-hover:shadow-[0_0_30px_rgba(34,211,238,0.1)] relative transition-all duration-500">
                    <div className="absolute inset-2 rounded-full border border-white/10 group-hover:border-cyan-400/20 bg-white/[0.02] transition-colors duration-500" />
                    <s.icon className="w-6 h-6 text-cyan-400 z-10" />
                  </div>
                  <p className="text-[10px] font-mono text-cyan-400/50 uppercase tracking-widest mb-2">{s.num}</p>
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
          <h2 className="text-3xl md:text-4xl font-medium text-white mb-4 tracking-tight">
            Ready to let your agent work?
          </h2>
          <p className="text-white/50 text-sm mb-8 font-light">
            Deploy on Stacks testnet in minutes. No mainnet fees.
          </p>
          <button
            onClick={() => connect()}
            className="px-10 py-4 bg-cyan-400 text-black font-bold uppercase tracking-wider text-xs rounded-xl hover:scale-105 hover:bg-cyan-300 transition-all duration-300 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
          >
            Get Started
          </button>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────── */}
      <footer className="w-full relative z-10 border-t border-white/[0.05] py-10 px-6 flex flex-col items-center justify-center text-center bg-[#030303]">
        <img src="/kova-logo.png" alt="Kova Logo" className="w-8 h-8 rounded-lg opacity-50 mb-6" />
        <div className="flex gap-8 text-xs font-mono uppercase tracking-widest text-white/40 mb-6">
          <a href="#" className="hover:text-white transition-colors">Platform</a>
          <a href="/how-it-works" className="hover:text-white transition-colors">Documentation</a>
          <a href="https://github.com/KamiliaNHayati/kova.git" className="hover:text-white transition-colors">GitHub</a>
        </div>
        <div className="text-[10px] text-white/30 uppercase tracking-widest">
          © {new Date().getFullYear()} Kova Protocol — Built on Stacks · X402 Protocol
        </div>
      </footer>
    </div>
  );
}