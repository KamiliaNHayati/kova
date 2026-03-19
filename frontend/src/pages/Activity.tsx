import { useEffect, useState, useRef } from "react";
import { useWallet } from "../context/WalletContext";
import { getSavedAgents, type AgentKeypair } from "../lib/agentKeys";
import { Activity as ActivityIcon, ArrowUpRight, ChevronDown, Bot, Cpu, RefreshCw } from "lucide-react";

interface SpendRecord {
  nonce: number;
  agent: string;
  service: string;
  amount: number;
  block: number;
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

export default function Activity() {
  const { address } = useWallet();
  const [records, setRecords] = useState<SpendRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentKeypair[]>([]);
  const [selectedAgentAddr, setSelectedAgentAddr] = useState<string>("ALL");
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    if (address) {
      const savedAgents = getSavedAgents(address);
      setAgents(savedAgents);
    }
  }, [address]);

  useEffect(() => {
      if (!address) return;
      if (agents.length === 0) return;
      setOffset(0);
      loadRecords(0);
  }, [address, selectedAgentAddr, agents]); 

  async function loadRecords(currentOffset: number) {
    setLoading(true);
    try {
        const agentParam = selectedAgentAddr === "ALL"
            ? agents.map(a => a.address).join(",")
            : selectedAgentAddr;

        // If no agents available yet, bail out
        if (!agentParam) {
            setRecords([]);
            setLoading(false);
            return;
        }
        const resp = await fetch(
            `http://localhost:4000/api/activity?owner=${address}&agent=${agentParam}&limit=${LIMIT}&offset=${currentOffset}`
        );
        if (resp.ok) {
            const data = await resp.json();
            const newRecords = data.records || [];
            if (currentOffset === 0) {
                setRecords(newRecords);
            } else {
                // Merge and re-sort to keep global order correct
                setRecords(prev => {
                    const merged = [...prev, ...newRecords];
                    return merged.sort((a, b) => b.block - a.block || b.nonce - a.nonce);
                });
            }
            setTotalCount(data.totalCount || 0);
        } else {
            if (currentOffset === 0) setRecords([]);
        }
    } catch (err) {
        console.error("[Activity] Error:", err);
        if (currentOffset === 0) setRecords([]);
    }
    setLoading(false);
  }

  function handleLoadMore() {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    loadRecords(newOffset);
  }

  const getAgentLabel = (addr: string) => {
    if (addr === "ALL") return "All Active Agents";
    const agent = agents.find(a => a.address === addr);
    return agent ? agent.label : addr.substring(0, 10) + "...";
  };

  return (
    <div className="min-h-screen w-full bg-[#030303] text-white pt-10 pb-20 px-6 font-sans relative overflow-x-hidden">
      
      {/* Subtle Monochrome Auroras */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[10%] right-[-10%] w-[500px] h-[500px] bg-white opacity-[0.02] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-white opacity-[0.02] blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10 animate-fade-in">
        
        {/* ─── Header & Filters ──────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-medium text-white tracking-tight mb-2">Activity Ledger</h1>
            <p className="text-white/50 font-light max-w-xl">
              Immutable on-chain spending history for your operational fleet. Every satoshi is tracked and verified.
            </p>
          </div>

          <div className="flex items-end gap-3">
            <button
              onClick={() => { setOffset(0); loadRecords(0); }}
              className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:bg-white/[0.08] transition-colors flex-shrink-0"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-cyan-400" />
            </button>

            {agents.length > 0 && (
              <div className="relative w-full md:w-64 z-40">
                <label className="block text-[10px] font-mono text-cyan-400/80 mb-2 uppercase tracking-widest">Filter by Node</label>
                <button
                  onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.08] rounded-2xl hover:bg-white/[0.04] transition-all shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/[0.05] border border-cyan-400/20 flex items-center justify-center shadow-inner">
                      <Bot className="w-4 h-4 text-cyan-400" />
                    </div>
                    <span className="font-medium text-sm text-white/90">{getAgentLabel(selectedAgentAddr)}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-white/40 transition-transform duration-300 ${agentDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {agentDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50 py-1">
                    <button
                      onClick={() => { setSelectedAgentAddr("ALL"); setAgentDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left ${"ALL" === selectedAgentAddr ? "bg-white/[0.02] relative" : ""}`}
                    >
                      {"ALL" === selectedAgentAddr && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />}
                      <Bot className={`w-4 h-4 flex-shrink-0 ${"ALL" === selectedAgentAddr ? "text-cyan-400" : "text-white/40"}`} />
                      <span className={`text-sm font-medium ${"ALL" === selectedAgentAddr ? "text-white" : "text-white/70"}`}>All Active Nodes</span>
                    </button>

                    {agents.map((agent) => (
                      <button
                        key={agent.address}
                        onClick={() => { setSelectedAgentAddr(agent.address); setAgentDropdownOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left ${agent.address === selectedAgentAddr ? "bg-white/[0.02] relative" : ""}`}
                      >
                        {agent.address === selectedAgentAddr && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />}
                        <Bot className={`w-4 h-4 flex-shrink-0 ${agent.address === selectedAgentAddr ? "text-cyan-400" : "text-white/40"}`} />
                        <div>
                          <p className={`text-sm font-medium ${agent.address === selectedAgentAddr ? "text-white" : "text-white/70"}`}>{agent.label}</p>
                          <p className="text-[10px] font-mono text-white/40 truncate max-w-[180px]">{agent.address}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>  
            )}
          </div>  
        </div>  

        {/* ─── Ledger Content ─────────────────────────────────────── */}
        {loading && records.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-white">
            <div className="relative w-12 h-12 flex items-center justify-center mb-4">
              <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
              <div className="absolute inset-0 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <Cpu className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">Scanning Blockchain</p>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-24 p-8 rounded-3xl border border-dashed border-white/10 bg-white/[0.01]">
            <ActivityIcon className="w-12 h-12 mx-auto mb-4 text-white/20" />
            <p className="text-white/70 font-medium mb-2">No activity detected.</p>
            <p className="text-sm text-white/40 font-light">
              Transactions will appear here automatically when your agent executes a payment.
            </p>
          </div>
        ) : (
          <div className="animate-fade-in-scale">
            
            {/* Desktop Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-[10px] font-mono uppercase tracking-widest text-white/40 border-b border-white/[0.05] mb-4">
              <div className="col-span-1">No.</div>
              <div className="col-span-4">Target Service</div>
              <div className="col-span-3">Origin Node</div>
              <div className="col-span-2 text-right">Settlement</div>
              <div className="col-span-2 text-right">Block Height</div>
            </div>

            {/* Transactions List */}
            <div className="space-y-3">
              {records.map((r, idx) => (
                <FadeInView key={`${r.agent}-${r.nonce}`} delay={idx * 30}>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center px-6 py-5 md:py-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-cyan-400/30 hover:bg-cyan-500/[0.02] transition-all duration-300 group shadow-sm">
                    
                    {/* Nonce (Mobile & Desktop) */}
                    <div className="md:col-span-1 flex items-center justify-between md:block">
                      <span className="md:hidden text-[10px] font-mono uppercase tracking-widest text-white/40">Nonce</span>
                      <span className="text-xs text-white/30 font-mono group-hover:text-cyan-400/50 transition-colors">
                        #{idx + 1 + offset} 
                      </span>
                    </div>

                    {/* Service */}
                    <div className="md:col-span-4 flex items-center justify-between md:block mt-2 md:mt-0">
                      <span className="md:hidden text-[10px] font-mono uppercase tracking-widest text-white/40">Target</span>
                      <div className="text-sm font-mono truncate text-white/80 group-hover:text-white transition-colors" title={r.service}>
                        {r.service}
                      </div>
                    </div>

                    {/* Agent */}
                    <div className="md:col-span-3 flex items-center justify-between md:block mt-2 md:mt-0">
                      <span className="md:hidden text-[10px] font-mono uppercase tracking-widest text-white/40">Origin Node</span>
                      <div className="text-[11px] font-mono truncate text-white/40" title={r.agent}>
                        {getAgentLabel(r.agent) === "All Active Nodes" ? r.agent : getAgentLabel(r.agent)}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="md:col-span-2 flex items-center justify-between md:block md:text-right mt-4 md:mt-0 pt-4 md:pt-0 border-t border-white/5 md:border-0">
                      <span className="md:hidden text-[10px] font-mono uppercase tracking-widest text-white/40">Settlement</span>
                      <div>
                        <span className="text-sm font-medium text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                          {(r.amount / 1_000_000).toFixed(4)}
                        </span>
                        <span className="text-[10px] text-cyan-400/50 ml-1 font-mono">STX</span>
                      </div>
                    </div>

                    {/* Block */}
                    <div className="md:col-span-2 flex items-center justify-between md:justify-end mt-2 md:mt-0 gap-3">
                      <span className="md:hidden text-[10px] font-mono uppercase tracking-widest text-white/40">Block Height</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-white/30 font-mono">
                          {r.block}
                        </span>
                        <ArrowUpRight className="w-4 h-4 text-white/20 group-hover:text-cyan-400 transition-colors" />
                      </div>
                    </div>

                  </div>
                </FadeInView>
              ))}
            </div>
            
            {/* Load More Pagination */}
            {records.length > 0 && records.length < totalCount && (
              <div className="pt-10 flex justify-center pb-10">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-8 py-3.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:text-white transition-all text-xs font-semibold uppercase tracking-widest text-white/60 disabled:opacity-50 flex items-center gap-3"
                >
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                      Retrieving...
                    </>
                  ) : (
                    "Load Historical Data"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}