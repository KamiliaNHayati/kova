import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { getWallet, setActive, getSpendNonce, getSpendRecord } from "../lib/contracts";
import { getSavedAgents, type AgentKeypair } from "../lib/agentKeys";
import {
  Wallet,
  ShieldCheck,
  ShieldOff,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Star,
  Bot,
  ChevronDown,
  Cpu,
  ActivitySquare,
  Network
} from "lucide-react";

interface WalletData {
  balance: number;
  dailyLimit: number;
  perCallLimit: number;
  spentToday: number;
  active: boolean;
}

interface SpendEntry {
  nonce: number;
  service: string;
  amount: number;
  block: number;
  agent: string;
}

export default function Dashboard() {
  const { address } = useWallet();
  const navigate = useNavigate();
  const [wallet, setWalletData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [txStatus, setTxStatus] = useState("");
  const [spendHistory, setSpendHistory] = useState<SpendEntry[]>([]);
  const [agents, setAgents] = useState<AgentKeypair[]>([]);
  const [selectedAgentIdx, setSelectedAgentIdx] = useState(0);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  
  useEffect(() => {
    if (!address) return;
    const saved = getSavedAgents(address);
    setAgents(saved);
  }, [address]);

  async function loadWallet() {
    const agentAddr = agents[selectedAgentIdx]?.address;
    if (!agentAddr) {
      setWalletData(null);
      setHasWallet(false);
      return;
    }

    setLoading(true);
    try {
      const result = await getWallet(address!, agentAddr);
      let payload: any = null;
      if (result === null || result === undefined) {
        payload = null;
      } else if (typeof result === "object") {
        if (result.value && result.value.value) payload = result.value.value;
        else if (result.value) payload = result.value;
        else payload = result;
      } else {
        payload = null;
      }

      if (payload && (payload.balance !== undefined || payload["daily-limit"] !== undefined || payload["per-call-limit"] !== undefined)) {
        const norm = (x: any) => {
          if (x === undefined || x === null) return "0";
          if (typeof x === "object" && "value" in x) return String(x.value);
          return String(x);
        };

        const balance = parseInt(norm(payload.balance || "0"), 10);
        const dailyLimit = parseInt(norm(payload["daily-limit"] || "0"), 10);
        const perCall = parseInt(norm(payload["per-call-limit"] || "0"), 10);
        const spentToday = parseInt(norm(payload["spent-today"] || "0"), 10);
        const activeFlagRaw = payload.active ?? true;
        const activeFlag = (typeof activeFlagRaw === "object" && "value" in activeFlagRaw) ? !!activeFlagRaw.value : !!activeFlagRaw;

        setWalletData({
          balance,
          dailyLimit,
          perCallLimit: perCall,
          spentToday,
          active: activeFlag,
        });
        setHasWallet(true);
      } else {
        setWalletData(null);
        setHasWallet(false);
      }
    } catch (err) {
      console.error("[Dashboard] Error loading wallet:", err);
      setWalletData(null);
      setHasWallet(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!address || agents.length === 0) return;
    loadWallet();
    loadSpendHistory();
  }, [address, selectedAgentIdx, agents]);

  async function loadSpendHistory() {
    const agentAddr = agents[selectedAgentIdx]?.address;
    if (!address || !agentAddr) return;
    try {
      const nonceResult = await getSpendNonce(address, agentAddr);
      const nonce = nonceResult?.value ? parseInt(nonceResult.value) : 0;
      if (nonce === 0) return;

      const entries: SpendEntry[] = [];
      const start = Math.max(0, nonce - 10);

      for (let i = start; i < nonce; i++) {
        try {
          const record = await getSpendRecord(address, agentAddr, i);
          if (record && record.value && record.value.value) {
            const v = record.value.value;
            entries.push({
              nonce: i,
              service: v.service.value,
              amount: parseInt(v.amount.value),
              block: parseInt(v.block.value),
              agent: agentAddr,
            });
          }
        } catch { }
      }
      setSpendHistory(entries);
    } catch (err) {
      console.error("[Dashboard] Error loading spend history:", err);
    }
  }

  function toggleActive() {
    if (!wallet) return;
    const agentAddr = agents[selectedAgentIdx]?.address;
    if (!agentAddr) return;
    const newState = !wallet.active;
    setTxStatus(newState ? "Activating wallet..." : "Deactivating wallet...");

    setActive(agentAddr, newState, () => {
      setTxStatus("Transaction submitted! Waiting for confirmation...");
      let attempts = 0;
      const poll = setInterval(async () => {
          attempts++;
          try {
              const result = await getWallet(address!, agentAddr);
              const payload = result?.value?.value || result?.value || result;
              const activeRaw = payload?.active;
              const active = typeof activeRaw === "object" ? !!activeRaw.value : !!activeRaw;
              if (active === newState || attempts >= 24) {
                  clearInterval(poll);
                  setTxStatus(active === newState ? "Wallet updated!" : "Timed out — check manually.");
                  setTimeout(() => setTxStatus(""), newState === active ? 3000 : 5000);
                  loadWallet(); // refresh UI
              }
          } catch {}
      }, 5000);
    });
  }

  return (
    <div className="min-h-screen w-full bg-[#030303] text-white pt-24 pb-20 px-6 font-sans relative overflow-x-hidden">
      {/* Subtle Monochrome Auroras */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-white opacity-[0.02] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[20%] right-[-10%] w-[600px] h-[600px] bg-white opacity-[0.02] blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10 animate-fade-in">
        
        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-white">
            <div className="relative w-12 h-12 flex items-center justify-center mb-4">
              <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
              <div className="absolute inset-0 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <Cpu className="w-4 h-4 text-white/80" />
            </div>
            <p className="text-xs font-mono uppercase tracking-widest text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">Syncing with Stacks</p>
          </div>
        ) : !hasWallet ? (
          /* No Wallet State */
          <div className="max-w-lg mx-auto mt-16 text-center p-10 rounded-[2.5rem] bg-white/[0.02] border border-white/[0.05] backdrop-blur-xl shadow-2xl">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-8 shadow-inner">
              <Wallet className="w-8 h-8 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-medium tracking-tight text-white mb-3">No Agent Wallet Found</h2>
            <p className="text-white/50 mb-8 font-light leading-relaxed">
              Create your agent wallet to start managing autonomous AI spending
              with on-chain rules.
            </p>
            <button
              onClick={() => navigate("/setup")}
              className="px-8 py-3.5 bg-white text-black text-sm font-semibold rounded-full transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-105"
            >
              Create Wallet
            </button>
          </div>
        ) : (
          /* Main Dashboard */
          <>
            {/* ─── Header & Kill Switch ──────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${wallet?.active ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"}`} />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-white/50">
                    System Status: <span className={wallet?.active ? "text-cyan-400" : "text-red-400"}>{wallet?.active ? "Online" : "Frozen"}</span>
                  </span>
                </div>
                <h1 className="text-3xl md:text-4xl font-medium text-white tracking-tight">Agent Dashboard</h1>
              </div>

              {/* Minimal Kill Switch */}
              <button
                onClick={toggleActive}
                className="group flex items-center gap-2 px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 border bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.1] text-white/80 hover:text-white"
              >
                {wallet?.active ? (
                  <>
                    <ShieldOff className="w-4 h-4 text-red-400 transition-transform group-hover:scale-110" />
                    Kill Switch
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-cyan-400 transition-transform group-hover:scale-110" />
                    Reactivate Agent
                  </>
                )}
              </button>
            </div>

            {/* ─── Status & Notifications ────────────────────────────── */}
            {txStatus && (
              <div className="flex items-center gap-3 p-4 mb-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md">
                {txStatus !== "Wallet updated!" ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                )}
                <span className="text-sm text-cyan-400 font-light drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">{txStatus}</span>
              </div>
            )}

            {!wallet?.active && (
              <div className="flex items-center gap-3 p-4 mb-8 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="text-sm text-white/80 font-light tracking-wide">
                  Wallet is strictly deactivated. The smart contract will block all agent payments.
                </span>
              </div>
            )}

            {/* ─── Agent Selector ─────────────────── */}
            {agents.length > 0 && (
              <div className="mb-8 max-w-sm relative z-40">
                <label className="block text-[10px] font-mono text-cyan-400/80 mb-2 uppercase tracking-widest">Active Node</label>
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
                      <p className="text-[10px] font-mono text-cyan-400/60 truncate max-w-[200px]">{agents[selectedAgentIdx]?.address || "—"}</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-cyan-400/60 transition-transform duration-300 ${agentDropdownOpen ? "rotate-180" : ""}`} />
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

            {/* ─── Stat Cards (ALL NUMBERS GLOWING CYAN) ─── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Total Escrow Balance"
                value={`${((wallet?.balance || 0) / 1_000_000).toFixed(2)} STX`}
                icon={<Wallet className="w-4 h-4" />}
              />
              <StatCard
                label="Spent Today"
                value={`${((wallet?.spentToday || 0) / 1_000_000).toFixed(2)} STX`}
                icon={<ArrowUpRight className="w-4 h-4" />}
              />
              <StatCard
                label="Hard Daily Limit"
                value={`${((wallet?.dailyLimit || 0) / 1_000_000).toFixed(2)} STX`}
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <StatCard
                label="Max Per-Call Limit"
                value={`${((wallet?.perCallLimit || 0) / 1_000_000).toFixed(2)} STX`}
                icon={<ArrowDownRight className="w-4 h-4" />}
              />
            </div>

            {/* ─── Daily Usage Gauge (All Cyan) ─── */}
            <div className="p-6 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] mb-6 backdrop-blur-sm relative overflow-hidden">
              <div className="flex items-end justify-between mb-4 relative z-10">
                <div>
                  <h3 className="text-sm font-medium text-white/90">Daily Budget Utilization</h3>
                  <p className="text-xs text-white/40 font-light mt-1">Resets based on block height (~24h)</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-medium tracking-tight text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
                    {((wallet?.spentToday || 0) / 1_000_000).toFixed(2)} <span className="text-sm opacity-80 text-cyan-400/80">/ {((wallet?.dailyLimit || 0) / 1_000_000).toFixed(2)} STX</span>
                  </span>
                </div>
              </div>
              
              <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden relative z-10 border border-white/[0.02]">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]"
                  style={{ width: `${Math.min((wallet?.dailyLimit || 0) > 0 ? ((wallet?.spentToday || 0) / (wallet?.dailyLimit || 1)) * 100 : 0, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* ─── Charts & Data Panel ───────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              
              {/* Spend History Terminal */}
              <div className="lg:col-span-2 p-6 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/[0.05] border border-cyan-400/20">
                      <BarChart3 className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-white/90">Transaction History</h3>
                      <p className="text-xs text-white/40 font-light">Last <span className="text-cyan-400">{spendHistory.length}</span> successful agent calls</p>
                    </div>
                  </div>
                </div>

                {spendHistory.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center min-h-[160px] text-cyan-400/40 text-sm font-light border border-dashed border-cyan-400/10 rounded-2xl bg-cyan-500/[0.02]">
                    <ActivitySquare className="w-6 h-6 mb-2 opacity-50" />
                    Awaiting agent telemetry...
                  </div>
                ) : (
                  <div className="flex-1 flex items-end gap-2 min-h-[160px] pt-4">
                    {[...spendHistory].sort((a, b) => a.nonce - b.nonce).map((entry, idx) => {
                        const maxSpend = Math.max(...spendHistory.map(s => s.amount));
                        const heightPx = Math.max((entry.amount / maxSpend) * 140, 8); // ← px not %
                        return (
                            <div key={entry.nonce} className="flex-1 flex flex-col items-center gap-2 group relative">
                                {/* Permanent amount label above bar */}
                                <span className="text-[8px] font-mono text-cyan-400/60 group-hover:text-cyan-400 transition-colors text-center leading-tight">
                                    {(entry.amount / 1_000_000).toFixed(2)}
                                </span>

                                {/* Hover tooltip — keep for full detail */}
                                <div className="absolute bottom-full mb-8 opacity-0 group-hover:opacity-100 transition-opacity bg-cyan-950/80 backdrop-blur-md border border-cyan-400/30 px-3 py-2 rounded-lg text-center z-20 pointer-events-none shadow-[0_0_15px_rgba(34,211,238,0.3)] min-w-[100px]">
                                    <span className="block text-xs font-medium text-cyan-400">{(entry.amount / 1_000_000).toFixed(4)} STX</span>
                                    <span className="block text-[9px] font-mono text-cyan-400/60 truncate w-20 mx-auto mt-1">{entry.service}</span>
                                </div>
                                
                                <div className="w-full relative group-hover:-translate-y-1 transition-transform duration-300">
                                    <div
                                        className="w-full bg-cyan-500/20 rounded-sm border border-cyan-400/20 group-hover:bg-cyan-400/80 group-hover:shadow-[0_0_10px_rgba(34,211,238,0.6)] transition-all"
                                        style={{ height: `${heightPx}px` }}
                                    />
                                </div>
                                
                                <span className="text-[9px] font-mono text-cyan-400/30 group-hover:text-cyan-400 transition-colors">#{entry.nonce}</span>
                            </div>
                        );
                    })}
                </div>
                )}

                {spendHistory.length > 0 && (
                  <div className="mt-8 pt-4 border-t border-white/[0.05] flex items-center justify-between text-xs font-mono text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                    <span>VOL: {(spendHistory.reduce((sum, s) => sum + s.amount, 0) / 1_000_000).toFixed(4)} STX</span>
                    <span>TXS: {spendHistory.length}</span>
                  </div>
                )}
              </div>

              {/* Agent Reputation Dashboard */}
              <div className="p-6 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm relative overflow-hidden flex flex-col">
                <div className="flex items-center gap-3 mb-8 relative z-10">
                  <div className="p-2 rounded-lg bg-cyan-500/[0.05] border border-cyan-400/20">
                    <Star className="w-4 h-4 text-cyan-400" />
                  </div>
                  <h3 className="text-sm font-medium text-white/90">Agent Analytics</h3>
                </div>

                <div className="text-center py-6 mb-4 relative z-10">
                    <div className="text-5xl font-light text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.5)] tracking-tight mb-2">
                        {spendHistory.length > 0
                            ? (spendHistory.reduce((s, e) => s + e.amount, 0) / 1_000_000).toFixed(2)
                            : "0.00"
                        }
                    </div>
                    <p className="text-xs font-mono tracking-widest uppercase text-white/40">Total STX Spent</p>
                </div>

                <div className="space-y-4 mt-auto relative z-10">
                  <div className="flex items-center justify-between text-sm py-2 border-b border-white/[0.03]">
                    <span className="text-white/40 font-light">Total Calls</span>
                    <span className="font-medium text-cyan-400 font-mono drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">{spendHistory.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-2 border-b border-white/[0.03]">
                    <span className="text-white/40 font-light">Avg. Cost</span>
                    <span className="font-medium text-cyan-400 font-mono drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                      {spendHistory.length > 0 ? (spendHistory.reduce((sum, s) => sum + s.amount, 0) / spendHistory.length / 1_000_000).toFixed(4) : "0"} STX
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-2">
                    <span className="text-white/40 font-light">Network Trust</span>
                    <span className="font-medium text-cyan-400 flex items-center gap-1.5 font-mono text-xs drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {spendHistory.length >= 5 ? "ESTABLISHED" : spendHistory.length >= 1 ? "BUILDING" : "NEW"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Infrastructure Config ───────────────── */}
            <AgentConfigSection address={address!} wallet={wallet} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── HELPER COMPONENTS ──────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.03] transition-colors relative overflow-hidden group">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-6 border bg-cyan-500/[0.05] border-cyan-400/20 text-cyan-400">
        {icon}
      </div>
      {/* Numbers are ALWAYS glowing Cyan */}
      <p className="text-2xl md:text-3xl font-medium tracking-tight mb-1 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
        {value}
      </p>
      <p className="text-[11px] font-mono uppercase tracking-widest text-white/40">{label}</p>
    </div>
  );
}

function AgentConfigSection({ address, wallet }: { address: string; wallet: WalletData | null }) {
  const agents = getSavedAgents(address);

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm">
      <div className="flex items-center justify-between mb-8 border-b border-white/[0.05] pb-4">
        <div className="flex items-center gap-3">
          <Network className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-medium text-white/90">Authorized Network Nodes</h3>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest px-3 py-1 bg-cyan-500/[0.05] rounded-full border border-cyan-400/20 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
          Capacity: {agents.length || 1} / 5
        </span>
      </div>

      <div className="space-y-3 mb-8">
        {agents.length > 0 ? (
          agents.map((agent, i) => (
            <div key={agent.address} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-white/[0.01] border border-white/[0.03] hover:border-cyan-400/20 transition-colors gap-4 sm:gap-0">
              <div className="flex items-center gap-4">
                <span className="w-8 h-8 rounded-lg bg-cyan-500/[0.05] border border-cyan-400/20 flex items-center justify-center text-[11px] font-mono text-cyan-400">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="text-sm font-medium text-white/90">{agent.label}</p>
                  <p className="text-[11px] font-mono text-white/40 truncate max-w-[200px] md:max-w-md">{agent.address}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-400/20 bg-cyan-500/[0.05] w-fit">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">Deployed</span>
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.03] text-center">
            <p className="text-sm text-cyan-400/50 font-light">No agents registered on this machine.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.03] flex items-center justify-between">
          <span className="text-xs text-white/40 font-light">Smart Contract Status</span>
          <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border ${
            wallet?.active ? "bg-cyan-500/10 border-cyan-400/20 text-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.2)]" : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}>
            {wallet?.active ? "Active" : "Halted"}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.03] flex items-center justify-between">
          <span className="text-xs text-white/40 font-light">Kova Protocol Fee</span>
          <span className="text-[11px] font-mono text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">2.00% / TX</span>
        </div>
      </div>
    </div>
  );
}