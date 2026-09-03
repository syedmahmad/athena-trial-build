"use client";

import { useEffect, useState } from "react";
import {
  fetchStudioAgents,
  fetchStudioAgent,
  fetchStudioPrompts,
  fetchStudioConfigSections,
  fetchStudioAgentConfig,
} from "@/lib/studio-api";
import type {
  StudioAgent,
  StudioAgentDetail,
  StudioPromptSlotSummary,
  StudioConfigSection,
} from "@/types/studio";
import { toast } from "sonner";

interface AgentData {
  detail: StudioAgentDetail;
  prompts: StudioPromptSlotSummary[];
  configSections: StudioConfigSection[];
  agentConfig: Record<string, unknown>;
}

export default function AgentComparePage() {
  const [agents, setAgents] = useState<StudioAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [leftData, setLeftData] = useState<AgentData | null>(null);
  const [rightData, setRightData] = useState<AgentData | null>(null);
  const [loadingLeft, setLoadingLeft] = useState(false);
  const [loadingRight, setLoadingRight] = useState(false);

  useEffect(() => {
    fetchStudioAgents()
      .then(setAgents)
      .catch(() => toast.error("Failed to load agents"))
      .finally(() => setLoading(false));
  }, []);

  async function loadAgent(id: string): Promise<AgentData | null> {
    if (!id) return null;
    try {
      const [detail, prompts, configSections, configRes] = await Promise.all([
        fetchStudioAgent(id),
        fetchStudioPrompts(id),
        fetchStudioConfigSections(id),
        fetchStudioAgentConfig(id).catch(() => ({ agent_config: {}, config_schema: [], archetype_id: null })),
      ]);
      return { detail, prompts, configSections, agentConfig: configRes.agent_config };
    } catch {
      toast.error(`Failed to load agent "${id}"`);
      return null;
    }
  }

  async function handleLeftChange(id: string) {
    setLeftId(id);
    if (!id) { setLeftData(null); return; }
    setLoadingLeft(true);
    setLeftData(await loadAgent(id));
    setLoadingLeft(false);
  }

  async function handleRightChange(id: string) {
    setRightId(id);
    if (!id) { setRightData(null); return; }
    setLoadingRight(true);
    setRightData(await loadAgent(id));
    setLoadingRight(false);
  }

  // Collect all unique prompt slugs
  const allSlugs = new Set<string>();
  leftData?.prompts.forEach((p) => allSlugs.add(p.slug));
  rightData?.prompts.forEach((p) => allSlugs.add(p.slug));

  // Collect all unique config section keys
  const allConfigKeys = new Set<string>();
  leftData?.configSections.forEach((s) => allConfigKeys.add(s.section));
  rightData?.configSections.forEach((s) => allConfigKeys.add(s.section));

  // Collect agent_config keys
  const allAgentConfigKeys = new Set<string>();
  if (leftData?.agentConfig) Object.keys(leftData.agentConfig).forEach((k) => allAgentConfigKeys.add(k));
  if (rightData?.agentConfig) Object.keys(rightData.agentConfig).forEach((k) => allAgentConfigKeys.add(k));

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-64 bg-[#161b22] rounded animate-pulse mb-6" />
        <div className="h-96 bg-[#161b22] rounded-xl animate-pulse border border-[#30363d]" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[#f0f6fc] mb-2">Compare Agents</h1>
      <p className="text-sm text-[#8b949e] mb-6">
        Select two agents to compare their prompts, config, and skills side by side.
      </p>

      {/* Agent selectors */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div>
          <label className="block text-xs font-medium text-[#8b949e] mb-1.5 uppercase tracking-wider">
            Agent A
          </label>
          <select
            value={leftId}
            onChange={(e) => handleLeftChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
          >
            <option value="">Select agent...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id} disabled={a.id === rightId}>
                {a.display_name} ({a.id})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8b949e] mb-1.5 uppercase tracking-wider">
            Agent B
          </label>
          <select
            value={rightId}
            onChange={(e) => handleRightChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
          >
            <option value="">Select agent...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id} disabled={a.id === leftId}>
                {a.display_name} ({a.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {(loadingLeft || loadingRight) && (
        <div className="h-48 bg-[#161b22] rounded-xl animate-pulse border border-[#30363d] mb-6" />
      )}

      {!loadingLeft && !loadingRight && leftData && rightData && (
        <div className="space-y-8">
          {/* Metadata comparison */}
          <section>
            <h2 className="text-sm font-semibold text-[#f0f6fc] mb-3 uppercase tracking-wider">Metadata</h2>
            <div className="border border-[#30363d] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#30363d] bg-[#161b22]">
                    <th className="text-left px-4 py-2 text-xs text-[#8b949e] w-1/5">Field</th>
                    <th className="text-left px-4 py-2 text-xs text-[#8b949e] w-2/5">{leftData.detail.display_name}</th>
                    <th className="text-left px-4 py-2 text-xs text-[#8b949e] w-2/5">{rightData.detail.display_name}</th>
                  </tr>
                </thead>
                <tbody>
                  {(["domain", "status", "tagline"] as const).map((field) => {
                    const lVal = String(leftData.detail[field] ?? "");
                    const rVal = String(rightData.detail[field] ?? "");
                    const diff = lVal !== rVal;
                    return (
                      <tr key={field} className="border-b border-[#30363d] last:border-0">
                        <td className="px-4 py-2 text-xs text-[#8b949e] font-mono">{field}</td>
                        <td className={`px-4 py-2 text-sm ${diff ? "bg-red-500/5 text-[#f0f6fc]" : "text-[#8b949e]"}`}>
                          {lVal || <span className="text-[#484f58] italic">none</span>}
                        </td>
                        <td className={`px-4 py-2 text-sm ${diff ? "bg-green-500/5 text-[#f0f6fc]" : "text-[#8b949e]"}`}>
                          {rVal || <span className="text-[#484f58] italic">none</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Prompt comparison */}
          {allSlugs.size > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[#f0f6fc] mb-3 uppercase tracking-wider">Prompt Sections</h2>
              <div className="space-y-3">
                {Array.from(allSlugs).map((slug) => {
                  const leftPrompt = leftData.prompts.find((p) => p.slug === slug);
                  const rightPrompt = rightData.prompts.find((p) => p.slug === slug);
                  const leftContent = leftPrompt?.latest_version?.content || "";
                  const rightContent = rightPrompt?.latest_version?.content || "";
                  const diff = leftContent !== rightContent;

                  return (
                    <div key={slug} className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
                      <div className="px-4 py-2 border-b border-[#30363d] flex items-center gap-2">
                        <span className="text-sm font-medium text-[#f0f6fc]">
                          {leftPrompt?.display_name || rightPrompt?.display_name || slug}
                        </span>
                        <span className="text-xs text-[#484f58] font-mono">{slug}</span>
                        {diff && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                            Different
                          </span>
                        )}
                        {!diff && leftContent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/30">
                            Identical
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-[#30363d]">
                        <div className={`p-3 ${diff ? "bg-red-500/5" : ""}`}>
                          {leftContent ? (
                            <pre className="text-xs text-[#f0f6fc] font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto">
                              {leftContent}
                            </pre>
                          ) : (
                            <p className="text-xs text-[#484f58] italic">Not defined</p>
                          )}
                        </div>
                        <div className={`p-3 ${diff ? "bg-green-500/5" : ""}`}>
                          {rightContent ? (
                            <pre className="text-xs text-[#f0f6fc] font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto">
                              {rightContent}
                            </pre>
                          ) : (
                            <p className="text-xs text-[#484f58] italic">Not defined</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Config comparison */}
          {allConfigKeys.size > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[#f0f6fc] mb-3 uppercase tracking-wider">Config Sections</h2>
              <div className="space-y-3">
                {Array.from(allConfigKeys).map((sectionKey) => {
                  const leftSection = leftData.configSections.find((s) => s.section === sectionKey);
                  const rightSection = rightData.configSections.find((s) => s.section === sectionKey);
                  const leftJson = JSON.stringify(leftSection?.data || {}, null, 2);
                  const rightJson = JSON.stringify(rightSection?.data || {}, null, 2);
                  const diff = leftJson !== rightJson;

                  return (
                    <div key={sectionKey} className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
                      <div className="px-4 py-2 border-b border-[#30363d] flex items-center gap-2">
                        <span className="text-sm font-medium text-[#f0f6fc]">
                          {sectionKey.replace(/_/g, " ")}
                        </span>
                        {diff && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                            Different
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-[#30363d]">
                        <div className={`p-3 ${diff ? "bg-red-500/5" : ""}`}>
                          <pre className="text-xs text-[#f0f6fc] font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto">
                            {leftJson}
                          </pre>
                        </div>
                        <div className={`p-3 ${diff ? "bg-green-500/5" : ""}`}>
                          <pre className="text-xs text-[#f0f6fc] font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto">
                            {rightJson}
                          </pre>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Agent config (archetype-based) comparison */}
          {allAgentConfigKeys.size > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[#f0f6fc] mb-3 uppercase tracking-wider">Agent Config (Tunable Parameters)</h2>
              <div className="border border-[#30363d] rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#30363d] bg-[#161b22]">
                      <th className="text-left px-4 py-2 text-xs text-[#8b949e] w-1/5">Parameter</th>
                      <th className="text-left px-4 py-2 text-xs text-[#8b949e] w-2/5">{leftData.detail.display_name}</th>
                      <th className="text-left px-4 py-2 text-xs text-[#8b949e] w-2/5">{rightData.detail.display_name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(allAgentConfigKeys).map((key) => {
                      const lVal = JSON.stringify(leftData.agentConfig[key] ?? "");
                      const rVal = JSON.stringify(rightData.agentConfig[key] ?? "");
                      const diff = lVal !== rVal;
                      return (
                        <tr key={key} className="border-b border-[#30363d] last:border-0">
                          <td className="px-4 py-2 text-xs text-[#8b949e] font-mono">{key}</td>
                          <td className={`px-4 py-2 text-sm font-mono ${diff ? "bg-red-500/5 text-[#f0f6fc]" : "text-[#8b949e]"}`}>
                            {lVal}
                          </td>
                          <td className={`px-4 py-2 text-sm font-mono ${diff ? "bg-green-500/5 text-[#f0f6fc]" : "text-[#8b949e]"}`}>
                            {rVal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {!loadingLeft && !loadingRight && (!leftData || !rightData) && (leftId || rightId) && (
        <div className="text-center py-16 text-[#8b949e]">
          <p>Select both agents to see the comparison.</p>
        </div>
      )}

      {!leftId && !rightId && (
        <div className="text-center py-16 text-[#8b949e]">
          <p className="text-lg mb-2">Select two agents above</p>
          <p className="text-sm">Their prompts, config, and metadata will be compared side by side.</p>
        </div>
      )}
    </div>
  );
}
