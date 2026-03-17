import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { getSavedAgents, type AgentKeypair } from "../lib/agentKeys";
import { Activity as ActivityIcon, ArrowUpRight, ChevronDown, Bot } from "lucide-react";

interface SpendRecord {
  nonce: number;
  agent: string;
  service: string;
  amount: number;
  block: number;
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
    setOffset(0);
    loadRecords(0);
  }, [address, selectedAgentAddr]);

  async function loadRecords(currentOffset: number) {
    setLoading(true);
    try {
      // Build agent param — pass all known agents for ALL, or specific one
      const agentParam = selectedAgentAddr === "ALL"
          ? agents.map(a => a.address).join(",")
          : selectedAgentAddr;

      const resp = await fetch(
          `http://localhost:4000/api/activity?owner=${address}&agent=${agentParam}&limit=${LIMIT}&offset=${currentOffset}`
        );
      if (resp.ok) {
        const data = await resp.json();
        if (currentOffset === 0) {
            setRecords(data.records || []);
        } else {
            setRecords(prev => [...prev, ...(data.records || [])]);
        }
        setTotalCount(data.totalCount || 0);
      } else {
        if (currentOffset === 0) setRecords([]);
      }
    } catch (err) {
      console.error("[Activity] Error loading records from backend:", err);
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
    if (addr === "ALL") return "All Agents";
    const agent = agents.find(a => a.address === addr);
    return agent ? agent.label : addr.substring(0, 10) + "...";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">Activity</h1>
          <p className="text-text-muted text-sm">
            On-chain spending history for your agent wallet
          </p>
        </div>
        
        {/* Agent Filter Dropdown */}
        {agents.length > 0 && (
          <div className="relative w-64">
            <button
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-surface border border-border rounded-xl hover:border-accent/40 transition-all text-sm shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-warning" />
                <span className="font-medium text-white">{getAgentLabel(selectedAgentAddr)}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${agentDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {agentDropdownOpen && (
              <div className="absolute top-full right-0 mt-1 bg-surface border border-border rounded-xl overflow-hidden shadow-xl z-50">
                <button
                  onClick={() => { setSelectedAgentAddr("ALL"); setAgentDropdownOpen(false); }}
                  className={`w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/5 transition-colors text-left text-sm ${"ALL" === selectedAgentAddr ? "bg-accent/10 border-l-2 border-accent text-white font-medium" : "text-text-muted"}`}
                >
                  <Bot className="w-4 h-4 text-warning" /> All Agents
                </button>
                {agents.map((agent) => (
                  <button
                    key={agent.address}
                    onClick={() => { setSelectedAgentAddr(agent.address); setAgentDropdownOpen(false); }}
                    className={`w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/5 transition-colors text-left text-sm ${agent.address === selectedAgentAddr ? "bg-accent/10 border-l-2 border-accent text-white font-medium" : "text-text-muted"}`}
                  >
                    <Bot className="w-4 h-4 text-warning flex-shrink-0" />
                    <div className="truncate">{agent.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <ActivityIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No spending activity yet.</p>
          <p className="text-xs mt-1">
            Transactions will appear here when your agent makes payments.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-text-muted font-medium">
            <div className="col-span-1">#</div>
            <div className="col-span-3">Service</div>
            <div className="col-span-3">Agent</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-2 text-right">Block</div>
            <div className="col-span-1" />
          </div>

          {records.map((r, idx) => (
            <div
              key={r.nonce}
              className="grid grid-cols-12 gap-4 items-center px-4 py-3 rounded-lg bg-surface border border-border hover:border-border-hover transition-colors"
            >
              <div className="col-span-1 text-sm text-text-muted font-mono">
                {idx + 1}
              </div>
              <div className="col-span-3 text-sm font-mono truncate">
                {r.service}
              </div>
              <div className="col-span-3 text-sm font-mono truncate text-text-muted">
                {r.agent}
              </div>
              <div className="col-span-2 text-right">
                <span className="text-sm font-medium">
                  {(r.amount / 1_000_000).toFixed(4)}
                </span>
                <span className="text-xs text-text-muted ml-1">STX</span>
              </div>
              <div className="col-span-2 text-right text-sm text-text-muted font-mono">
                #{r.block}
              </div>
              <div className="col-span-1 text-right">
                <ArrowUpRight className="w-4 h-4 text-accent inline" />
              </div>
            </div>
          ))}
          
          {records.length > 0 && records.length < totalCount && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-6 py-2 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 transition-colors text-sm font-medium text-text disabled:opacity-50"
              >
                {loading ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
