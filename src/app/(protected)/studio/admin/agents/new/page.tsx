"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createStudioAgent, fetchStudioArchetypes, fetchStudioArchetype } from "@/lib/studio-api";
import type { StudioArchetypeSummary, StudioArchetypeDetail, ArchetypePromptSection } from "@/types/studio";
import { toast } from "sonner";

const COLORS = ["#58a6ff", "#f78166", "#7ee787", "#d2a8ff", "#ffa657", "#79c0ff", "#ff7b72", "#56d364"];

type Step = "archetype" | "customize" | "metadata";

export default function CreateAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>("archetype");

  // Archetype selection
  const [archetypes, setArchetypes] = useState<StudioArchetypeSummary[]>([]);
  const [loadingArchetypes, setLoadingArchetypes] = useState(true);
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string | null>(null);
  const [archetype, setArchetype] = useState<StudioArchetypeDetail | null>(null);

  // Customized prompt content (keyed by section slug)
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  // Config overrides
  const [configOverrides, setConfigOverrides] = useState<Record<string, unknown>>({});

  // Metadata
  const [form, setForm] = useState({
    display_name: "",
    id: "",
    tagline: "",
    description: "",
    domain: "general" as string,
    avatar_color: COLORS[0],
    status: "draft" as "draft" | "active" | "archived",
  });

  useEffect(() => {
    fetchStudioArchetypes()
      .then(setArchetypes)
      .catch(() => toast.error("Failed to load archetypes"))
      .finally(() => setLoadingArchetypes(false));
  }, []);

  // When archetype is selected, load full detail
  useEffect(() => {
    if (!selectedArchetypeId) return;
    fetchStudioArchetype(selectedArchetypeId)
      .then((data) => {
        setArchetype(data);
        // Initialize prompt overrides with defaults
        const overrides: Record<string, string> = {};
        for (const section of data.prompt_sections || []) {
          overrides[section.slug] = section.default_content;
        }
        setPromptOverrides(overrides);
        // Initialize config with defaults
        const config: Record<string, unknown> = {};
        for (const param of data.config_schema || []) {
          if (param.default !== undefined && param.default !== null) {
            config[param.key] = param.default;
          }
        }
        setConfigOverrides(config);
        setForm((f) => ({ ...f, domain: data.domain }));
      })
      .catch(() => toast.error("Failed to load archetype details"));
  }, [selectedArchetypeId]);

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, display_name: name, id: slugify(name) }));
  }

  async function handleSave() {
    if (!form.id || !form.display_name) {
      toast.error("Name and ID are required");
      return;
    }
    setSaving(true);
    try {
      await createStudioAgent({
        id: form.id,
        display_name: form.display_name,
        tagline: form.tagline || undefined,
        description: form.description || undefined,
        domain: form.domain as "math" | "rw" | "general",
        avatar_color: form.avatar_color,
        status: form.status,
        archetype_id: selectedArchetypeId || undefined,
        agent_config: Object.keys(configOverrides).length > 0 ? configOverrides : undefined,
      });
      toast.success("Agent created");
      router.push(`/studio/admin/agents/${form.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setSaving(false);
    }
  }

  // ─── Step 1: Select Archetype ─────────────────────────────────────────────

  if (step === "archetype") {
    return (
      <div className="p-8 max-w-4xl">
        <h1 className="text-2xl font-bold text-[#f0f6fc] mb-2">Create Agent</h1>
        <p className="text-sm text-[#8b949e] mb-6">
          Step 1 of 3: Choose an archetype to start from, or create a blank agent.
        </p>

        {loadingArchetypes ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-[#161b22] rounded-xl animate-pulse border border-[#30363d]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Blank agent option */}
            <button
              onClick={() => {
                setSelectedArchetypeId(null);
                setArchetype(null);
                setStep("metadata");
              }}
              className={`text-left p-5 rounded-xl border transition-colors ${
                !selectedArchetypeId
                  ? "border-[#58a6ff] bg-[#161b22]"
                  : "border-[#30363d] bg-[#161b22] hover:border-[#58a6ff]/50"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-[#21262d] flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-[#8b949e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-[#f0f6fc] mb-1">Blank Agent</h3>
              <p className="text-xs text-[#8b949e]">Start from scratch with no archetype.</p>
            </button>

            {/* Archetype cards */}
            {archetypes.map((arch) => (
              <button
                key={arch.id}
                onClick={() => {
                  setSelectedArchetypeId(arch.id);
                  setStep("customize");
                }}
                className="text-left p-5 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-[#58a6ff]/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#58a6ff]/10 text-[#58a6ff] border border-[#58a6ff]/30">
                    {arch.domain}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-[#f0f6fc] mb-1">{arch.display_name}</h3>
                {arch.description && (
                  <p className="text-xs text-[#8b949e] mb-3 line-clamp-2">{arch.description}</p>
                )}
                <div className="flex gap-3 text-[10px] text-[#484f58]">
                  <span>{arch.prompt_sections_count} prompts</span>
                  <span>{arch.skills_count} skills</span>
                  <span>{arch.config_params_count} params</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Step 2: Customize Instance ───────────────────────────────────────────

  if (step === "customize" && archetype) {
    return (
      <div className="p-8 max-w-4xl">
        <h1 className="text-2xl font-bold text-[#f0f6fc] mb-2">Create Agent</h1>
        <p className="text-sm text-[#8b949e] mb-6">
          Step 2 of 3: Customize the instance from <span className="font-medium text-[#f0f6fc]">{archetype.display_name}</span>.
        </p>

        {/* Prompt sections */}
        <h2 className="text-lg font-semibold text-[#f0f6fc] mb-4">Prompt Sections</h2>
        <div className="space-y-4 mb-8">
          {(archetype.prompt_sections || []).map((section) => (
            <div key={section.slug} className="p-4 rounded-xl border border-[#30363d] bg-[#161b22]">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-medium text-[#f0f6fc]">{section.display_name}</h3>
                <span className="text-xs text-[#484f58] font-mono">{section.slug}</span>
              </div>
              {section.description && (
                <p className="text-xs text-[#8b949e] mb-3">{section.description}</p>
              )}
              <textarea
                value={promptOverrides[section.slug] ?? section.default_content}
                onChange={(e) => setPromptOverrides((prev) => ({ ...prev, [section.slug]: e.target.value }))}
                rows={5}
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm font-mono focus:outline-none focus:border-[#58a6ff] resize-none"
              />
            </div>
          ))}
        </div>

        {/* Config parameters */}
        {(archetype.config_schema || []).length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-[#f0f6fc] mb-4">Config Parameters</h2>
            <div className="space-y-4 mb-8">
              {(archetype.config_schema || []).map((param) => (
                <div key={param.key} className="flex items-center justify-between p-4 rounded-xl border border-[#30363d] bg-[#161b22]">
                  <div className="flex-1 mr-4">
                    <label className="text-sm font-medium text-[#f0f6fc]">{param.display_name}</label>
                    {param.description && (
                      <p className="text-xs text-[#8b949e] mt-0.5">{param.description}</p>
                    )}
                  </div>
                  <div className="w-48">
                    {param.type === "select" && param.options ? (
                      <select
                        value={String(configOverrides[param.key] ?? param.default ?? "")}
                        onChange={(e) => setConfigOverrides((prev) => ({ ...prev, [param.key]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                      >
                        {param.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : param.type === "boolean" ? (
                      <button
                        onClick={() => setConfigOverrides((prev) => ({ ...prev, [param.key]: !prev[param.key] }))}
                        className={`w-10 h-6 rounded-full transition-colors ${configOverrides[param.key] ? "bg-[#58a6ff]" : "bg-[#30363d]"}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${configOverrides[param.key] ? "translate-x-4" : ""}`} />
                      </button>
                    ) : param.type === "number" ? (
                      <input
                        type="number"
                        value={String(configOverrides[param.key] ?? param.default ?? "")}
                        min={param.min}
                        max={param.max}
                        onChange={(e) => setConfigOverrides((prev) => ({ ...prev, [param.key]: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(configOverrides[param.key] ?? param.default ?? "")}
                        onChange={(e) => setConfigOverrides((prev) => ({ ...prev, [param.key]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setStep("archetype")}
            className="px-5 py-2.5 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm border border-[#30363d] hover:bg-[#30363d] transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => setStep("metadata")}
            className="px-5 py-2.5 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] transition-colors"
          >
            Next: Set Metadata
          </button>
        </div>
      </div>
    );
  }

  // ─── Step 3: Metadata ─────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-[#f0f6fc] mb-2">Create Agent</h1>
      <p className="text-sm text-[#8b949e] mb-6">
        {selectedArchetypeId ? "Step 3 of 3" : "Step 2 of 2"}: Set metadata for your agent.
        {archetype && (
          <span className="ml-1">
            Based on <span className="font-medium text-[#f0f6fc]">{archetype.display_name}</span>.
          </span>
        )}
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Display Name</label>
          <input
            type="text"
            value={form.display_name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g., SAT Math Tutor"
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">ID (slug)</label>
          <input
            type="text"
            value={form.id}
            onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
            placeholder="auto-generated-from-name"
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] text-sm font-mono"
          />
          <p className="text-xs text-[#484f58] mt-1">Unique identifier, auto-derived from name.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Tagline</label>
          <input
            type="text"
            value={form.tagline}
            onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            placeholder="Short description shown on cards"
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="Full description of what this agent does"
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] text-sm resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Domain</label>
            <select
              value={form.domain}
              onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] focus:outline-none focus:border-[#58a6ff] text-sm"
            >
              <option value="general">General</option>
              <option value="math">Math</option>
              <option value="rw">Reading & Writing</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof form.status }))}
              className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] focus:outline-none focus:border-[#58a6ff] text-sm"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Avatar Color</label>
          <div className="flex gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setForm((f) => ({ ...f, avatar_color: color }))}
                className={`w-8 h-8 rounded-lg transition-all ${
                  form.avatar_color === color ? "ring-2 ring-white ring-offset-2 ring-offset-[#0d1117]" : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={() => setStep(selectedArchetypeId ? "customize" : "archetype")}
            className="px-5 py-2.5 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm border border-[#30363d] hover:bg-[#30363d] transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.id || !form.display_name}
            className="px-5 py-2.5 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Creating..." : "Create Agent"}
          </button>
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm border border-[#30363d] hover:bg-[#30363d] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
