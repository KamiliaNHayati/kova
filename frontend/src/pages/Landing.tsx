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
  ChevronRight,
  FileText,
  Package,
  RefreshCw,
} from "lucide-react";

const features = [
  {
    icon: Lock,
    title: "On-Chain Spending Rules",
    desc: "Daily limits, per-call caps, and service allowlists — all enforced by Clarity smart contracts.",
    gradient: "from-indigo-500/20 to-indigo-600/5",
  },
  {
    icon: Zap,
    title: "Autonomous X402 Payments",
    desc: "Your AI agent discovers services, negotiates HTTP 402 paywalls, and pays instantly.",
    gradient: "from-teal-500/20 to-emerald-600/5",
  },
  {
    icon: Eye,
    title: "Full Transparency",
    desc: "Every spend is logged on-chain with nonce-based tracking. Real-time activity feed included.",
    gradient: "from-violet-500/20 to-purple-600/5",
  },
  {
    icon: Shield,
    title: "Instant Kill Switch",
    desc: "One click to freeze all agent spending. Your agent's rules are enforced on-chain.",
    gradient: "from-amber-500/20 to-orange-600/5",
  },
];

const steps = [
  {
    num: "1",
    icon: Wallet,
    title: "Set Rules & Assign",
    desc: "Set spending limits, assign your AI agent, and allowlist services.",
    color: "from-indigo-500 to-indigo-600",
  },
  {
    num: "2",
    icon: Bot,
    title: "Agent Operates",
    desc: "Your agent pays for services via X402 — within your rules.",
    color: "from-teal-500 to-emerald-600",
  },
  {
    num: "3",
    icon: Activity,
    title: "Monitor & Control",
    desc: "Real-time dashboard. Adjust limits or kill switch anytime.",
    color: "from-violet-500 to-purple-600",
  },
];

// 3D Vanta.js Background
function Background3D() {
  const [vantaEffect, setVantaEffect] = useState<any>(null);
  const vantaRef = useRef(null);

  useEffect(() => {
    if (!vantaEffect) {
      setVantaEffect(
        NET({
          el: vantaRef.current,
          THREE: THREE,
          color: 0xf4791f, // Stacks orange
          backgroundColor: 0x0f1626,
          backgroundAlpha: 0.0, // Transparent to show CSS gradients
          points: 6.50, // Reduced from 8.00 by ~20%
          maxDistance: 26.00,
          spacing: 24.00,
          showDots: true,
          speed: 0.5, // Reduced animation speed
        })
      );
    }
    return () => {
      if (vantaEffect) vantaEffect.destroy();
    };
  }, [vantaEffect]);

  return <div ref={vantaRef} className="absolute inset-0 pointer-events-none z-0 opacity-20" />; // Reduced opacity to keep focus off background
}

function FadeInView({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) {
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
      className={`transition-all duration-1000 ease-out ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
        }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// Animated transaction flow in the hero
function LiveFlowDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % 5);
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  const flowSteps = [
    { label: "Agent requests /api/data", icon: <Bot className="w-5 h-5" />, color: "text-accent" },
    { label: "Service: 402 — Pay 0.01 STX", icon: <Lock className="w-5 h-5" />, color: "text-amber-400" },
    { label: "validate-spend → Rules OK?", icon: <FileText className="w-5 h-5" />, color: "text-purple-400" },
    { label: "✓ verified · ✓ within limits", icon: <CheckCircle2 className="w-5 h-5 text-success" />, color: "text-success" },
    { label: "200 OK — Data received!", icon: <Package className="w-5 h-5 text-teal-400" />, color: "text-teal-400" },
  ];

  return (
    <div className="relative max-w-md mx-auto mt-16 animate-slide-up-d3">
      <div className="p-5 rounded-2xl bg-surface/60 border border-border backdrop-blur-md">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2.5 h-2.5 rounded-full bg-danger" />
          <div className="w-2.5 h-2.5 rounded-full bg-warning" />
          <div className="w-2.5 h-2.5 rounded-full bg-success" />
          <span className="text-[10px] text-text-muted ml-2 font-mono">kova-agent-demo</span>
        </div>
        <div className="space-y-2 font-mono text-xs">
          {flowSteps.map((s, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 transition-all duration-500 scale-100 ${i <= step ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
                }`}
            >
              <span className="flex items-center justify-center text-base">{s.icon}</span>
              <span className={i === step ? s.color + " font-medium" : "text-text-muted"}>
                {s.label}
              </span>
              {i < step && <CheckCircle2 className="w-3.5 h-3.5 text-success/60 ml-auto animate-fade-in-scale" />}
              {i === step && (
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse ml-auto" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Glow effect under the terminal */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-accent/10 blur-xl rounded-full" />
    </div>
  );
}

// Animated counter
function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 2000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.floor(eased * target);
      setValue(start);
      if (progress < 1) requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          animate();
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    const el = document.getElementById(`stat-${target}`);
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span id={`stat-${target}`}>
      {value.toLocaleString()}
      {suffix}
    </span>
  );
}

export default function Landing() {
  const { connect } = useWallet();

  return (
    <div className="h-screen w-full bg-bg relative overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth">
      {/* ─── Ambient background ──────────────────── */}
      <div className="bg-ambient-glow fixed inset-0 pointer-events-none" />
      <div className="fixed inset-0 pointer-events-none">
        <Background3D />
      </div>

      {/* ─── Nav ──────────────────────────────────── */}
      <nav className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-6 lg:px-8 py-4 backdrop-blur-md bg-bg/40 border-b border-white/5">
        <div className="flex items-center gap-3">
          <img src="/kova-logo.png" alt="Kova" className="w-9 h-9 rounded-xl shadow-lg shadow-accent/20" />
          <span className="text-xl font-bold tracking-tight">Kova</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm text-text-muted absolute left-1/2 -translate-x-1/2">
          <a href="#features" className="hover:text-text transition-colors">Features</a>
          <a href="/how-it-works" className="hover:text-text transition-colors">How It Works</a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-text transition-colors">GitHub</a>
        </div>

        <button
          onClick={() => connect()}
          className="px-5 py-2.5 bg-gradient-to-r from-accent to-accent-hover text-white text-sm font-medium rounded-xl transition-all duration-300 hover:shadow-[0_0_28px_rgba(99,102,241,0.4)] hover:scale-[1.03] animate-pulse-glow"
        >
          Connect Wallet
        </button>
      </nav>

      {/* ─── Hero ─────────────────────────────────── */}
      <section className="relative z-10 w-full min-h-screen flex flex-col items-center justify-center px-8 pt-20 pb-12 text-center snap-start shrink-0 overflow-hidden">
        {/* Glow Effects */}
        <div className="bg-glow-orange -top-[10%] -left-[10%] opacity-40" />
        <div className="bg-glow-teal top-[20%] -right-[10%] opacity-30" />

        <div className="max-w-5xl mx-auto w-full relative z-10">
          <FadeInView delay={100}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/60 text-xs font-medium text-text-muted mb-8 bg-surface/30 backdrop-blur-md hover:border-border transition-colors cursor-default">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Built on Stacks · Secured by Bitcoin
            </div>
          </FadeInView>

          <FadeInView delay={200}>
            <h1 className="text-5xl md:text-7xl font-bold leading-[1.1] tracking-tight text-white mt-4">
              Trust your AI agent <br />
              <span className="text-text-muted">with your Bitcoin.</span>
            </h1>
          </FadeInView>

          <FadeInView delay={350}>
            <p className="mt-8 text-lg md:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed font-medium">
              Kova is a smart wallet where Clarity contracts enforce spending
              rules for autonomous AI agents. Set budgets, allowlist services,
              and let your agent work.
            </p>
          </FadeInView>

          <FadeInView delay={500}>
            <div className="mt-10 flex items-center justify-center gap-4">
              <button
                onClick={() => connect()}
                className="group px-8 py-3.5 bg-white text-bg font-semibold rounded-full transition-all duration-300 text-base flex items-center gap-2 hover:shadow-[0_0_36px_rgba(255,255,255,0.2)] hover:scale-[1.03]"
              >
                Launch App
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="/how-it-works"
                className="px-8 py-3.5 border border-border hover:border-accent/50 text-text-muted hover:text-text font-medium rounded-xl transition-all duration-300 text-base"
              >
                How It Works
              </a>
            </div>
          </FadeInView>

          {/* Live flow demo in terminal */}
          <FadeInView delay={700}>
            <div className="mt-12">
              <LiveFlowDemo />
            </div>
          </FadeInView>
        </div>
      </section>

      {/* ─── Security & Scale Stats ───────────────────── */}
      <section className="relative z-10 w-full min-h-screen flex flex-col items-center justify-center px-8 py-16 snap-start shrink-0 overflow-hidden border-t border-border/30 bg-surface/10">
        <div className="bg-glow-teal bottom-0 left-[20%] opacity-20" />

        <div className="max-w-5xl mx-auto w-full relative z-10">
          <FadeInView>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                Production-grade infrastructure
              </h2>
              <p className="mt-4 text-text-muted max-w-xl mx-auto">
                Immutable Clarity contracts that settle on Bitcoin. Complete peace of mind when agents spend your money.
              </p>
            </div>
          </FadeInView>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                value: 5,
                suffix: "",
                label: "Security Checks per Tx",
                desc: "Active wallet, allowlist, identity, daily limit, and per-call cap verifications.",
                icon: <Shield className="w-8 h-8 text-accent/80" />
              },
              {
                value: 57,
                suffix: "",
                label: "Automated Contract Tests",
                desc: "Rigorous test coverage preventing drains and access control bypasses.",
                icon: <FileText className="w-8 h-8 text-accent/80" />
              },
              {
                value: 2,
                suffix: "%",
                label: "Immutable Protocol Fee",
                desc: "Transparent on-chain revenue model built seamlessly into the HTTP 402 flow.",
                icon: <Package className="w-8 h-8 text-accent/80" />
              },
            ].map((stat, i) => (
              <FadeInView key={stat.label} delay={100 + (i * 150)}>
                <div
                  className="group relative p-8 rounded-2xl bg-surface/30 border border-border/50 hover:border-accent/40 transition-all hover:bg-surface/50 hover:-translate-y-1 h-full flex flex-col items-center text-center overflow-hidden"
                >
                  {/* Subtle glow */}
                  <div className="absolute inset-0 bg-gradient-to-b from-accent/0 to-transparent group-hover:from-accent/5 transition-colors duration-500" />

                  <div className="flex justify-center mb-6 transition-transform group-hover:scale-110 group-hover:text-amber-500 duration-300 relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border/50 flex items-center justify-center shadow-lg group-hover:shadow-accent/20 group-hover:border-accent/40 transition-all">
                      {stat.icon}
                    </div>
                  </div>

                  <div className="relative z-10">
                    <p className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60 drop-shadow-sm mb-2">
                      <AnimatedNumber target={stat.value} suffix={stat.suffix} />
                    </p>
                    <h3 className="text-lg font-bold text-white mb-3 tracking-tight">{stat.label}</h3>
                    <p className="text-sm text-text-muted leading-relaxed">{stat.desc}</p>
                  </div>
                </div>
              </FadeInView>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────── */}
      <section id="features" className="relative z-10 w-full min-h-screen flex flex-col items-center justify-center px-8 py-20 snap-start shrink-0 overflow-hidden">
        {/* Glow Effects */}
        <div className="bg-glow-orange top-1/2 left-[50%] -translate-x-1/2 -translate-y-1/2 opacity-20 w-[800px] h-[800px]" />

        <div className="max-w-6xl mx-auto w-full relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Built for trust, designed for autonomy
            </h2>
            <p className="mt-4 text-text-muted max-w-lg mx-auto">
              Everything your AI agent needs to operate safely within your rules.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <FadeInView key={f.title} delay={i * 100}>
                <div
                  className={`group relative p-8 rounded-2xl bg-surface/40 border border-border/50 hover:border-accent/40 shadow-lg transition-all duration-300 overflow-hidden h-full`}
                >
                  {/* Subtle background glow on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-accent/0 to-accent/0 group-hover:from-accent/10 transition-all duration-300" />

                  {/* Smaller backdrop icon for density */}
                  <div className="absolute -bottom-4 -right-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-300 pointer-events-none transform group-hover:scale-110">
                    <f.icon className="w-32 h-32" />
                  </div>

                  <div className="relative z-10 flex flex-col h-full">
                    <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center mb-6 shadow-sm group-hover:border-accent/50 group-hover:bg-accent/10 transition-colors">
                      <f.icon className="w-5 h-5 text-accent" />
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-white tracking-tight">{f.title}</h3>
                    <p className="text-sm text-text-muted leading-relaxed max-w-sm mt-auto">{f.desc}</p>
                  </div>
                </div>
              </FadeInView>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─────────────────────────── */}
      <section id="how-it-works" className="relative z-10 w-full min-h-screen flex flex-col items-center justify-center px-8 py-20 snap-start shrink-0 overflow-hidden border-t border-border/30 bg-surface/10">
        <div className="bg-glow-teal top-10 -left-[10%] opacity-20" />
        <div className="bg-glow-orange bottom-10 -right-[10%] opacity-20" />

        <div className="max-w-5xl mx-auto w-full relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              How Kova works
            </h2>
            <p className="mt-4 text-text-muted">
              Three simple steps to autonomous AI spending.
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-8 relative">
            {/* Vertical connecting line */}
            <div className="hidden md:block absolute top-[40px] bottom-[40px] left-[27px] w-px bg-gradient-to-b from-transparent via-accent/30 to-transparent z-0" />

            {steps.map((s, i) => (
              <FadeInView key={s.num} delay={i * 150}>
                <div
                  className="group relative z-10 flex flex-col md:flex-row gap-6 md:gap-10 items-start p-6 rounded-2xl bg-surface/40 border border-border/50 hover:bg-surface/60 hover:border-accent/40 hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-lg"
                >
                  <div className="shrink-0 relative">
                    <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center shadow-md group-hover:border-accent group-hover:text-amber-400 group-hover:bg-accent/10 group-hover:shadow-[0_0_20px_rgba(244,121,31,0.2)] transition-all duration-300 rotate-3 group-hover:rotate-0">
                      <span className="font-bold text-lg">{s.num}</span>
                    </div>
                  </div>

                  <div className="flex flex-col flex-1 pt-2">
                    <div className="flex items-center gap-3 mb-2">
                      <s.icon className={`w-5 h-5 text-accent`} />
                      <h3 className="font-bold text-xl text-white tracking-tight">{s.title}</h3>
                    </div>
                    <p className="text-text-muted leading-relaxed text-sm md:text-base">{s.desc}</p>
                  </div>
                </div>
              </FadeInView>
            ))}
          </div>

          {/* Learn more link */}
          <div className="text-center mt-8">
            <a
              href="/how-it-works"
              className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors"
            >
              See detailed breakdown
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── CTA & Footer ─────────────────────────── */}
      <section className="relative z-10 w-full min-h-screen flex flex-col items-center justify-center px-8 pt-20 pb-0 snap-start shrink-0 overflow-hidden">
        {/* Intense Central Glow */}
        <div className="bg-glow-orange top-1/2 left-[50%] -translate-x-1/2 -translate-y-1/2 opacity-30 w-[1000px] h-[1000px]" />

        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col justify-center relative z-10">
          <FadeInView>
            <div className="relative rounded-[2rem] overflow-hidden bg-surface/20 border border-border/50 p-12 text-center shadow-lg">
              <div className="relative z-10">
                <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white tracking-tight">
                  Ready to let your agent work?
                </h2>
                <p className="text-text-muted max-w-md mx-auto mb-8">
                  Deploy your smart wallet on Stacks testnet in minutes. No mainnet fees required.
                </p>
                <button
                  onClick={() => connect()}
                  className="group px-10 py-4 bg-white text-bg font-semibold rounded-full transition-all duration-300 text-base flex items-center gap-2 mx-auto hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </FadeInView>
        </div>

        {/* ─── Footer ───────────────────────────────── */}
        <footer className="w-full relative z-10 border-t border-border/50 py-8 text-center mt-auto">
          <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
            <Shield className="w-4 h-4 text-accent" />
            <span>Kova — Built for Buidl Battle on Stacks</span>
          </div>
        </footer>
      </section>
    </div>
  );
}
