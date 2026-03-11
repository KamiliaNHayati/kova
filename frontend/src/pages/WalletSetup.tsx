import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import {
  getWallet,
  getBalance,
  createWallet,
  setLimits,
  deposit,
  withdraw,
  addAgent,
  removeAgent,
} from "../lib/contracts";
import {
  generateAgentKeypair,
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
  const [depositAmt, setDepositAmt] = useState("");
  const [depositError, setDepositError] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawError, setWithdrawError] = useState("");

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

  const [txStatus, setTxStatus] = useState("");
  const [txError, setTxError] = useState("");

  useEffect(() => {
    if (!address) return;
    checkWallet();
    setSavedAgents(getSavedAgents(address));
  }, [address]);

  // Auto-generate first agent on mount if no wallet
  useEffect(() => {
    if (!loading && !hasWallet && !generatedAgent) {
      const agent = generateAgentKeypair("Agent 1");
      setGeneratedAgent(agent);
    }
  }, [loading, hasWallet]);

  async function checkWallet() {
    try {
      const result = await getWallet(address!);
      if (result && result.value !== null && result.value !== undefined) {
        setHasWallet(true);
        setWalletData(result.value);
        const bal = await getBalance(address!);
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

  function copyToClipboard(text: string, fieldId: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function handleDeposit() {
    setDepositError("");
    setTxError("");
    const v = isValidAmount(depositAmt);
    if (!v.valid) { setDepositError(v.error!); return; }
    const amt = Math.floor(parseFloat(depositAmt) * 1_000_000);
    setTxStatus("Confirm deposit in your wallet...");
    deposit(amt, (data) => {
      if (data && data.error) { setTxError(`Deposit failed: ${data.error}`); setTxStatus(""); }
      else { setTxStatus("Deposited!"); setDepositAmt(""); setTimeout(() => checkWallet(), 3000); }
    });
  }

  function handleWithdraw() {
    setWithdrawError("");
    setTxError("");
    const v = isValidAmount(withdrawAmt);
    if (!v.valid) { setWithdrawError(v.error!); return; }
    const amt = Math.floor(parseFloat(withdrawAmt) * 1_000_000);
    if (amt > escrowBalance) { setWithdrawError("Exceeds escrow balance"); return; }
    setTxStatus("Confirm withdrawal in your wallet...");
    withdraw(amt, (data) => {
      if (data && data.error) { setTxError(`Withdraw failed: ${data.error}`); setTxStatus(""); }
      else { setTxStatus("Withdrawn!"); setWithdrawAmt(""); setTimeout(() => checkWallet(), 3000); }
    });
  }

  function handleCreate() {
    setDailyLimitError("");
    setPerCallError("");
    setTxError("");

    if (!generatedAgent) {
      setTxError("No agent generated. Refresh the page.");
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
    createWallet(generatedAgent.address, daily, perCall, (data) => {
      if (data && data.error) {
        setTxError(`Transaction failed: ${data.error}`);
        setTxStatus("");
      } else {
        // Save agent keypair to localStorage
        saveAgent(address!, generatedAgent);
        setSavedAgents(getSavedAgents(address!));
        setTxStatus("Wallet created! Your agent is ready.");
        setTimeout(() => checkWallet(), 3000);
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
    setLimits(daily, perCall, (data) => {
      if (data && data.error) {
        setTxError(`Update failed: ${data.error}`);
        setTxStatus("");
      } else {
        setTxStatus("Limits updated!");
        setNewDailyLimit("");
        setNewPerCallLimit("");
      }
    });
  }

  function handleGenerateAgent() {
    setTxError("");
    if (savedAgents.length >= 5) {
      setTxError("Maximum 5 agents per wallet");
      return;
    }

    const agent = generateAgentKeypair(`Agent ${savedAgents.length + 1}`);

    setTxStatus("Confirm in your wallet...");
    addAgent(agent.address, (data) => {
      if (data && data.error) {
        setTxError(`Add agent failed: ${data.error}`);
        setTxStatus("");
      } else {
        saveAgent(address!, agent);
        setSavedAgents(getSavedAgents(address!));
        setTxStatus(`Agent generated! Copy the private key to your .env`);
        setTimeout(() => checkWallet(), 3000);
      }
    });
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
              <div className="p-4 rounded-xl bg-success/5 border border-success/10">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-success" />
                  <span className="text-sm font-medium text-success">Agent Auto-Generated</span>
                </div>
                {generatedAgent && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] text-text-muted uppercase mb-1">Agent Address</label>
                      <div
                        onClick={() => copyToClipboard(generatedAgent.address, "create-addr")}
                        className="flex items-center justify-between px-3 py-2.5 bg-black/30 border border-border/40 rounded-lg cursor-pointer hover:border-success/40 transition-all group"
                      >
                        <span className="font-mono text-xs text-white truncate flex-1">{generatedAgent.address}</span>
                        {copiedField === "create-addr" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-success ml-2 flex-shrink-0" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-text-muted group-hover:text-success ml-2 flex-shrink-0 transition-colors" />
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-text-muted uppercase mb-1">
                        Private Key <span className="text-warning bg-warning/10 px-1.5 py-0.5 rounded text-[8px] font-bold ml-1">DEMO ONLY</span>
                      </label>
                      <div
                        onClick={() => copyToClipboard(generatedAgent.privateKey, "create-key")}
                        className="flex items-center justify-between px-3 py-2.5 bg-black/30 border border-border/40 rounded-lg cursor-pointer hover:border-warning/40 transition-all group"
                      >
                        <span className="font-mono text-xs text-text-muted truncate flex-1">
                          {showKeyFor === "create" ? generatedAgent.privateKey : "••••••••••••••••••••••••"}
                        </span>
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowKeyFor(showKeyFor === "create" ? null : "create"); }}
                            className="p-1 hover:bg-white/5 rounded"
                          >
                            {showKeyFor === "create" ? <EyeOff className="w-3.5 h-3.5 text-text-muted" /> : <Eye className="w-3.5 h-3.5 text-text-muted" />}
                          </button>
                          {copiedField === "create-key" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-text-muted group-hover:text-warning transition-colors" />
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-warning/70 mt-1 flex items-center gap-1">
                        <Key className="w-3 h-3" /> Demo: copy to .env. Production: managed by Kova backend via KMS — never exposed.
                      </p>
                    </div>
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
              Authorize up to 5 agents. Kova auto-generates keypairs — copy the private key to each agent's .env file.
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

                    {/* Private Key (DEMO ONLY) */}
                    <div
                      onClick={() => copyToClipboard(agent.privateKey, `key-${i}`)}
                      className="flex items-center justify-between px-3 py-2 bg-black/20 border border-border/20 rounded-lg cursor-pointer hover:border-warning/30 transition-all group"
                    >
                      <span className="font-mono text-[11px] text-text-muted truncate flex-1">
                        {showKeyFor === agent.address ? agent.privateKey : "•••••••••••••••••••••"}
                      </span>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowKeyFor(showKeyFor === agent.address ? null : agent.address); }}
                          className="p-0.5 hover:bg-white/5 rounded"
                        >
                          {showKeyFor === agent.address ? <EyeOff className="w-3 h-3 text-text-muted" /> : <Eye className="w-3 h-3 text-text-muted" />}
                        </button>
                        {copiedField === `key-${i}` ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <Key className="w-3 h-3 text-text-muted group-hover:text-warning transition-colors" />
                        )}
                      </div>
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
