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
  Eye,
  EyeOff,
  Bot,
  ChevronDown,
  Shield,
  ShieldCheck,
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
  const [showKeyFor, setShowKeyFor] = useState<string | null>(null);

  // Operator state
  const [operatorRegistered, setOperatorRegistered] = useState(false);
  const [operatorAddress, setOperatorAddress] = useState<string | null>(null);
  const [backendOperator, setBackendOperator] = useState<string | null>(null);

  const [txStatus, setTxStatus] = useState("");
  const [txError, setTxError] = useState("");

  useEffect(() => {
    if (!address) return;
    checkWallet();
    setSavedAgents(getSavedAgents(address));
    fetchOperatorStatus();
  }, [address]);

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

  // Auto-generate first agent on mount if no local agents exist
  useEffect(() => {
    if (!loading && savedAgents.length === 0 && !generatedAgent) {
      createAgentFromBackend("Agent 1")
        .then((agent) => setGeneratedAgent(agent))
        .catch(() => setTxError("Backend not running. Start agent.js first."));
    }
  }, [loading, savedAgents.length, generatedAgent]);

  async function checkWallet() {
    try {
      // v3: check if any agent has a wallet
      const agents = getSavedAgents(address!);
      if (agents.length === 0) {
        setHasWallet(false);
        setWalletData(null);
        setLoading(false);
        return;
      }
      // Check the first (or selected) agent's wallet
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
      // Check on-chain operator registration
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
      // Get backend operator address
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
    
    // UI Lock Check
    const agentState = agentStatuses[agentAddr];
    if (agentState && agentState.running) {
        alert("⚠️ WARNING: This agent is actively paying for a service right now.\n\nWithdrawing your balance mid-flight may cause the transaction to fail and your data won't arrive. Please wait a few seconds before withdrawing.");
        return;
    }

    setTxStatus("Confirm withdrawal in your wallet...");
    // v3: withdraw(agent, amount)
    withdraw(agentAddr, amt, (data) => {
      if (data && data.error) { setTxError(`Withdraw failed: ${data.error}`); setTxStatus(""); }
      else { 
        setTxStatus("Withdrawn!"); setWithdrawAmt(""); 
        pushAudit("WITHDRAW", { agentAddr, amount: amt });
        setTimeout(() => checkWallet(), 3000); 
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
        // Save agent keypair to localStorage if it's new
        if (generatedAgent) {
          saveAgent(address!, generatedAgent);
          setSavedAgents(getSavedAgents(address!));
        }

        // Tell backend to switch to this agent's index
        // DELETE this block from handleCreate
        if (targetAgent.index !== undefined) {
          try {
            await fetch("http://localhost:4000/api/activate-agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ index: targetAgent.index }),
            });
          } catch { }
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
    // v3: setLimits(agent, daily, perCall)
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
      const nextIdx = savedAgents.length > 0 
        ? Math.max(...savedAgents.map(a => a.index !== undefined ? a.index : -1)) + 1 
        : undefined; // Backend will default to .env + 2 if it's the very first agent
      const agent = await createAgentFromBackend(`Agent ${savedAgents.length + 1}`, nextIdx);

      setTxStatus("Confirm in your wallet...");
      // v3: createWallet creates an isolated wallet per agent
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
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pt-4 relative">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Wallet Setup</h1>
        <p className="text-text-muted">
          {hasWallet
            ? "Manage your escrow balance, spending limits, and authorized agents."
            : "Create your agent wallet to enable autonomous escrow payments."}
        </p>
      </div>

      {txStatus && (
        <div className="p-3 mb-6 rounded-lg bg-accent/10 text-accent text-sm">
          {txStatus}
        </div>
      )}

      {txError && (
        <div className="p-3 mb-6 rounded-lg bg-danger/10 text-danger text-sm">
          {txError}
        </div>
      )}

      {!hasWallet ? (
        <div className="max-w-2xl">
          <Card title="Create Agent Wallet" icon={<Plus className="w-5 h-5" />}>
            <div className="space-y-5">
              {/* Auto-generated agent */}
              <div className="p-4 rounded-xl bg-surface border border-border/50">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-warning" />
                  <span className="text-sm font-medium text-warning">
                    {savedAgents.length > 0 ? "Pending Agent Wallet" : "Agent Auto-Generated"}
                  </span>
                </div>
                {(generatedAgent || savedAgents[selectedAgentIdx]) && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] text-text-muted uppercase mb-1">Agent Address</label>
                      <div
                        onClick={() => copyToClipboard((generatedAgent || savedAgents[selectedAgentIdx]).address, "create-addr")}
                        className="flex items-center justify-between px-3 py-2.5 bg-black/30 border border-border/40 rounded-lg cursor-pointer hover:border-success/40 transition-all group"
                      >
                        <span className="font-mono text-xs text-white truncate flex-1">{(generatedAgent || savedAgents[selectedAgentIdx]).address}</span>
                        {copiedField === "create-addr" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-success ml-2 flex-shrink-0" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-text-muted group-hover:text-success ml-2 flex-shrink-0 transition-colors" />
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-text-muted mt-2 flex items-center gap-1">
                      <Key className="w-3 h-3 text-warning" /> Keys securely managed by Kova Backend via KMS.
                    </p>
                    {savedAgents.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/20">
                        <p className="text-xs text-warning/90 leading-relaxed">
                          ⚠️ This agent identity exists locally, but the on-chain wallet hasn't been confirmed yet. If you already submitted a transaction to create it, please wait for testnet confirmation. Otherwise, submit creation now.
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
                className="w-full mt-2 px-4 py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:scale-[1.01]"
              >
                Create Wallet
              </button>
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Agent Selector */}
          {savedAgents.length > 0 && (
            <div className="max-w-sm relative">
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
                    <p className="text-sm font-medium text-white">{savedAgents[selectedAgentIdx]?.label || "Agent"}</p>
                    <p className="text-[10px] font-mono text-text-muted truncate max-w-[220px]">{savedAgents[selectedAgentIdx]?.address || "—"}</p>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${agentDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {agentDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl overflow-hidden shadow-xl z-50">
                  {savedAgents.map((agent, idx) => (
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
          )}

          {/* Top row: Escrow + Spending Limits */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Escrow Balance */}
            <Card
              title="Escrow Balance"
              icon={<Wallet className="w-5 h-5 text-success" />}
              className="border-success/20 ring-1 ring-success/10"
            >
              <div className="flex items-start gap-3 p-4 rounded-xl bg-success/5 border border-success/10 mb-4">
                <Info className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                <div className="text-sm text-text-muted leading-relaxed">
                  <p className="text-success font-medium mb-1">Escrow (Autonomous x402)</p>
                  <p>Deposit once — agents pay services automatically. Contract enforces your rules.</p>
                </div>
              </div>

              <div className="text-center p-4 mb-4 rounded-xl bg-black/20 border border-border/30">
                <p className="text-xs text-text-muted uppercase mb-1">Escrow Balance</p>
                <p className="text-3xl font-bold text-white">
                  {(escrowBalance / 1_000_000).toFixed(2)} <span className="text-sm text-text-muted">STX</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <InputField
                    label="Deposit (STX)"
                    placeholder="5.0"
                    value={depositAmt}
                    onChange={setDepositAmt}
                    type="number"
                    error={depositError}
                  />
                  <button
                    onClick={handleDeposit}
                    className="w-full mt-2 px-4 py-2.5 bg-success/10 border border-success/20 text-success hover:bg-success hover:text-black rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowDownCircle className="w-4 h-4" /> Deposit
                  </button>
                </div>
                <div>
                  <InputField
                    label="Withdraw (STX)"
                    placeholder="1.0"
                    value={withdrawAmt}
                    onChange={setWithdrawAmt}
                    type="number"
                    error={withdrawError}
                  />
                  <button
                    onClick={handleWithdraw}
                    className="w-full mt-2 px-4 py-2.5 bg-white/5 border border-border/30 text-text-muted hover:bg-white/10 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowUpCircle className="w-4 h-4" /> Withdraw
                  </button>
                </div>
              </div>
            </Card>

            {/* Spending Limits */}
            <Card
              title="Spending Limits"
              icon={<Settings className="w-5 h-5 text-accent" />}
            >
              <p className="text-sm text-text-muted mb-4">Hard caps enforced by the smart contract. Shared across all agents.</p>
              <div className="grid grid-cols-2 gap-4">
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
                className="w-full mt-4 px-4 py-3 bg-accent/20 border border-accent/30 text-accent hover:bg-accent hover:text-white font-semibold rounded-xl transition-all"
              >
                Save Limits
              </button>
            </Card>
          </div>

          {/* Manage Agents */}
          <Card
            title="Manage Agents"
            icon={<Users className="w-5 h-5 text-warning" />}
            className="hover:border-warning/30 transition-colors"
          >
            <p className="text-sm text-text-muted mb-4">
              Agents are logical identities. Kova executes payments on your behalf via registered operator — private keys are not required for agents. Authorize up to 5 agents.
            </p>

            {/* Agent list */}
            {savedAgents.length > 0 ? (
              <div className="space-y-3 mb-4">
                {savedAgents.map((agent, i) => (
                  <div key={agent.address} className="p-4 bg-black/20 rounded-xl border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-warning/20 flex items-center justify-center text-xs font-bold text-warning">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-white">{agent.label}</span>
                        {agentStatuses[agent.address] && (
                          <div className="flex items-center ml-1" title={agentStatuses[agent.address].lastSeen > Date.now() - 300000 ? "Agent Active (Heartbeat recent)" : "Agent Offline (No recent heartbeat)"}>
                            <div className={`w-2 h-2 rounded-full ${agentStatuses[agent.address].onChainActive && agentStatuses[agent.address].lastSeen > Date.now() - 300000 ? 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)]' : agentStatuses[agent.address].onChainActive ? 'bg-warning shadow-[0_0_8px_rgba(234,179,8,0.6)]' : 'bg-danger shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveAgent(agent.address)}
                        className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                        title="Remove agent"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Address */}
                    <div
                      onClick={() => copyToClipboard(agent.address, `addr-${i}`)}
                      className="flex items-center justify-between px-3 py-2 mb-2 bg-black/20 border border-border/20 rounded-lg cursor-pointer hover:border-success/30 transition-all group"
                    >
                      <span className="font-mono text-[11px] text-white/80 truncate flex-1">{agent.address}</span>
                      {copiedField === `addr-${i}` ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success ml-2 flex-shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-text-muted group-hover:text-success ml-2 flex-shrink-0 transition-colors" />
                      )}
                    </div>


                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted mb-4">
                Your first agent was created with the wallet. Generate more below.
              </p>
            )}

            {/* Generate new agent button */}
            {savedAgents.length < 5 ? (
              <button
                onClick={handleGenerateAgent}
                className="w-full px-4 py-3 bg-warning/10 border border-warning/20 text-warning hover:bg-warning hover:text-black font-medium rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Generate New Agent
              </button>
            ) : (
              <p className="text-xs text-text-muted text-center">Maximum 5 agents reached. Remove one to add another.</p>
            )}

            {/* Production note */}
            <div className="mt-4 p-3 rounded-lg bg-warning/5 border border-warning/10 text-[10px] text-text-muted flex items-start gap-2">
              <Key className="w-3 h-3 text-warning mt-0.5 flex-shrink-0" />
              <span>
                <strong className="text-warning">Hackathon:</strong> Keys stored in browser localStorage.{" "}
                <strong className="text-warning">Production:</strong> use KMS/HSM for secure key management.
              </span>
            </div>
          </Card>

          {/* Operator Setup — one-time registration */}
          <Card
            title="Operator Setup"
            icon={operatorRegistered ? <ShieldCheck className="w-5 h-5 text-success" /> : <Shield className="w-5 h-5 text-accent" />}
            className={operatorRegistered ? "border-success/20 ring-1 ring-success/10" : "hover:border-accent/30 transition-colors"}
          >
            {operatorRegistered ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/20">
                  <ShieldCheck className="w-5 h-5 text-success flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-success">Operator Active</p>
                    <p className="text-xs text-text-muted mt-0.5">Your backend can autonomously sign payments.</p>
                  </div>
                </div>
                {operatorAddress && (
                  <div>
                    <label className="block text-[10px] text-text-muted uppercase mb-1">Operator Address</label>
                    <div
                      onClick={() => copyToClipboard(operatorAddress, "op-addr")}
                      className="flex items-center justify-between px-3 py-2.5 bg-black/30 border border-border/40 rounded-lg cursor-pointer hover:border-success/40 transition-all group"
                    >
                      <span className="font-mono text-xs text-white truncate flex-1">{operatorAddress}</span>
                      {copiedField === "op-addr" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success ml-2 flex-shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-text-muted group-hover:text-success ml-2 flex-shrink-0 transition-colors" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-text-muted leading-relaxed">
                  Authorize Kova Backend (one-time). Register your backend as the operator. This allows it to sign <code className="text-xs px-1.5 py-0.5 bg-black/30 rounded text-accent">agent-pay</code> and pay gas on behalf of your agents.
                </p>

                {backendOperator ? (
                  <div>
                    <label className="block text-[10px] text-text-muted uppercase mb-1">Backend Operator Address</label>
                    <div className="px-3 py-2.5 bg-black/30 border border-border/40 rounded-lg">
                      <span className="font-mono text-xs text-white">{backendOperator}</span>
                    </div>
                    <p className="text-[10px] text-text-muted mt-1.5">
                      This address was auto-detected from your running backend.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-warning/10 border border-warning/20">
                    <p className="text-xs text-warning/90">
                      ⚠️ Backend not reachable. Start <code className="px-1 py-0.5 bg-black/20 rounded">agent.js</code> first, then refresh.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleRegisterOperator}
                  disabled={!backendOperator}
                  className={`w-full px-4 py-3.5 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    backendOperator
                      ? "bg-accent hover:bg-accent-hover text-white hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:scale-[1.01]"
                      : "bg-white/5 text-text-muted cursor-not-allowed"
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Register Operator On-Chain
                </button>

                <div className="p-3 rounded-lg bg-accent/5 border border-accent/10 text-[10px] text-text-muted flex items-start gap-2">
                  <Info className="w-3 h-3 text-accent mt-0.5 flex-shrink-0" />
                  <span>
                    One-time setup. After registering, the operator can autonomously settle payments without your approval (unless Telegram guard is enabled).
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

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
    <div className={`p-6 rounded-2xl bg-surface/80 border border-border shadow-md backdrop-blur-xl ${className}`}>
      <div className="flex items-center gap-3 mb-6 bg-surface-2/50 w-fit px-4 py-2 rounded-lg border border-border/50">
        <span>{icon}</span>
        <h3 className="font-semibold text-white tracking-tight">{title}</h3>
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
  mono = false,
  error,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  mono?: boolean;
  error?: string;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-text-muted mb-1.5">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-4 py-3 bg-[#00000040] border rounded-xl text-sm text-white placeholder:text-text-muted/40 focus:outline-none transition-all shadow-inner focus:shadow-[0_0_15px_rgba(99,102,241,0.15)] focus:bg-surface/90 ${error
          ? "border-danger/50 focus:border-danger ring-1 ring-danger/20"
          : "border-border/60 focus:border-accent ring-1 ring-transparent focus:ring-accent/20"
          } ${mono ? "font-mono text-xs tracking-wider" : ""}`}
      />
      {error && (
        <p className="mt-1.5 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
