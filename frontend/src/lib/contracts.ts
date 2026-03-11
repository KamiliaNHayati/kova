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
const AGENT_WALLET = "agent-wallet-v2";
const SERVICE_REGISTRY = "service-registry-v2";

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

export async function getWallet(owner: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-wallet",
    [standardPrincipalCV(owner)],
    owner
  );
}

export async function getBalance(owner: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-balance",
    [standardPrincipalCV(owner)],
    owner
  );
}

export async function getDailyRemaining(owner: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-daily-remaining",
    [standardPrincipalCV(owner)],
    owner
  );
}



export async function getSpentToday(owner: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-spent-today",
    [standardPrincipalCV(owner)],
    owner
  );
}

export async function isServiceAllowed(owner: string, service: string) {
  return callReadOnly(
    AGENT_WALLET,
    "is-service-allowed",
    [standardPrincipalCV(owner), standardPrincipalCV(service)],
    owner
  );
}

export async function getSpendNonce(owner: string) {
  return callReadOnly(
    AGENT_WALLET,
    "get-spend-nonce",
    [standardPrincipalCV(owner)],
    owner
  );
}

export async function getSpendRecord(owner: string, nonce: number) {
  return callReadOnly(
    AGENT_WALLET,
    "get-spend-record",
    [standardPrincipalCV(owner), uintCV(nonce)],
    owner
  );
}

// Non-custodial x402: validate before paying
export async function validateSpend(
  owner: string,
  service: string,
  amount: number,
  agentAddress: string
) {
  return callReadOnly(
    AGENT_WALLET,
    "validate-spend",
    [standardPrincipalCV(owner), standardPrincipalCV(service), uintCV(amount)],
    agentAddress
  );
}

// Escrow: deposit STX to contract
export function deposit(
  amount: number,
  onFinish?: (data: any) => void
) {
  // Use Allow mode since user intentionally sends STX to escrow
  return openContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: AGENT_WALLET,
    functionName: "deposit",
    functionArgs: [uintCV(amount)],
    network,
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
    onFinish: onFinish || (() => { }),
  });
}

// Escrow: withdraw STX from contract
export function withdraw(
  amount: number,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "withdraw",
    [uintCV(amount)],
    onFinish
  );
}

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



export function setActive(
  isActive: boolean,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "set-active",
    [boolCV(isActive)],
    onFinish
  );
}

export function setLimits(
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
    [uintCV(dailyLimit), uintCV(perCallLimit)],
    onFinish
  );
}

export function setAgent(
  newAgent: string,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "set-agent",
    [standardPrincipalCV(newAgent)],
    onFinish
  );
}

export function addAgent(
  newAgent: string,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "add-agent",
    [standardPrincipalCV(newAgent)],
    onFinish
  );
}

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

export async function isAgentAuthorized(owner: string, agent: string) {
  return callReadOnly(
    AGENT_WALLET,
    "is-agent-authorized",
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

export function allowService(
  service: string,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "allow-service",
    [standardPrincipalCV(service)],
    onFinish
  );
}

export function disallowService(
  service: string,
  onFinish?: (data: any) => void
) {
  return contractCall(
    AGENT_WALLET,
    "disallow-service",
    [standardPrincipalCV(service)],
    onFinish
  );
}

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
