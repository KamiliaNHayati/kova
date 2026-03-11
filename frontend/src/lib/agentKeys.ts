/**
 * Agent Key Management (Hackathon)
 *
 * Generates and stores agent keypairs in localStorage.
 * Production: use KMS/HSM instead.
 */
import { getAddressFromPrivateKey } from "@stacks/transactions";
import { bytesToHex } from "@stacks/common";
import { STACKS_TESTNET } from "@stacks/network";

const AGENTS_KEY = "kova-agents";

export interface AgentKeypair {
    address: string;
    privateKey: string;
    label: string;
    createdAt: string;
}

/**
 * Generate a new random Stacks keypair for an agent.
 */
export function generateAgentKeypair(label?: string): AgentKeypair {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const privateKey = bytesToHex(bytes);
    const address = getAddressFromPrivateKey(privateKey, STACKS_TESTNET);

    return {
        address,
        privateKey,
        label: label || `Agent ${Date.now().toString(36).slice(-4).toUpperCase()}`,
        createdAt: new Date().toISOString(),
    };
}

/**
 * Get all saved agents for a wallet owner from localStorage.
 */
export function getSavedAgents(ownerAddress: string): AgentKeypair[] {
    try {
        const raw = localStorage.getItem(`${AGENTS_KEY}-${ownerAddress}`);
        if (raw) return JSON.parse(raw);
    } catch { }
    return [];
}

/**
 * Save a new agent keypair to localStorage.
 */
export function saveAgent(ownerAddress: string, agent: AgentKeypair) {
    const agents = getSavedAgents(ownerAddress);
    agents.push(agent);
    localStorage.setItem(`${AGENTS_KEY}-${ownerAddress}`, JSON.stringify(agents));
}

/**
 * Remove an agent from localStorage.
 */
export function removeAgentLocal(ownerAddress: string, agentAddress: string) {
    const agents = getSavedAgents(ownerAddress).filter(
        (a) => a.address !== agentAddress
    );
    localStorage.setItem(`${AGENTS_KEY}-${ownerAddress}`, JSON.stringify(agents));
}

/**
 * Get the currently selected agent address from localStorage.
 */
export function getSelectedAgent(ownerAddress: string): string | null {
    return localStorage.getItem(`kova-selected-agent-${ownerAddress}`);
}

/**
 * Set the currently selected agent.
 */
export function setSelectedAgent(ownerAddress: string, agentAddress: string) {
    localStorage.setItem(`kova-selected-agent-${ownerAddress}`, agentAddress);
}
