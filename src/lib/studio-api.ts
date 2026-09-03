/**
 * Studio Agent Registry API client.
 * All calls go through Next.js API routes which proxy to the agents backend.
 */

import type {
  StudioAgent,
  StudioAgentCreateInput,
  StudioAgentDetail,
  StudioAgentUpdateInput,
  StudioArchetypeCreateInput,
  StudioArchetypeDetail,
  StudioArchetypeSummary,
  StudioArchetypeUpdateInput,
  StudioConfigSection,
  StudioDeployment,
  StudioDeploymentCreateInput,
  StudioPromptSlot,
  StudioPromptSlotCreateInput,
  StudioPromptSlotSummary,
  StudioPromptValidateResponse,
  StudioPromptVersion,
  StudioPromptVersionCreateInput,
  StudioSessionDetail,
  StudioSessionSummary,
  PromptVariable,
} from "@/types/studio";

const BASE = "/api/studio/agents";

async function studioFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Studio API error: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export async function fetchStudioAgents(params?: {
  status?: string;
  domain?: string;
}): Promise<StudioAgent[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.domain) sp.set("domain", params.domain);
  const qs = sp.toString();
  return studioFetch<StudioAgent[]>(`${BASE}${qs ? `?${qs}` : ""}`);
}

export async function fetchStudioAgent(id: string): Promise<StudioAgentDetail> {
  return studioFetch<StudioAgentDetail>(`${BASE}/${id}`);
}

export async function createStudioAgent(data: StudioAgentCreateInput): Promise<StudioAgent> {
  return studioFetch<StudioAgent>(BASE, { method: "POST", body: JSON.stringify(data) });
}

export async function updateStudioAgent(id: string, data: StudioAgentUpdateInput): Promise<StudioAgent> {
  return studioFetch<StudioAgent>(`${BASE}/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteStudioAgent(id: string): Promise<void> {
  await studioFetch<void>(`${BASE}/${id}`, { method: "DELETE" });
}

// ─── Prompt Slots ────────────────────────────────────────────────────────────

export async function fetchStudioPrompts(agentId: string): Promise<StudioPromptSlotSummary[]> {
  return studioFetch<StudioPromptSlotSummary[]>(`${BASE}/${agentId}/prompts`);
}

export async function createStudioPrompt(agentId: string, data: StudioPromptSlotCreateInput): Promise<StudioPromptSlot> {
  return studioFetch<StudioPromptSlot>(`${BASE}/${agentId}/prompts`, { method: "POST", body: JSON.stringify(data) });
}

export async function deleteStudioPrompt(agentId: string, slug: string): Promise<void> {
  await studioFetch<void>(`${BASE}/${agentId}/prompts/${slug}`, { method: "DELETE" });
}

// ─── Prompt Versions ─────────────────────────────────────────────────────────

export async function fetchStudioPromptVersions(agentId: string, slug: string): Promise<StudioPromptVersion[]> {
  return studioFetch<StudioPromptVersion[]>(`${BASE}/${agentId}/prompts/${slug}/versions`);
}

export async function createStudioPromptVersion(agentId: string, slug: string, data: StudioPromptVersionCreateInput): Promise<StudioPromptVersion> {
  return studioFetch<StudioPromptVersion>(`${BASE}/${agentId}/prompts/${slug}/versions`, { method: "POST", body: JSON.stringify(data) });
}

export async function publishStudioPromptVersion(versionId: string): Promise<StudioPromptVersion> {
  return studioFetch<StudioPromptVersion>(`${BASE}/prompt-versions/${versionId}/publish`, { method: "PATCH" });
}

export async function archiveStudioPromptVersion(versionId: string): Promise<StudioPromptVersion> {
  return studioFetch<StudioPromptVersion>(`${BASE}/prompt-versions/${versionId}/archive`, { method: "PATCH" });
}

// ─── Config Sections ─────────────────────────────────────────────────────────

export async function fetchStudioConfigSections(agentId: string): Promise<StudioConfigSection[]> {
  return studioFetch<StudioConfigSection[]>(`${BASE}/${agentId}/config`);
}

export async function updateStudioConfigSection(agentId: string, section: string, data: Record<string, unknown>): Promise<StudioConfigSection> {
  return studioFetch<StudioConfigSection>(`${BASE}/${agentId}/config/${section}`, { method: "PUT", body: JSON.stringify({ data }) });
}

// ─── Deployments ─────────────────────────────────────────────────────────────

export async function fetchStudioDeployments(agentId: string): Promise<StudioDeployment[]> {
  return studioFetch<StudioDeployment[]>(`${BASE}/${agentId}/deployments`);
}

export async function createStudioDeployment(agentId: string, data: StudioDeploymentCreateInput): Promise<StudioDeployment> {
  return studioFetch<StudioDeployment>(`${BASE}/${agentId}/deployments`, { method: "POST", body: JSON.stringify(data) });
}

export async function promoteStudioDeployment(deploymentId: string): Promise<StudioDeployment> {
  return studioFetch<StudioDeployment>(`${BASE}/deployments/${deploymentId}/promote`, { method: "PATCH" });
}

export async function retireStudioDeployment(deploymentId: string): Promise<StudioDeployment> {
  return studioFetch<StudioDeployment>(`${BASE}/deployments/${deploymentId}/retire`, { method: "PATCH" });
}

export async function rollbackStudioDeployment(deploymentId: string): Promise<StudioDeployment> {
  return studioFetch<StudioDeployment>(`${BASE}/deployments/${deploymentId}/rollback`, { method: "PATCH" });
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function fetchAllStudioSessions(params?: { limit?: number; offset?: number }): Promise<StudioSessionSummary[]> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return studioFetch<StudioSessionSummary[]>(`/api/studio/sessions${qs ? `?${qs}` : ""}`);
}

export async function fetchStudioSessions(agentId: string, params?: { limit?: number; offset?: number }): Promise<StudioSessionSummary[]> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return studioFetch<StudioSessionSummary[]>(`${BASE}/${agentId}/sessions${qs ? `?${qs}` : ""}`);
}

export async function fetchStudioSession(sessionId: string): Promise<StudioSessionDetail> {
  return studioFetch<StudioSessionDetail>(`${BASE}/sessions/${sessionId}`);
}

// ─── Validation ──────────────────────────────────────────────────────────────

export async function validateStudioPrompt(agentId: string, data: {
  content: string;
  variables?: PromptVariable[];
  context?: Record<string, unknown>;
}): Promise<StudioPromptValidateResponse> {
  return studioFetch<StudioPromptValidateResponse>(`${BASE}/${agentId}/validate-prompt`, { method: "POST", body: JSON.stringify(data) });
}

// ─── Archetypes ─────────────────────────────────────────────────────────────

export async function fetchStudioArchetypes(): Promise<StudioArchetypeSummary[]> {
  return studioFetch<StudioArchetypeSummary[]>(`${BASE}/archetypes`);
}

export async function fetchStudioArchetype(id: string): Promise<StudioArchetypeDetail> {
  return studioFetch<StudioArchetypeDetail>(`${BASE}/archetypes/${id}`);
}

export async function createStudioArchetype(data: StudioArchetypeCreateInput): Promise<StudioArchetypeDetail> {
  return studioFetch<StudioArchetypeDetail>(`${BASE}/archetypes`, { method: "POST", body: JSON.stringify(data) });
}

export async function updateStudioArchetype(id: string, data: StudioArchetypeUpdateInput): Promise<StudioArchetypeDetail> {
  return studioFetch<StudioArchetypeDetail>(`${BASE}/archetypes/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteStudioArchetype(id: string): Promise<void> {
  await studioFetch<void>(`${BASE}/archetypes/${id}`, { method: "DELETE" });
}

// ─── Clone Agent ────────────────────────────────────────────────────────────

export async function cloneStudioAgent(agentId: string, data: {
  new_id: string;
  display_name: string;
  tagline?: string;
}): Promise<StudioAgent> {
  return studioFetch<StudioAgent>(`${BASE}/clone/${agentId}`, { method: "POST", body: JSON.stringify(data) });
}

// ─── Agent Config (archetype-based) ─────────────────────────────────────────

export async function fetchStudioAgentConfig(agentId: string): Promise<{
  agent_config: Record<string, unknown>;
  config_schema: Array<{
    key: string;
    display_name: string;
    description: string;
    type: "string" | "number" | "boolean" | "select";
    default: unknown;
    options?: string[];
    min?: number;
    max?: number;
  }>;
  archetype_id: string | null;
}> {
  return studioFetch(`${BASE}/agent-config/${agentId}`);
}

export async function updateStudioAgentConfig(agentId: string, config: Record<string, unknown>): Promise<{ agent_config: Record<string, unknown> }> {
  return studioFetch(`${BASE}/agent-config/${agentId}`, { method: "PUT", body: JSON.stringify({ agent_config: config }) });
}
