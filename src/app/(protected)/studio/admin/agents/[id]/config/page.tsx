"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchStudioConfigSections,
  updateStudioConfigSection,
  fetchStudioAgentConfig,
  updateStudioAgentConfig,
} from "@/lib/studio-api";
import type { StudioConfigSection } from "@/types/studio";
import { toast } from "sonner";

type ConfigTab = "agent" | "model" | "ui" | "interaction";

interface ConfigParam {
  key: string;
  display_name: string;
  description: string;
  type: "string" | "number" | "boolean" | "select";
  default: unknown;
  options?: string[];
  min?: number;
  max?: number;
}

export default function AgentConfigPage() {
  const params = useParams();
  const agentId = params.id as string;

  const [sections, setSections] = useState<StudioConfigSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<ConfigTab>("agent");

  // Archetype-based agent config
  const [agentConfig, setAgentConfig] = useState<Record<string, unknown>>({});
  const [configSchema, setConfigSchema] = useState<ConfigParam[]>([]);
  const [hasArchetype, setHasArchetype] = useState(false);

  // Model settings state
  const [model, setModel] = useState({
    provider: "anthropic" as "anthropic" | "openai",
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    temperature: 0.7,
  });

  // UI settings state
  const [ui, setUi] = useState({
    layout: "standard" as string,
    widgets: [] as string[],
    narration: false,
    student_chat: true,
    quick_chips: [] as string[],
    advance_mode: "manual" as string,
  });

  // Interaction rules state
  const [interaction, setInteraction] = useState({
    max_lesson_steps: 10,
    practice_count_min: 2,
    practice_count_max: 5,
    quiz_count_min: 3,
    quiz_count_max: 8,
    show_hints: true,
    hint_escalation: true,
  });

  // Widget/chip input state
  const [newWidget, setNewWidget] = useState("");
  const [newChip, setNewChip] = useState("");

  useEffect(() => {
    Promise.all([
      fetchStudioConfigSections(agentId),
      fetchStudioAgentConfig(agentId).catch(() => null),
    ]).then(([configData, agentConfigData]) => {
      setSections(configData);
      const modelSection = configData.find((s) => s.section === "model_settings");
      const uiSection = configData.find((s) => s.section === "ui_settings");
      const interactionSection = configData.find((s) => s.section === "interaction_rules");

      if (modelSection?.data) {
        setModel((prev) => ({ ...prev, ...(modelSection.data as Record<string, unknown>) }));
      }
      if (uiSection?.data) {
        const d = uiSection.data as Record<string, unknown>;
        setUi((prev) => ({
          ...prev,
          layout: (d.layout as string) || prev.layout,
          widgets: (d.widgets as string[]) || prev.widgets,
          narration: (d.narration as boolean) ?? prev.narration,
          student_chat: (d.student_chat as boolean) ?? prev.student_chat,
          quick_chips: (d.quick_chips as string[]) || prev.quick_chips,
          advance_mode: (d.advance_mode as string) || prev.advance_mode,
        }));
      }
      if (interactionSection?.data) {
        setInteraction((prev) => ({ ...prev, ...(interactionSection.data as Record<string, unknown>) }));
      }

      if (agentConfigData) {
        setAgentConfig(agentConfigData.agent_config || {});
        setConfigSchema(agentConfigData.config_schema || []);
        setHasArchetype(!!agentConfigData.archetype_id);
        if (agentConfigData.archetype_id && agentConfigData.config_schema.length > 0) {
          setTab("agent");
        } else {
          setTab("model");
        }
      } else {
        setTab("model");
      }
    }).catch(() => toast.error("Failed to load config")).finally(() => setLoading(false));
  }, [agentId]);

  async function saveSection(section: string, data: Record<string, unknown>) {
    setSaving(true);
    try {
      await updateStudioConfigSection(agentId, section, data);
      toast.success(`${section.replace("_", " ")} saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function saveAgentConfig() {
    setSaving(true);
    try {
      await updateStudioAgentConfig(agentId, agentConfig);
      toast.success("Agent config saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const allTabs: { label: string; value: ConfigTab }[] = [
    ...(hasArchetype && configSchema.length > 0 ? [{ label: "Agent Parameters", value: "agent" as const }] : []),
    { label: "Model Settings", value: "model" as const },
    { label: "UI Settings", value: "ui" as const },
    { label: "Interaction Rules", value: "interaction" as const },
  ];

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-64 bg-[#161b22] rounded-xl animate-pulse border border-[#30363d]" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[#f0f6fc] mb-6">Agent Config</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-[#161b22] rounded-lg border border-[#30363d] w-fit">
        {allTabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t.value ? "bg-[#21262d] text-[#f0f6fc]" : "text-[#8b949e] hover:text-[#f0f6fc]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl space-y-5">
        {/* Agent Parameters (archetype-based) */}
        {tab === "agent" && (
          <>
            <p className="text-sm text-[#8b949e] mb-4">
              These parameters are defined by the agent's archetype and control its behavior.
            </p>
            {configSchema.map((param) => (
              <div key={param.key} className="space-y-1.5">
                <label className="block text-sm font-medium text-[#f0f6fc]">{param.display_name}</label>
                {param.description && (
                  <p className="text-xs text-[#8b949e]">{param.description}</p>
                )}
                {param.type === "select" && param.options ? (
                  <select
                    value={String(agentConfig[param.key] ?? param.default ?? "")}
                    onChange={(e) => setAgentConfig((prev) => ({ ...prev, [param.key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                  >
                    {param.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : param.type === "boolean" ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#8b949e]">
                      {agentConfig[param.key] ? "Enabled" : "Disabled"}
                    </span>
                    <button
                      onClick={() => setAgentConfig((prev) => ({ ...prev, [param.key]: !prev[param.key] }))}
                      className={`w-10 h-6 rounded-full transition-colors ${agentConfig[param.key] ? "bg-[#58a6ff]" : "bg-[#30363d]"}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${agentConfig[param.key] ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                ) : param.type === "number" ? (
                  <div>
                    <input
                      type="number"
                      value={String(agentConfig[param.key] ?? param.default ?? "")}
                      min={param.min}
                      max={param.max}
                      onChange={(e) => setAgentConfig((prev) => ({ ...prev, [param.key]: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                    />
                    {(param.min !== undefined || param.max !== undefined) && (
                      <p className="text-xs text-[#484f58] mt-1">
                        {param.min !== undefined && `Min: ${param.min}`}
                        {param.min !== undefined && param.max !== undefined && " | "}
                        {param.max !== undefined && `Max: ${param.max}`}
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={String(agentConfig[param.key] ?? param.default ?? "")}
                    onChange={(e) => setAgentConfig((prev) => ({ ...prev, [param.key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                  />
                )}
              </div>
            ))}
            <button
              onClick={saveAgentConfig}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving..." : "Save Agent Parameters"}
            </button>
          </>
        )}

        {tab === "model" && (
          <>
            <div>
              <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Provider</label>
              <select
                value={model.provider}
                onChange={(e) => setModel((m) => ({ ...m, provider: e.target.value as "anthropic" | "openai" }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Model</label>
              <input
                type="text"
                value={model.model}
                onChange={(e) => setModel((m) => ({ ...m, model: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm font-mono focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Max Tokens</label>
              <input
                type="number"
                value={model.max_tokens}
                onChange={(e) => setModel((m) => ({ ...m, max_tokens: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">
                Temperature: {model.temperature.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={model.temperature}
                onChange={(e) => setModel((m) => ({ ...m, temperature: Number(e.target.value) }))}
                className="w-full accent-[#58a6ff]"
              />
              <div className="flex justify-between text-xs text-[#484f58] mt-1">
                <span>0 (deterministic)</span>
                <span>2 (creative)</span>
              </div>
            </div>
            <button
              onClick={() => saveSection("model_settings", model)}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving..." : "Save Model Settings"}
            </button>
          </>
        )}

        {tab === "ui" && (
          <>
            <div>
              <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Layout</label>
              <select
                value={ui.layout}
                onChange={(e) => setUi((u) => ({ ...u, layout: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
              >
                <option value="standard">Standard</option>
                <option value="workspace">Workspace</option>
                <option value="split-pane">Split Pane</option>
                <option value="canvas">Canvas</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Widgets</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {ui.widgets.map((w) => (
                  <span key={w} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#21262d] text-xs text-[#f0f6fc] border border-[#30363d]">
                    {w}
                    <button onClick={() => setUi((u) => ({ ...u, widgets: u.widgets.filter((x) => x !== w) }))} className="text-[#8b949e] hover:text-red-400">x</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newWidget}
                  onChange={(e) => setNewWidget(e.target.value)}
                  placeholder="Add widget"
                  className="flex-1 px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                  onKeyDown={(e) => { if (e.key === "Enter" && newWidget.trim()) { setUi((u) => ({ ...u, widgets: [...u.widgets, newWidget.trim()] })); setNewWidget(""); } }}
                />
                <button
                  onClick={() => { if (newWidget.trim()) { setUi((u) => ({ ...u, widgets: [...u.widgets, newWidget.trim()] })); setNewWidget(""); } }}
                  className="px-3 py-2 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm border border-[#30363d] hover:bg-[#30363d]"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#f0f6fc]">Narration</label>
              <button
                onClick={() => setUi((u) => ({ ...u, narration: !u.narration }))}
                className={`w-10 h-6 rounded-full transition-colors ${ui.narration ? "bg-[#58a6ff]" : "bg-[#30363d]"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${ui.narration ? "translate-x-4" : ""}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#f0f6fc]">Student Chat</label>
              <button
                onClick={() => setUi((u) => ({ ...u, student_chat: !u.student_chat }))}
                className={`w-10 h-6 rounded-full transition-colors ${ui.student_chat ? "bg-[#58a6ff]" : "bg-[#30363d]"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${ui.student_chat ? "translate-x-4" : ""}`} />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Quick Chips</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {ui.quick_chips.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#21262d] text-xs text-[#f0f6fc] border border-[#30363d]">
                    {c}
                    <button onClick={() => setUi((u) => ({ ...u, quick_chips: u.quick_chips.filter((x) => x !== c) }))} className="text-[#8b949e] hover:text-red-400">x</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newChip}
                  onChange={(e) => setNewChip(e.target.value)}
                  placeholder="Add chip"
                  className="flex-1 px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                  onKeyDown={(e) => { if (e.key === "Enter" && newChip.trim()) { setUi((u) => ({ ...u, quick_chips: [...u.quick_chips, newChip.trim()] })); setNewChip(""); } }}
                />
                <button
                  onClick={() => { if (newChip.trim()) { setUi((u) => ({ ...u, quick_chips: [...u.quick_chips, newChip.trim()] })); setNewChip(""); } }}
                  className="px-3 py-2 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm border border-[#30363d] hover:bg-[#30363d]"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Advance Mode</label>
              <select
                value={ui.advance_mode}
                onChange={(e) => setUi((u) => ({ ...u, advance_mode: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
              >
                <option value="manual">Manual</option>
                <option value="auto">Auto</option>
                <option value="narration-complete">Narration Complete</option>
              </select>
            </div>

            <button
              onClick={() => saveSection("ui_settings", ui)}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving..." : "Save UI Settings"}
            </button>
          </>
        )}

        {tab === "interaction" && (
          <>
            <div>
              <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Max Lesson Steps</label>
              <input
                type="number"
                value={interaction.max_lesson_steps}
                onChange={(e) => setInteraction((i) => ({ ...i, max_lesson_steps: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Practice Count Min</label>
                <input
                  type="number"
                  value={interaction.practice_count_min}
                  onChange={(e) => setInteraction((i) => ({ ...i, practice_count_min: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Practice Count Max</label>
                <input
                  type="number"
                  value={interaction.practice_count_max}
                  onChange={(e) => setInteraction((i) => ({ ...i, practice_count_max: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Quiz Count Min</label>
                <input
                  type="number"
                  value={interaction.quiz_count_min}
                  onChange={(e) => setInteraction((i) => ({ ...i, quiz_count_min: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Quiz Count Max</label>
                <input
                  type="number"
                  value={interaction.quiz_count_max}
                  onChange={(e) => setInteraction((i) => ({ ...i, quiz_count_max: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#f0f6fc]">Show Hints</label>
              <button
                onClick={() => setInteraction((i) => ({ ...i, show_hints: !i.show_hints }))}
                className={`w-10 h-6 rounded-full transition-colors ${interaction.show_hints ? "bg-[#58a6ff]" : "bg-[#30363d]"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${interaction.show_hints ? "translate-x-4" : ""}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#f0f6fc]">Hint Escalation</label>
              <button
                onClick={() => setInteraction((i) => ({ ...i, hint_escalation: !i.hint_escalation }))}
                className={`w-10 h-6 rounded-full transition-colors ${interaction.hint_escalation ? "bg-[#58a6ff]" : "bg-[#30363d]"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${interaction.hint_escalation ? "translate-x-4" : ""}`} />
              </button>
            </div>

            <button
              onClick={() => saveSection("interaction_rules", interaction)}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving..." : "Save Interaction Rules"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
