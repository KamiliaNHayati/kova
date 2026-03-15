/**
 * Agent Key Management
 *
 * Calls the Kova Backend (agent.js) to derive agent keys from the
 * custodial wallet. The frontend only receives public addresses —
 * private keys never leave the backend.
 *
 * Production: replace localhost with a KMS-backed API.
 */

const AGENTS_KEY = "kova-agents";
const BACKEND_URL = "http://localhost:4000";

export interface AgentKeypair {
    address: string;
    label: string;
    index: number;
    createdAt: string;
}

/**
 * Request a new agent from the backend.
 * Backend derives next HD account → returns address only.
 */
export async function createAgentFromBackend(label?: string, index?: number): Promise<AgentKeypair> {
    try {
        const res = await fetch(`${BACKEND_URL}/api/create-agent`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: label || undefined, index: index }),
        });
        if (!res.ok) throw new Error(`Backend error: ${res.status}`);
        const data = await res.json();
        return {
            address: data.address,
            label: data.label,
            index: data.index,
            createdAt: new Date().toISOString(),
        };
    } catch (err) {
        console.error("Failed to create agent from backend:", err);
        throw err;
    }
}

/**
 * Fetch all agents from the backend.
 */
export async function fetchAgentsFromBackend(): Promise<AgentKeypair[]> {
    try {
        const res = await fetch(`${BACKEND_URL}/api/agents`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.map((a: { address: string; label: string; index: number }) => ({
            address: a.address,
            label: a.label,
            index: a.index,
            createdAt: "",
        }));
    } catch {
        return [];
    }
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
 * Save a new agent to localStorage.
 */
export function saveAgent(ownerAddress: string, agent: AgentKeypair) {
  const agents = getSavedAgents(ownerAddress);
  // add dedup check
  if (agents.some((a) => a.address === agent.address)) return;
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
