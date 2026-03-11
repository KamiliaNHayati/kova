import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { getWallet, getSpentToday, setActive, getSpendNonce, getSpendRecord } from "../lib/contracts";
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
} from "lucide-react";

interface WalletData {
  balance: number;
  agent: string;
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
}

export default function Dashboard() {
  const { address } = useWallet();
  const navigate = useNavigate();
  const [wallet, setWalletData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
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
    loadWallet();
    loadSpendHistory();
  }, [address]);

  async function loadWallet() {
    console.log("[Dashboard] Loading wallet for address:", address);
    try {
      const result = await getWallet(address!);

      // v2 contract returns: { active, balance, daily-limit, last-reset-block, per-call-limit, spent-today }
      // Note: agent is NOT in the wallet tuple — it's managed separately
      const v = result?.value?.value;
      if (v && v.balance && v["daily-limit"] && v["per-call-limit"]) {
        // Get agent address from saved agents in localStorage
        const savedAgentsList = getSavedAgents(address!);
        const agentAddr = savedAgentsList.length > 0 ? savedAgentsList[0].address : "—";

        setWalletData({
          balance: parseInt(v.balance.value),
          agent: agentAddr,
          dailyLimit: parseInt(v["daily-limit"].value),
          perCallLimit: parseInt(v["per-call-limit"].value),
          spentToday: parseInt(v["spent-today"]?.value || "0"),
          active: v.active?.value ?? true,
        });
        setHasWallet(true);
      } else {
        setHasWallet(false);
      }
    } catch (err) {
      console.error("[Dashboard] Error loading wallet:", err);
      setHasWallet(false);
    }
    setLoading(false);
  }

  async function loadSpendHistory() {
    if (!address) return;
    try {
      const nonceResult = await getSpendNonce(address);
      const nonce = nonceResult?.value ? parseInt(nonceResult.value) : 0;
      if (nonce === 0) return;

      const entries: SpendEntry[] = [];
      const start = Math.max(0, nonce - 10);

      for (let i = start; i < nonce; i++) {
        try {
          const record = await getSpendRecord(address, i);
          if (record && record.value && record.value.value) {
            const v = record.value.value;
            entries.push({
              nonce: i,
              service: v.service.value,
              amount: parseInt(v.amount.value),
              block: parseInt(v.block.value),
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
    const newState = !wallet.active;
    setTxStatus(newState ? "Activating wallet..." : "Deactivating wallet...");

    setActive(newState, () => {
      setTxStatus("Transaction submitted! Waiting for confirmation...");

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await loadWallet();

        if (attempts >= 24) {
          clearInterval(poll);
          setTxStatus("Refresh the page if state hasn't updated yet.");
          setTimeout(() => setTxStatus(""), 5000);
        }
      }, 5000);

      const checkDone = setInterval(() => {
        if (wallet && wallet.active !== newState) {
        } else {
          clearInterval(poll);
          clearInterval(checkDone);
          setTxStatus("Wallet updated!");
          setTimeout(() => setTxStatus(""), 3000);
        }
      }, 1000);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasWallet) {
    return (
      <div className="max-w-lg mx-auto mt-24 text-center">
        <Wallet className="w-16 h-16 text-text-muted mx-auto mb-6" />
        <h2 className="text-2xl font-bold mb-3">No Agent Wallet Found</h2>
        <p className="text-text-muted mb-8">
          Create your agent wallet to start managing autonomous AI spending
          with on-chain rules.
        </p>
        <button
          onClick={() => navigate("/setup")}
          className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
        >
          Create Wallet
        </button>
      </div>
    );
  }

  const dailyUsagePercent = wallet
    ? Math.min((wallet.spentToday / wallet.dailyLimit) * 100, 100)
    : 0;

  const stxBalance = wallet ? (wallet.balance / 1_000_000).toFixed(2) : "0";
  const stxDailyLimit = wallet
    ? (wallet.dailyLimit / 1_000_000).toFixed(2)
    : "0";
  const stxSpentToday = wallet
    ? (wallet.spentToday / 1_000_000).toFixed(2)
    : "0";
  const stxPerCall = wallet
    ? (wallet.perCallLimit / 1_000_000).toFixed(2)
    : "0";

  const maxSpend = spendHistory.length > 0 ? Math.max(...spendHistory.map(s => s.amount)) : 1;
  const totalSpent = spendHistory.reduce((sum, s) => sum + s.amount, 0);
  const successRate = spendHistory.length > 0 ? 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-text-muted text-sm mt-1">
            Monitor your agent wallet in real time
          </p>
        </div>
        <button
          onClick={toggleActive}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${wallet?.active
            ? "bg-danger/10 text-danger hover:bg-danger/20"
            : "bg-success/10 text-success hover:bg-success/20"
            }`}
        >
          {wallet?.active ? (
            <>
              <ShieldOff className="w-4 h-4" />
              Kill Switch
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Reactivate
            </>
          )}
        </button>
      </div>

      {/* Agent Selector */}
      {agents.length > 0 && (
        <div className="mb-6 max-w-sm relative">
          <label className="block text-xs text-text-muted mb-1.5 uppercase">Active Agent</label>
          <button
            onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-3 bg-surface border border-border rounded-xl hover:border-accent/40 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-warning" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">{agents[selectedAgentIdx]?.label || "Agent"}</p>
                <p className="text-[10px] font-mono text-text-muted truncate max-w-[220px]">{agents[selectedAgentIdx]?.address || "—"}</p>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${agentDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {agentDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl overflow-hidden shadow-xl z-50">
              {agents.map((agent, idx) => (
                <button
                  key={agent.address}
                  onClick={() => { setSelectedAgentIdx(idx); setAgentDropdownOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/5 transition-colors text-left ${idx === selectedAgentIdx ? "bg-accent/10 border-l-2 border-accent" : ""}`}
                >
                  <Bot className="w-4 h-4 text-warning flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">{agent.label}</p>
                    <p className="text-[10px] font-mono text-text-muted truncate max-w-[220px]">{agent.address}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}      {/* Transaction status */}
      {txStatus && (
        <div className="flex items-center gap-3 p-4 mb-4 rounded-lg bg-accent/10 border border-accent/20">
          {txStatus !== "Wallet updated!" ? (
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-accent animate-fade-in-scale" />
          )}
          <span className="text-sm text-accent font-medium">{txStatus}</span>
        </div>
      )}

      {/* Status banner */}
      {!wallet?.active && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-danger/10 border border-danger/20">
          <AlertTriangle className="w-5 h-5 text-danger" />
          <span className="text-sm text-danger font-medium">
            Wallet is deactivated. Agent cannot make any payments.
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Balance"
          value={`${stxBalance} STX`}
          icon={<Wallet className="w-5 h-5" />}
        />
        <StatCard
          label="Spent Today"
          value={`${stxSpentToday} STX`}
          icon={<ArrowUpRight className="w-5 h-5" />}
          accent={dailyUsagePercent > 80 ? "warning" : undefined}
        />
        <StatCard
          label="Daily Limit"
          value={`${stxDailyLimit} STX`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          label="Per-Call Limit"
          value={`${stxPerCall} STX`}
          icon={<ArrowDownRight className="w-5 h-5" />}
        />
      </div>

      {/* Daily usage bar */}
      <div className="p-6 rounded-xl bg-surface border border-border mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Daily Budget Usage</span>
          <span className="text-sm text-text-muted">
            {stxSpentToday} / {stxDailyLimit} STX
          </span>
        </div>
        <div className="h-3 bg-surface-2 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${dailyUsagePercent > 80 ? "bg-warning" : "bg-accent"
              }`}
            style={{ width: `${dailyUsagePercent}%` }}
          />
        </div>
      </div>

      {/* Spend History Chart + Agent Reputation — side by side */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Spend chart */}
        <div className="md:col-span-2 p-6 rounded-xl bg-surface border border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-medium">Spend History</h3>
            </div>
            <span className="text-xs text-text-muted">
              Last {spendHistory.length} transactions
            </span>
          </div>

          {spendHistory.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-text-muted text-sm">
              No transactions yet. Run the agent to see data here!
            </div>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {[...spendHistory].sort((a, b) => a.amount - b.amount).map((entry, idx) => {
                const heightPercent = (entry.amount / maxSpend) * 100;
                const amountSTX = (entry.amount / 1_000_000).toFixed(4);
                return (
                  <div
                    key={entry.nonce}
                    className="flex-1 flex flex-col items-center gap-1 group"
                  >
                    <span className="text-[9px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      {amountSTX}
                    </span>
                    <div
                      className="w-full bg-gradient-to-t from-accent to-accent-hover rounded-t transition-all duration-300 group-hover:from-accent-hover group-hover:to-teal min-h-[4px]"
                      style={{ height: `${Math.max(heightPercent, 5)}%` }}
                      title={`#${idx + 1}: ${amountSTX} STX → ${entry.service.slice(0, 8)}...`}
                    />
                    <span className="text-[8px] text-text-muted">{idx + 1}</span>
                  </div>
                );
              })}
            </div>
          )}

          {spendHistory.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
              <span>Total: {(totalSpent / 1_000_000).toFixed(4)} STX</span>
              <span>{spendHistory.length} transactions</span>
            </div>
          )}
        </div>

        {/* Agent Reputation */}
        <div className="p-6 rounded-xl bg-surface border border-border">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-medium">Agent Reputation</h3>
          </div>

          <div className="text-center py-4">
            <div className="text-4xl font-bold gradient-text mb-1">
              {successRate}%
            </div>
            <p className="text-xs text-text-muted">Success Rate</p>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Total Spends</span>
              <span className="font-medium">{spendHistory.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Total Volume</span>
              <span className="font-medium">{(totalSpent / 1_000_000).toFixed(4)} STX</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Avg per Tx</span>
              <span className="font-medium">
                {spendHistory.length > 0
                  ? (totalSpent / spendHistory.length / 1_000_000).toFixed(4)
                  : "0"} STX
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Trust Level</span>
              <span className="font-medium text-success flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {spendHistory.length >= 5 ? "Established" : spendHistory.length >= 1 ? "Building" : "New"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Agent info */}
      <AgentConfigSection address={address!} wallet={wallet} />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "warning" | "danger";
}) {
  const accentColor =
    accent === "warning"
      ? "text-warning"
      : accent === "danger"
        ? "text-danger"
        : "text-accent";

  return (
    <div className="p-5 rounded-xl bg-surface border border-border">
      <div className={`mb-3 ${accentColor}`}>{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-text-muted mt-1">{label}</p>
    </div>
  );
}

function AgentConfigSection({ address, wallet }: { address: string; wallet: WalletData | null }) {
  const agents = getSavedAgents(address);

  return (
    <div className="p-6 rounded-xl bg-surface border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Authorized Agents</h3>
        <span className="text-xs text-text-muted">{agents.length || 1} / 5</span>
      </div>

      <div className="space-y-2 mb-4">
        {agents.length > 0 ? (
          agents.map((agent, i) => (
            <div key={agent.address} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-black/20 border border-border/30">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-md bg-warning/20 flex items-center justify-center text-[10px] font-bold text-warning">
                  {i + 1}
                </span>
                <div>
                  <p className="text-xs font-medium text-white">{agent.label}</p>
                  <p className="text-[10px] font-mono text-text-muted truncate max-w-[220px]">{agent.address}</p>
                </div>
              </div>
              <span className="text-[10px] font-medium text-success">Active</span>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-black/20 border border-border/30">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-md bg-warning/20 flex items-center justify-center text-[10px] font-bold text-warning">1</span>
              <p className="text-[10px] font-mono text-text-muted truncate max-w-[280px]">{wallet?.agent}</p>
            </div>
            <span className="text-[10px] font-medium text-success">Active</span>
          </div>
        )}
      </div>

      <div className="space-y-2 pt-3 border-t border-border/50">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Status</span>
          <span className={`text-xs font-medium ${wallet?.active ? "text-success" : "text-danger"}`}>
            {wallet?.active ? "Active" : "Deactivated"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Protocol Fee</span>
          <span className="text-xs text-text-muted">2% per transaction</span>
        </div>
      </div>
    </div>
  );
}
