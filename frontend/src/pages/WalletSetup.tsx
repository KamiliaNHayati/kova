import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import {
  getWallet,
  getBalance,
  createWallet,
  setLimits,
  deposit,
  withdraw,
  removeAgent,
  registerOperator,
  getOperator,
} from "../lib/contracts";
import {
  createAgentFromBackend,
  getSavedAgents,
  saveAgent,
  removeAgentLocal,
  type AgentKeypair,
} from "../lib/agentKeys";
import {
  Settings,
  Plus,
  Wallet,
  Info,
  CheckCircle2,
  Trash2,
  Users,
  ArrowUpCircle,
  ArrowDownCircle,
  Copy,
  Key,
  Zap,
  Bot,
  ChevronDown,
  Shield,
  ShieldCheck,
  Cpu
} from "lucide-react";

// Validation helpers
const MAX_STX_AMOUNT = 1000000;
const isValidAmount = (amt: string): { valid: boolean; error?: string } => {
  const num = parseFloat(amt);
  if (isNaN(num) || num <= 0) return { valid: false, error: "Amount must be positive" };
  if (num > MAX_STX_AMOUNT) return { valid: false, error: `Amount exceeds max (${MAX_STX_AMOUNT} STX)` };
  return { valid: true };
};

export default function WalletSetup() {
  const { address } = useWallet();
  const [hasWallet, setHasWallet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [walletData, setWalletData] = useState<any>(null);
  const [escrowBalance, setEscrowBalance] = useState(0);
  const [savedAgents, setSavedAgents] = useState<AgentKeypair[]>([]);
  const [selectedAgentIdx, setSelectedAgentIdx] = useState(0);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [depositAmt, setDepositAmt] = useState("");
  const [depositError, setDepositError] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawError, setWithdrawError] = useState("");

  const [agentStatuses, setAgentStatuses] = useState<Record<string, { lastSeen: number, onChainActive: boolean, running?: boolean }>>({});

  async function pushAudit(action: string, details: any) {
    if (!address) return;
    try {
      await fetch("http://localhost:4000/api/audit-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, owner: address, ...details })
      });
    } catch {}
  }

  // Create wallet form
  const [generatedAgent, setGeneratedAgent] = useState<AgentKeypair | null>(null);
  const [dailyLimit, setDailyLimit] = useState("10");
  const [dailyLimitError, setDailyLimitError] = useState("");
  const [perCallLimit, setPerCallLimit] = useState("1");
  const [perCallError, setPerCallError] = useState("");

  // Update limits
  const [newDailyLimit, setNewDailyLimit] = useState("");
  const [newDailyError, setNewDailyError] = useState("");
  const [newPerCallLimit, setNewPerCallLimit] = useState("");
  const [newPerCallError, setNewPerCallError] = useState("");

  // Copy states
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Operator state
  const [operatorRegistered, setOperatorRegistered] = useState(false);
  const [operatorAddress, setOperatorAddress] = useState<string | null>(null);
  const [backendOperator, setBackendOperator] = useState<string | null>(null);

  const [txStatus, setTxStatus] = useState("");
  const [txError, setTxError] = useState("");

  useEffect(() => {
    if (!address) return;
    setSavedAgents(getSavedAgents(address));
    fetchOperatorStatus();
  }, [address]);

  useEffect(() => {
    if (!address) return;
    checkWallet();
  }, [address, selectedAgentIdx]);

  useEffect(() => {
    let active = true;
    async function fetchStatuses() {
      if (!address || savedAgents.length === 0) return;
      const statuses: Record<string, { lastSeen: number, onChainActive: boolean, running?: boolean }> = {};
      for (const agent of savedAgents) {
        try {
          const resp = await fetch(`http://localhost:4000/api/agent-status?owner=${address}&agent=${agent.address}`);
          if (resp.ok && active) {
            statuses[agent.address] = await resp.json();
          }
        } catch {}
      }
      if (active && Object.keys(statuses).length > 0) {
        setAgentStatuses(statuses);
      }
    }
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [address, savedAgents]);

  useEffect(() => {
    if (!loading && savedAgents.length === 0 && !generatedAgent) {
      createAgentFromBackend("Agent 1")
        .then((agent) => setGeneratedAgent(agent))
        .catch(() => setTxError("Backend not running. Start agent.js first."));
    }
  }, [loading, savedAgents.length, generatedAgent]);

  async function checkWallet() {
    try {
      const agents = getSavedAgents(address!);
      if (agents.length === 0) {
        setHasWallet(false);
        setWalletData(null);
        setLoading(false);
        return;
      }
      const agentAddr = agents[selectedAgentIdx]?.address || agents[0].address;
      const result = await getWallet(address!, agentAddr);
      if (result && result.value !== null && result.value !== undefined) {
        setHasWallet(true);
        setWalletData(result.value);
        const bal = await getBalance(address!, agentAddr);
        setEscrowBalance(bal?.value || 0);
      } else {
        setHasWallet(false);
        setWalletData(null);
      }
    } catch {
      setHasWallet(false);
      setWalletData(null);
    }
    setLoading(false);
  }

  async function fetchOperatorStatus() {
    if (!address) return;
    try {
      const opResult = await getOperator(address);
      if (opResult && opResult.value) {
        setOperatorRegistered(true);
        setOperatorAddress(opResult.value?.value?.operator?.value || null);
      } else {
        setOperatorRegistered(false);
        setOperatorAddress(null);
      }
    } catch {
      setOperatorRegistered(false);
    }

    try {
      const resp = await fetch("http://localhost:4000/api/operator-info");
      const info = await resp.json();
      setBackendOperator(info.operatorAddress || null);
    } catch {
      setBackendOperator(null);
    }
  }

  function handleRegisterOperator() {
    if (!backendOperator) {
      setTxError("Backend not running. Start agent.js first to get operator address.");
      return;
    }
    setTxError("");
    setTxStatus("Confirm operator registration in your wallet...");
    registerOperator(backendOperator, (data: any) => {
      if (data && data.error) {
        setTxError(`Register operator failed: ${data.error}`);
        setTxStatus("");
      } else {
        setTxStatus("Operator registered! Your agent backend can now sign payments.");
        setOperatorRegistered(true);
        setOperatorAddress(backendOperator);
        pushAudit("REGISTER_OPERATOR", { backendOperator });
        setTimeout(() => fetchOperatorStatus(), 5000);
      }
    });
  }

  function copyToClipboard(text: string, fieldId: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function handleDeposit() {
    setDepositError("");
    setTxError("");
    const agentAddr = savedAgents[selectedAgentIdx]?.address;
    if (!agentAddr) { setTxError("No agent selected"); return; }
    if (!address) { setTxError("Wallet not connected"); return; }
    const v = isValidAmount(depositAmt);
    if (!v.valid) { setDepositError(v.error!); return; }
    const amt = Math.floor(parseFloat(depositAmt) * 1_000_000);
    setTxStatus("Confirm deposit in your wallet...");
    deposit(agentAddr, amt, address, (data) => {
      if (data && data.error) { setTxError(`Deposit failed: ${data.error}`); setTxStatus(""); }
      else {
        setTxStatus("Deposited!"); setDepositAmt("");
        pushAudit("DEPOSIT", { agentAddr, amount: amt });
        setTimeout(() => checkWallet(), 3000);
      }
    });
  }

  function handleWithdraw() {
    setWithdrawError("");
    setTxError("");
    const agentAddr = savedAgents[selectedAgentIdx]?.address;
    if (!agentAddr) { setTxError("No agent selected"); return; }
    const v = isValidAmount(withdrawAmt);
    if (!v.valid) { setWithdrawError(v.error!); return; }
    const amt = Math.floor(parseFloat(withdrawAmt) * 1_000_000);
    if (amt > escrowBalance) { setWithdrawError("Exceeds escrow balance"); return; }
    
    const agentState = agentStatuses[agentAddr];
    if (agentState && agentState.running) {
        alert("⚠️ WARNING: This agent is actively paying for a service right now.\n\nWithdrawing your balance mid-flight may cause the transaction to fail and your data won't arrive. Please wait a few seconds before withdrawing.");
        return;
    }

    setTxStatus("Confirm withdrawal in your wallet...");
    withdraw(agentAddr, amt, (data) => {
      if (data && data.error) { setTxError(`Withdraw failed: ${data.error}`); setTxStatus(""); }
      else { 
        setTxStatus("Withdrawn!"); setWithdrawAmt(""); 
        pushAudit("WITHDRAW", { agentAddr, amount: amt });
        setTimeout(() => checkWallet(), 3000); 
        setTimeout(() => checkWallet(), 8000);
        setTimeout(() => checkWallet(), 15000);
      }
    });
  }

  function handleCreate() {
    setDailyLimitError("");
    setPerCallError("");
    setTxError("");

    const targetAgent = generatedAgent || savedAgents[selectedAgentIdx];
    if (!targetAgent) {
      setTxError("No agent found. Refresh the page.");
      return;
    }

    const dailyValidation = isValidAmount(dailyLimit);
    if (!dailyValidation.valid) { setDailyLimitError(dailyValidation.error!); return; }
    const perCallValidation = isValidAmount(perCallLimit);
    if (!perCallValidation.valid) { setPerCallError(perCallValidation.error!); return; }

    const daily = Math.floor(parseFloat(dailyLimit) * 1_000_000);
    const perCall = Math.floor(parseFloat(perCallLimit) * 1_000_000);
    if (perCall > daily) { setPerCallError("Per-call limit cannot exceed daily limit"); return; }

    setTxStatus("Confirm in your wallet...");
    createWallet(targetAgent.address, daily, perCall, async (data) => {
      if (data && data.error) {
        setTxError(`Transaction failed: ${data.error}`);
        setTxStatus("");
      } else {
        if (generatedAgent) {
          saveAgent(address!, generatedAgent);
          setSavedAgents(getSavedAgents(address!));
        }

        pushAudit("CREATE_WALLET", { agentAddr: targetAgent.address, dailyLimit: daily, perCallLimit: perCall });
        setTxStatus("Wallet creation submitted! Waiting for testnet confirmation... This may take several minutes.");
        setGeneratedAgent(null);
        setTimeout(() => checkWallet(), 5000);
      }
    });
  }

  function handleSetLimits() {
    setNewDailyError("");
    setNewPerCallError("");
    setTxError("");

    const dailyValidation = isValidAmount(newDailyLimit);
    if (!dailyValidation.valid) { setNewDailyError(dailyValidation.error!); return; }
    const perCallValidation = isValidAmount(newPerCallLimit);
    if (!perCallValidation.valid) { setNewPerCallError(perCallValidation.error!); return; }

    const daily = Math.floor(parseFloat(newDailyLimit) * 1_000_000);
    const perCall = Math.floor(parseFloat(newPerCallLimit) * 1_000_000);
    if (perCall > daily) { setNewPerCallError("Per-call limit cannot exceed daily limit"); return; }

    setTxStatus("Confirm in your wallet...");
    const agentAddr = savedAgents[selectedAgentIdx]?.address;
    if (!agentAddr) { setTxError("No agent selected"); return; }
    setLimits(agentAddr, daily, perCall, (data) => {
      if (data && data.error) {
        setTxError(`Update failed: ${data.error}`);
        setTxStatus("");
      } else {
        setTxStatus("Limits updated!");
        pushAudit("SET_LIMITS", { agentAddr, dailyLimit: daily, perCallLimit: perCall });
        setNewDailyLimit("");
        setNewPerCallLimit("");
      }
    });
  }

  async function handleGenerateAgent() {   
    setTxError("");
    if (savedAgents.length >= 5) {
      setTxError("Maximum 5 agents per wallet");
      return;
    }

    setTxStatus("Generating agent from backend...");
    try {
      await fetch("http://localhost:4000/api/active-agent");
      const agent = await createAgentFromBackend(`Agent ${savedAgents.length + 1}`, undefined);

      setTxStatus("Confirm in your wallet...");
      createWallet(agent.address, Math.floor(10 * 1_000_000), Math.floor(1 * 1_000_000), (data) => {
        if (data && data.error) {
          setTxError(`Add agent failed: ${data.error}`);
          setTxStatus("");
        } else {
          saveAgent(address!, agent);
          setSavedAgents(getSavedAgents(address!));
          setTxStatus(`Agent ${agent.address.slice(0, 8)}... added!`);
          setTimeout(() => checkWallet(), 3000);
        }
      });
    } catch (err) {
      setTxError("Backend not running. Start agent.js first.");
      setTxStatus("");
    }
  }

  function handleRemoveAgent(agentAddr: string) {
    setTxError("");
    setTxStatus("Confirm in your wallet...");
    removeAgent(agentAddr, (data) => {
      if (data && data.error) {
        setTxError(`Remove agent failed: ${data.error}`);
        setTxStatus("");
      } else {
        removeAgentLocal(address!, agentAddr);
        setSavedAgents(getSavedAgents(address!));
        setTxStatus("Agent removed!");
        setTimeout(() => checkWallet(), 3000);
      }
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-white">
        <div className="relative w-12 h-12 flex items-center justify-center mb-4">
          <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
          <div className="absolute inset-0 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <Cpu className="w-4 h-4 text-cyan-400" />
        </div>
        <p className="text-xs font-mono uppercase tracking-widest text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">Checking On-Chain State</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto relative z-10 animate-fade-in pb-20">
      
      {/* ─── Header ────────────────────────────────────────────── */}
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white mb-2">Wallet Configuration</h1>
        <p className="text-white/50 font-light">
          {hasWallet
            ? "Manage your escrow balance, spending limits, and authorized operational agents."
            : "Deploy your agent's smart contract wallet to enable autonomous escrow payments."}
        </p>
      </div>

      {/* ─── Status Banners ────────────────────────────────────── */}
      {txStatus && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-2xl bg-cyan-500/[0.05] border border-cyan-400/20 backdrop-blur-md">
          {txStatus.includes("Confirm") || txStatus.includes("Waiting") ? (
            <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          )}
          <span className="text-sm text-cyan-400 font-light drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">{txStatus}</span>
        </div>
      )}

      {txError && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-2xl bg-red-500/[0.05] border border-red-500/20 backdrop-blur-md">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-400 font-light">{txError}</span>
        </div>
      )}

      {/* ─── Create Wallet View ────────────────────────────────── */}
      {!hasWallet ? (
        <div className="max-w-2xl mx-auto mt-10">
          <Card title="Initialize Agent Escrow" icon={<Plus className="w-5 h-5" />}>
            <div className="space-y-6">
              
              {/* Auto-generated agent info */}
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white/90">
                    {savedAgents.length > 0 ? "Pending Agent Wallet" : "Identity Auto-Generated"}
                  </span>
                </div>
                
                {(generatedAgent || savedAgents[selectedAgentIdx]) && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Agent Public Address</label>
                      <div
                        onClick={() => copyToClipboard((generatedAgent || savedAgents[selectedAgentIdx]).address, "create-addr")}
                        className="flex items-center justify-between px-4 py-3 bg-[#0A0A0A] border border-white/10 rounded-xl cursor-pointer hover:border-cyan-400/30 hover:bg-cyan-500/[0.02] transition-all group"
                      >
                        <span className="font-mono text-xs text-white/80 truncate flex-1">{(generatedAgent || savedAgents[selectedAgentIdx]).address}</span>
                        {copiedField === "create-addr" ? (
                          <CheckCircle2 className="w-4 h-4 text-cyan-400 ml-2 flex-shrink-0" />
                        ) : (
                          <Copy className="w-4 h-4 text-white/30 group-hover:text-cyan-400 ml-2 flex-shrink-0 transition-colors" />
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-white/40 flex items-center gap-2">
                      <Key className="w-3 h-3 text-cyan-400" /> Keys are securely managed by Kova Backend via KMS.
                    </p>
                    {savedAgents.length > 0 && (
                      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mt-4">
                        <p className="text-xs text-amber-400/90 font-light leading-relaxed">
                          ⚠️ This identity exists locally, but the on-chain wallet hasn't been confirmed. Wait for testnet confirmation if submitted, otherwise submit now.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="Daily Limit (STX)"
                  placeholder="10.0"
                  value={dailyLimit}
                  onChange={setDailyLimit}
                  type="number"
                  error={dailyLimitError}
                />
                <InputField
                  label="Per-Call Limit (STX)"
                  placeholder="1.0"
                  value={perCallLimit}
                  onChange={setPerCallLimit}
                  type="number"
                  error={perCallError}
                />
              </div>
              <button
                onClick={handleCreate}
                className="w-full mt-2 px-6 py-4 bg-cyan-400 hover:bg-cyan-300 text-black font-semibold rounded-xl transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] hover:scale-[1.02]"
              >
                Deploy Smart Escrow
              </button>
            </div>
          </Card>
        </div>
      ) : (
        /* ─── Main Management View ──────────────────────────────── */
        <div className="space-y-6">
          
          {/* Agent Selector (Dropdown) */}
          {savedAgents.length > 0 && (
            <div className="max-w-sm relative z-40">
              <label className="block text-[10px] font-mono text-cyan-400/80 mb-2 uppercase tracking-widest">Active Node Setup</label>
              <button
                onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.08] rounded-2xl hover:bg-white/[0.04] transition-all shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/[0.05] border border-cyan-400/20 flex items-center justify-center shadow-inner">
                    <Bot className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-white/90">{savedAgents[selectedAgentIdx]?.label || "Agent"}</p>
                    <p className="text-[10px] font-mono text-cyan-400/60 truncate max-w-[200px]">{savedAgents[selectedAgentIdx]?.address || "—"}</p>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-white/40 transition-transform duration-300 ${agentDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              
              {agentDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50 py-1">
                  {savedAgents.map((agent, idx) => (
                    <button
                      key={agent.address}
                      onClick={() => { setSelectedAgentIdx(idx); setAgentDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left ${idx === selectedAgentIdx ? "bg-white/[0.02] relative" : ""}`}
                    >
                      {idx === selectedAgentIdx && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />}
                      <Bot className={`w-4 h-4 flex-shrink-0 ${idx === selectedAgentIdx ? "text-cyan-400" : "text-white/40"}`} />
                      <div>
                        <p className={`text-sm font-medium ${idx === selectedAgentIdx ? "text-white" : "text-white/70"}`}>{agent.label}</p>
                        <p className="text-[10px] font-mono text-white/40 truncate max-w-[220px]">{agent.address}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Top row: Escrow + Spending Limits */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Escrow Balance */}
            <Card
              title="Escrow Protocol"
              icon={<Wallet className="w-5 h-5 text-emerald-400" />}
              className="border-emerald-500/20"
            >
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
                <Info className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm font-light text-emerald-100 leading-relaxed">
                  <p className="font-medium text-emerald-400 mb-1 tracking-tight">Autonomous X402</p>
                  <p>Deposit once — agents pay services automatically. Contract enforces your rules.</p>
                </div>
              </div>

              <div className="text-center p-6 mb-6 rounded-2xl bg-[#0A0A0A] border border-white/[0.05] shadow-inner">
                <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Escrow Balance</p>
                <p className="text-4xl font-medium text-white tracking-tight">
                  {(escrowBalance / 1_000_000).toFixed(2)} <span className="text-lg text-white/30 font-light">STX</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <InputField
                    label="Deposit Amount"
                    placeholder="5.0"
                    value={depositAmt}
                    onChange={setDepositAmt}
                    type="number"
                    error={depositError}
                  />
                  <button
                    onClick={handleDeposit}
                    className="w-full mt-2 px-4 py-3 bg-cyan-500/[0.05] border border-cyan-400/20 text-cyan-400 hover:bg-cyan-400 hover:text-black rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowDownCircle className="w-4 h-4" /> Deposit
                  </button>
                </div>
                <div>
                  <InputField
                    label="Withdraw Amount"
                    placeholder="1.0"
                    value={withdrawAmt}
                    onChange={setWithdrawAmt}
                    type="number"
                    error={withdrawError}
                  />
                  <button
                    onClick={handleWithdraw}
                    className="w-full mt-2 px-4 py-3 bg-white/[0.03] border border-white/10 text-white/80 hover:bg-white/[0.08] hover:text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowUpCircle className="w-4 h-4" /> Withdraw
                  </button>
                </div>
              </div>
            </Card>

            {/* Spending Limits */}
            <Card
              title="Constraint Matrix"
              icon={<Settings className="w-5 h-5" />}
            >
              <p className="text-sm font-light text-white/50 mb-6 leading-relaxed">
                Hard caps enforced directly by the Clarity smart contract. Shared safely across your operational node.
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <InputField
                  label="Daily Limit (STX)"
                  placeholder="20.0"
                  value={newDailyLimit}
                  onChange={setNewDailyLimit}
                  type="number"
                  error={newDailyError}
                />
                <InputField
                  label="Per-Call Max (STX)"
                  placeholder="2.0"
                  value={newPerCallLimit}
                  onChange={setNewPerCallLimit}
                  type="number"
                  error={newPerCallError}
                />
              </div>
              <button
                onClick={handleSetLimits}
                className="w-full mt-2 px-4 py-3 bg-white/[0.03] border border-white/10 text-white/80 hover:bg-white text-sm hover:text-black font-semibold rounded-xl transition-all shadow-sm hover:shadow-[0_0_15px_rgba(255,255,255,0.4)]"
              >
                Update Constraints
              </button>
            </Card>
          </div>

          {/* Manage Agents & Operator Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Manage Agents */}
            <Card
              title="Identity Fleet"
              icon={<Users className="w-5 h-5 text-cyan-400" />}
              className="hover:border-cyan-400/20 transition-colors"
            >
              <p className="text-sm font-light text-white/50 mb-6 leading-relaxed">
                Agents are logical identities. Kova executes payments via your registered operator. Private keys are never required.
              </p>

              {/* Agent list */}
              {savedAgents.length > 0 ? (
                <div className="space-y-3 mb-6">
                  {savedAgents.map((agent, i) => (
                    <div key={agent.address} className="p-4 bg-[#0A0A0A] rounded-2xl border border-white/[0.05]">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-md bg-cyan-500/[0.1] flex items-center justify-center text-[10px] font-mono text-cyan-400 border border-cyan-400/20">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <span className="text-sm font-medium text-white/90 tracking-tight">{agent.label}</span>
                          {agentStatuses[agent.address] && (
                            <div className="flex items-center ml-2">
                              <div className={`w-2 h-2 rounded-full ${agentStatuses[agent.address].onChainActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveAgent(agent.address)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
                          title="Purge Identity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Address */}
                      <div
                        onClick={() => copyToClipboard(agent.address, `addr-${i}`)}
                        className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border border-white/5 rounded-xl cursor-pointer hover:border-cyan-400/30 hover:bg-cyan-500/[0.02] transition-all group"
                      >
                        <span className="font-mono text-[10px] text-white/60 truncate flex-1">{agent.address}</span>
                        {copiedField === `addr-${i}` ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 ml-2 flex-shrink-0" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-white/20 group-hover:text-cyan-400 ml-2 flex-shrink-0 transition-colors" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40 font-light mb-6">
                  Your first agent was created with the wallet. Generate more below.
                </p>
              )}

              {/* Generate new agent button */}
              {savedAgents.length < 5 ? (
                <button
                  onClick={handleGenerateAgent}
                  className="w-full px-4 py-3.5 bg-cyan-500/[0.05] border border-cyan-400/20 text-cyan-400 hover:bg-cyan-400 hover:text-black font-semibold rounded-xl transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                >
                  <Zap className="w-4 h-4" />
                  Generate New Identity
                </button>
              ) : (
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 text-center py-3">Capacity limit reached (5/5)</p>
              )}

              {/* Production note */}
              <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-100/70 font-light flex items-start gap-2">
                <Key className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  <strong className="text-amber-400 font-medium">Hackathon:</strong> Keys stored in browser storage.<br/>
                  <strong className="text-amber-400 font-medium">Production:</strong> Use KMS/HSM integration.
                </span>
              </div>
            </Card>

            {/* Operator Setup — one-time registration */}
            <Card
              title="Operator Handshake"
              icon={operatorRegistered ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <Shield className="w-5 h-5" />}
              className={operatorRegistered ? "border-emerald-500/20" : "hover:border-white/10"}
            >
              {operatorRegistered ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                    <ShieldCheck className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-emerald-400 tracking-tight mb-0.5">Link Established</p>
                      <p className="text-xs font-light text-emerald-100/70">Backend authorized to sign payments.</p>
                    </div>
                  </div>
                  {operatorAddress && (
                    <div>
                      <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Operator Public Address</label>
                      <div
                        onClick={() => copyToClipboard(operatorAddress, "op-addr")}
                        className="flex items-center justify-between px-4 py-3 bg-[#0A0A0A] border border-white/10 rounded-xl cursor-pointer hover:border-emerald-400/30 hover:bg-emerald-500/[0.02] transition-all group"
                      >
                        <span className="font-mono text-xs text-white/70 truncate flex-1">{operatorAddress}</span>
                        {copiedField === "op-addr" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-2 flex-shrink-0" />
                        ) : (
                          <Copy className="w-4 h-4 text-white/30 group-hover:text-emerald-400 ml-2 flex-shrink-0 transition-colors" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <p className="text-sm font-light text-white/50 leading-relaxed">
                    Authorize the Kova Backend. Registering your backend as the operator allows it to sign <code className="font-mono text-xs text-white bg-white/10 px-1 py-0.5 rounded">agent-pay</code> and pay gas fees.
                  </p>

                  {backendOperator ? (
                    <div>
                      <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Detected Backend Node</label>
                      <div className="px-4 py-3 bg-[#0A0A0A] border border-white/10 rounded-xl">
                        <span className="font-mono text-xs text-white/80">{backendOperator}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                      <p className="text-sm text-red-200 font-light">
                        Node unreachable. Initialize <code className="font-mono text-xs bg-red-500/20 px-1 py-0.5 rounded text-red-300">agent.js</code> and refresh the protocol connection.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleRegisterOperator}
                    disabled={!backendOperator}
                    className={`w-full px-4 py-3.5 font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2 ${
                      backendOperator
                        ? "bg-white text-black hover:scale-[1.02] shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                        : "bg-white/[0.02] border border-white/[0.05] text-white/30 cursor-not-allowed"
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    Register On-Chain
                  </button>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs font-light text-white/40 flex items-start gap-3">
                    <Info className="w-4 h-4 text-white/60 shrink-0" />
                    <span className="leading-relaxed">
                      One-time cryptographic handshake. Post-registration, the operator settles payments autonomously unless overridden.
                    </span>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── REUSABLE COMPONENTS ───────────────────────────────────

function Card({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`p-6 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] shadow-2xl backdrop-blur-xl ${className}`}>
      <div className="flex items-center gap-3 mb-8 bg-white/[0.03] w-fit px-4 py-2.5 rounded-xl border border-white/[0.05]">
        <span className="text-white/80">{icon}</span>
        <h3 className="font-medium text-white tracking-tight">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InputField({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  error,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  error?: string;
}) {
  return (
    <div className="mb-3">
      <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-4 py-3 bg-[#0A0A0A] border rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none transition-all shadow-inner focus:shadow-[0_0_10px_rgba(34,211,238,0.1)] ${
          error
            ? "border-red-500/50 focus:border-red-400 bg-red-500/5"
            : "border-white/10 focus:border-cyan-400 focus:bg-white/[0.02]"
        }`}
      />
      {error && (
        <p className="mt-2 text-xs font-light text-red-400">{error}</p>
      )}
    </div>
  );
}