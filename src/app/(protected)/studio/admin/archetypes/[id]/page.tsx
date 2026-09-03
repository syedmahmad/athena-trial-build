"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  fetchStudioArchetype,
  updateStudioArchetype,
  deleteStudioArchetype,
} from "@/lib/studio-api";
import type {
  StudioArchetypeDetail,
  ArchetypePromptSection,
  ArchetypeSkill,
  ArchetypeConfigParam,
} from "@/types/studio";
import { toast } from "sonner";

const PARAM_TYPES = ["string", "number", "boolean", "select"] as const;

export default function ArchetypeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const archetypeId = params.id as string;
  const isNew = archetypeId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [form, setForm] = useState({
    id: "",
    display_name: "",
    description: "",
    domain: "general",
  });

  const [sections, setSections] = useState<ArchetypePromptSection[]>([]);
  const [skills, setSkills] = useState<ArchetypeSkill[]>([]);
  const [configSchema, setConfigSchema] = useState<ArchetypeConfigParam[]>([]);

  const [activeTab, setActiveTab] = useState<"sections" | "skills" | "config">("sections");

  useEffect(() => {
    if (isNew) return;
    fetchStudioArchetype(archetypeId)
      .then((data) => {
        setForm({
          id: data.id,
          display_name: data.display_name,
          description: data.description || "",
          domain: data.domain,
        });
        setSections(data.prompt_sections || []);
        setSkills(data.skills || []);
        setConfigSchema(data.config_schema || []);
      })
      .catch(() => toast.error("Failed to load archetype"))
      .finally(() => setLoading(false));
  }, [archetypeId, isNew]);

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function handleSave() {
    if (!form.display_name) {
      toast.error("Display name is required");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const id = form.id || slugify(form.display_name);
        const { createStudioArchetype } = await import("@/lib/studio-api");
        await createStudioArchetype({
          id,
          display_name: form.display_name,
          description: form.description || undefined,
          domain: form.domain,
          prompt_sections: sections,
          skills,
          config_schema: configSchema,
        });
        toast.success("Archetype created");
        router.push(`/studio/admin/archetypes/${id}`);
      } else {
        await updateStudioArchetype(archetypeId, {
          display_name: form.display_name,
          description: form.description || undefined,
          domain: form.domain,
          prompt_sections: sections,
          skills,
          config_schema: configSchema,
        });
        toast.success("Archetype updated");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteStudioArchetype(archetypeId);
      toast.success("Archetype deleted");
      router.push("/studio/admin/archetypes");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  // ─── Section Helpers ──────────────────────────────────────────────────────

  function addSection() {
    setSections((prev) => [
      ...prev,
      { slug: "", display_name: "", description: "", default_content: "", variables: [] },
    ]);
  }

  function updateSection(idx: number, updates: Partial<ArchetypePromptSection>) {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
  }

  function removeSection(idx: number) {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveSection(idx: number, direction: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  // ─── Skill Helpers ────────────────────────────────────────────────────────

  function addSkill() {
    setSkills((prev) => [...prev, { slug: "", enabled_by_default: true, default_config: {} }]);
  }

  function updateSkill(idx: number, updates: Partial<ArchetypeSkill>) {
    setSkills((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
  }

  function removeSkill(idx: number) {
    setSkills((prev) => prev.filter((_, i) => i !== idx));
  }

  // ─── Config Helpers ───────────────────────────────────────────────────────

  function addConfigParam() {
    setConfigSchema((prev) => [
      ...prev,
      { key: "", display_name: "", description: "", type: "string" as const, default: "" },
    ]);
  }

  function updateConfigParam(idx: number, updates: Partial<ArchetypeConfigParam>) {
    setConfigSchema((prev) => prev.map((p, i) => (i === idx ? { ...p, ...updates } : p)));
  }

  function removeConfigParam(idx: number) {
    setConfigSchema((prev) => prev.filter((_, i) => i !== idx));
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-[#161b22] rounded animate-pulse mb-4" />
        <div className="h-96 bg-[#161b22] rounded-xl animate-pulse border border-[#30363d]" />
      </div>
    );
  }

  const tabs = [
    { label: "Prompt Sections", value: "sections" as const, count: sections.length },
    { label: "Skills", value: "skills" as const, count: skills.length },
    { label: "Config Schema", value: "config" as const, count: configSchema.length },
  ];

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-[#f0f6fc] mb-6">
        {isNew ? "Create Archetype" : `Edit: ${form.display_name}`}
      </h1>

      {/* Metadata */}
      <div className="space-y-4 mb-8">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  display_name: name,
                  ...(isNew ? { id: slugify(name) } : {}),
                }));
              }}
              placeholder="e.g., Patient Math Tutor"
              className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] text-sm"
            />
          </div>
          {isNew && (
            <div>
              <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">ID (slug)</label>
              <input
                type="text"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                placeholder="patient-math-tutor"
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] text-sm font-mono"
              />
            </div>
          )}
          <div className={isNew ? "" : ""}>
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
        </div>
        <div>
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            placeholder="What kind of agents does this archetype produce?"
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] text-sm resize-none"
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 bg-[#161b22] rounded-lg border border-[#30363d] w-fit">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setActiveTab(t.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === t.value ? "bg-[#21262d] text-[#f0f6fc]" : "text-[#8b949e] hover:text-[#f0f6fc]"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Prompt Sections Tab */}
      {activeTab === "sections" && (
        <div className="space-y-4">
          {sections.map((section, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-[#30363d] bg-[#161b22] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#484f58] font-mono">Section {idx + 1}</span>
                <div className="flex gap-1">
                  <button onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="px-2 py-1 text-xs text-[#8b949e] hover:text-[#f0f6fc] disabled:opacity-30">Up</button>
                  <button onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1} className="px-2 py-1 text-xs text-[#8b949e] hover:text-[#f0f6fc] disabled:opacity-30">Down</button>
                  <button onClick={() => removeSection(idx)} className="px-2 py-1 text-xs text-red-400 hover:text-red-300">Remove</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">Slug</label>
                  <input
                    type="text"
                    value={section.slug}
                    onChange={(e) => updateSection(idx, { slug: e.target.value })}
                    placeholder="personality"
                    className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm font-mono focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">Display Name</label>
                  <input
                    type="text"
                    value={section.display_name}
                    onChange={(e) => updateSection(idx, { display_name: e.target.value })}
                    placeholder="Personality"
                    className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">Description</label>
                <input
                  type="text"
                  value={section.description}
                  onChange={(e) => updateSection(idx, { description: e.target.value })}
                  placeholder="What this prompt section defines"
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">Default Content</label>
                <textarea
                  value={section.default_content}
                  onChange={(e) => updateSection(idx, { default_content: e.target.value })}
                  rows={4}
                  placeholder="Default prompt content for this section..."
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm font-mono focus:outline-none focus:border-[#58a6ff] resize-none"
                />
              </div>
            </div>
          ))}
          <button
            onClick={addSection}
            className="w-full py-3 rounded-xl border border-dashed border-[#30363d] text-sm text-[#8b949e] hover:text-[#f0f6fc] hover:border-[#58a6ff]/50 transition-colors"
          >
            + Add Prompt Section
          </button>
        </div>
      )}

      {/* Skills Tab */}
      {activeTab === "skills" && (
        <div className="space-y-4">
          {skills.map((skill, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-[#30363d] bg-[#161b22] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#484f58] font-mono">Skill {idx + 1}</span>
                <button onClick={() => removeSkill(idx)} className="px-2 py-1 text-xs text-red-400 hover:text-red-300">Remove</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">Skill Slug</label>
                  <input
                    type="text"
                    value={skill.slug}
                    onChange={(e) => updateSkill(idx, { slug: e.target.value })}
                    placeholder="whiteboard_teaching"
                    className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm font-mono focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-[#f0f6fc]">
                    <button
                      onClick={() => updateSkill(idx, { enabled_by_default: !skill.enabled_by_default })}
                      className={`w-10 h-6 rounded-full transition-colors ${skill.enabled_by_default ? "bg-[#58a6ff]" : "bg-[#30363d]"}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${skill.enabled_by_default ? "translate-x-4" : ""}`} />
                    </button>
                    Enabled by default
                  </label>
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={addSkill}
            className="w-full py-3 rounded-xl border border-dashed border-[#30363d] text-sm text-[#8b949e] hover:text-[#f0f6fc] hover:border-[#58a6ff]/50 transition-colors"
          >
            + Add Skill
          </button>
        </div>
      )}

      {/* Config Schema Tab */}
      {activeTab === "config" && (
        <div className="space-y-4">
          {configSchema.map((param, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-[#30363d] bg-[#161b22] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#484f58] font-mono">Parameter {idx + 1}</span>
                <button onClick={() => removeConfigParam(idx)} className="px-2 py-1 text-xs text-red-400 hover:text-red-300">Remove</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">Key</label>
                  <input
                    type="text"
                    value={param.key}
                    onChange={(e) => updateConfigParam(idx, { key: e.target.value })}
                    placeholder="voice"
                    className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm font-mono focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">Display Name</label>
                  <input
                    type="text"
                    value={param.display_name}
                    onChange={(e) => updateConfigParam(idx, { display_name: e.target.value })}
                    placeholder="Voice"
                    className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">Type</label>
                  <select
                    value={param.type}
                    onChange={(e) => updateConfigParam(idx, { type: e.target.value as typeof param.type })}
                    className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                  >
                    {PARAM_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">Description</label>
                <input
                  type="text"
                  value={param.description}
                  onChange={(e) => updateConfigParam(idx, { description: e.target.value })}
                  placeholder="What this parameter controls"
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">Default Value</label>
                  <input
                    type="text"
                    value={String(param.default ?? "")}
                    onChange={(e) => {
                      let val: unknown = e.target.value;
                      if (param.type === "number") val = Number(e.target.value) || 0;
                      if (param.type === "boolean") val = e.target.value === "true";
                      updateConfigParam(idx, { default: val });
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
                {param.type === "number" && (
                  <>
                    <div>
                      <label className="block text-xs text-[#8b949e] mb-1">Min</label>
                      <input
                        type="number"
                        value={param.min ?? ""}
                        onChange={(e) => updateConfigParam(idx, { min: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8b949e] mb-1">Max</label>
                      <input
                        type="number"
                        value={param.max ?? ""}
                        onChange={(e) => updateConfigParam(idx, { max: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                      />
                    </div>
                  </>
                )}
                {param.type === "select" && (
                  <div className="col-span-2">
                    <label className="block text-xs text-[#8b949e] mb-1">Options (comma-separated)</label>
                    <input
                      type="text"
                      value={(param.options || []).join(", ")}
                      onChange={(e) => updateConfigParam(idx, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="option1, option2, option3"
                      className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={addConfigParam}
            className="w-full py-3 rounded-xl border border-dashed border-[#30363d] text-sm text-[#8b949e] hover:text-[#f0f6fc] hover:border-[#58a6ff]/50 transition-colors"
          >
            + Add Config Parameter
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 mt-8 pt-6 border-t border-[#30363d]">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 transition-colors"
        >
          {saving ? "Saving..." : isNew ? "Create Archetype" : "Save Changes"}
        </button>
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm border border-[#30363d] hover:bg-[#30363d] transition-colors"
        >
          Cancel
        </button>
        {!isNew && (
          <div className="ml-auto">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/30 hover:bg-red-500/20 transition-colors"
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-400">Are you sure?</span>
                <button onClick={handleDelete} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors">Confirm</button>
                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm border border-[#30363d] hover:bg-[#30363d] transition-colors">Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
