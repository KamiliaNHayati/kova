import {
  uintCV,
  standardPrincipalCV,
  boolCV,
  stringAsciiCV,
  cvToJSON,
  fetchCallReadOnlyFunction,
  PostConditionMode,
  Pc,
} from "@stacks/transactions";
import { openContractCall } from "@stacks/connect";
import { STACKS_TESTNET } from "@stacks/network";

const CONTRACT_ADDRESS = "STWEW038MP9DGVVMBZMVBJ6KZXC39Y5NHWY5CC37";
const AGENT_WALLET = "agent-wallet-v5";
const SERVICE_REGISTRY = "service-registry-v4";

const network = STACKS_TESTNET;

// =====================
// Read-only calls
// =====================

async function callReadOnly(
  contract: string,
  fn: string,
  args: any[],
  sender: string
) {
  const result = await fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: contract,
    functionName: fn,
    functionArgs: args,
    network,
    senderAddress: sender,
  });
  return cvToJSON(result);
}

// v3: per-agent wallet lookup
export async function getWallet(owner: string, agent: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-wallet",
    [standardPrincipalCV(owner), standardPrincipalCV(agent)],
    owner
  );
}

export async function getBalance(owner: string, agent: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-balance",
    [standardPrincipalCV(owner), standardPrincipalCV(agent)],
    owner
  );
}

export async function getDailyRemaining(owner: string, agent: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-daily-remaining",
    [standardPrincipalCV(owner), standardPrincipalCV(agent)],
    owner
  );
}

export async function getSpentToday(owner: string, agent: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-spent-today",
    [standardPrincipalCV(owner), standardPrincipalCV(agent)],
    owner
  );
}

// v3: per-agent service check
export async function isServiceAllowed(owner: string, agent: string, service: string) {
  return callReadOnly(
    AGENT_WALLET,
    "is-service-allowed",
    [standardPrincipalCV(owner), standardPrincipalCV(agent), standardPrincipalCV(service)],
    owner
  );
}

export async function getSpendNonce(owner: string, agent: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-spend-nonce",
    [standardPrincipalCV(owner), standardPrincipalCV(agent)],
    owner
  );
}

export async function getSpendRecord(owner: string, agent: string, nonce: number) {
  return callReadOnly(
    AGENT_WALLET,
    "get-spend-record",
    [standardPrincipalCV(owner), standardPrincipalCV(agent), uintCV(nonce)],
    owner
  );
}

export async function isAgentActive(owner: string, agent: string) {
  return callReadOnly(
    AGENT_WALLET,
    "is-agent-active",
    [standardPrincipalCV(owner), standardPrincipalCV(agent)],
    owner
  );
}

export async function getAgentCount(owner: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-agent-count",
    [standardPrincipalCV(owner)],
    owner
  );
}

// Validate spend: explicit agent param (matches v3 operator model)
export async function validateSpend(
  owner: string,
  agent: string,
  service: string,
  amount: number,
  senderAddress: string
) {
  return callReadOnly(
    AGENT_WALLET,
    "validate-spend",
    [standardPrincipalCV(owner), standardPrincipalCV(agent), standardPrincipalCV(service), uintCV(amount)],
    senderAddress
  );
}

// Operator management
export async function getOperator(owner: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-operator",
    [standardPrincipalCV(owner)],
    owner
  );
}

export async function getOperatorAddress(owner: string): Promise<string | null> {
  const result = await callReadOnly(
    AGENT_WALLET,
    "get-operator",
    [standardPrincipalCV(owner)],
    owner
  );
  // result.value is (optional { operator: principal })
  if (!result.value) return null;
  return result.value.value?.operator?.value ?? null;
}

export function registerOperator(
  operator: string,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "register-operator",
    [standardPrincipalCV(operator)],
    onFinish
  );
}

export function revokeOperator(
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "revoke-operator",
    [],
    onFinish
  );
}

// Service registry read-only
export async function getUserService(owner: string, index: number) {
  return callReadOnly(
    SERVICE_REGISTRY,
    "get-user-service",
    [standardPrincipalCV(owner), uintCV(index)],
    owner
  );
}

export async function getServiceCount(owner: string) {
  return callReadOnly(
    SERVICE_REGISTRY,
    "get-service-count",
    [standardPrincipalCV(owner)],
    owner
  );
}

// =====================
// Write calls (open wallet for signing)
// =====================

function contractCall(
  contract: string,
  fn: string,
  args: any[],
  onFinish?: (data: any) => void,
  postConditions?: any[]
) {
  return openContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: contract,
    functionName: fn,
    functionArgs: args,
    network,
    postConditionMode: PostConditionMode.Deny,
    postConditions: postConditions || [],
    onFinish: onFinish || (() => { }),
  });
}

// v3: create-wallet creates an isolated {owner, agent} wallet
export function createWallet(
  agent: string,
  dailyLimit: number,
  perCallLimit: number,
  onFinish?: (data: any) => void
) {
  if (!agent || agent.trim() === '') throw new Error('Agent address is required');
  if (dailyLimit <= 0) throw new Error('Daily limit must be greater than 0');
  if (perCallLimit <= 0) throw new Error('Per-call limit must be greater than 0');
  if (perCallLimit > dailyLimit) throw new Error('Per-call limit cannot exceed daily limit');
  return contractCall(
    AGENT_WALLET,
    "create-wallet",
    [standardPrincipalCV(agent), uintCV(dailyLimit), uintCV(perCallLimit)],
    onFinish
  );
}

// v4: deposit to a specific agent's escrow
export function deposit(
  agent: string,
  amount: number,
  senderAddress: string,
  onFinish?: (data: any) => void
) {
  const postCondition = Pc.principal(senderAddress)
    .willSendEq(amount)
    .ustx();

  return openContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: AGENT_WALLET,
    functionName: "deposit",
    functionArgs: [standardPrincipalCV(agent), uintCV(amount)],
    network,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [postCondition],
    onFinish: onFinish || (() => {}),
  });
}

// v3: withdraw from a specific agent's escrow
export function withdraw(
  agent: string,
  amount: number,
  onFinish?: (data: any) => void
) {
  return openContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: AGENT_WALLET,
    functionName: "withdraw",
    functionArgs: [standardPrincipalCV(agent), uintCV(amount)],
    network,
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
    onFinish: onFinish || (() => { }),
  });
}

// v3: set-active per agent
export function setActive(
  agent: string,
  isActive: boolean,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "set-active",
    [standardPrincipalCV(agent), boolCV(isActive)],
    onFinish
  );
}

// v3: set-limits per agent
export function setLimits(
  agent: string,
  dailyLimit: number,
  perCallLimit: number,
  onFinish?: (data: any) => void
) {
  if (dailyLimit <= 0) throw new Error('Daily limit must be greater than 0');
  if (perCallLimit <= 0) throw new Error('Per-call limit must be greater than 0');
  if (perCallLimit > dailyLimit) throw new Error('Per-call limit cannot exceed daily limit');
  return contractCall(
    AGENT_WALLET,
    "set-limits",
    [standardPrincipalCV(agent), uintCV(dailyLimit), uintCV(perCallLimit)],
    onFinish
  );
}

// v5: remove-agent (deletes the agent's wallet)
export function removeAgent(
  agent: string,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "remove-agent",
    [standardPrincipalCV(agent)],
    onFinish
  );
}

// v5: allow-service per agent
export function allowService(
  agent: string,
  service: string,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "allow-service",
    [standardPrincipalCV(agent), standardPrincipalCV(service)],
    onFinish
  );
}

// v3: disallow-service per agent
export function disallowService(
  agent: string,
  service: string,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "disallow-service",
    [standardPrincipalCV(agent), standardPrincipalCV(service)],
    onFinish
  );
}

// Service registry
export function registerService(
  name: string,
  description: string,
  url: string,
  pricePerCall: number,
  onFinish?: (data: any) => void
) {
  if (!name || name.trim() === '') throw new Error('Service name is required');
  if (!url || url.trim() === '') throw new Error('Service URL is required');
  if (pricePerCall <= 0) throw new Error('Price per call must be greater than 0');
  return contractCall(
    SERVICE_REGISTRY,
    "register-service",
    [
      stringAsciiCV(name),
      stringAsciiCV(description),
      stringAsciiCV(url),
      uintCV(pricePerCall),
    ],
    onFinish
  );
}
