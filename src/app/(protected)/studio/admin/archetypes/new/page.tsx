"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchStudioArchetypes,
  fetchStudioArchetype,
  createStudioArchetype,
} from "@/lib/studio-api";
import type {
  StudioArchetypeSummary,
  ArchetypePromptSection,
  ArchetypeSkill,
  ArchetypeConfigParam,
} from "@/types/studio";
import { toast } from "sonner";

export default function CreateArchetypePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [existingArchetypes, setExistingArchetypes] = useState<StudioArchetypeSummary[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [copyFromId, setCopyFromId] = useState<string>("");
  const [copying, setCopying] = useState(false);

  const [form, setForm] = useState({
    id: "",
    display_name: "",
    description: "",
    domain: "general",
  });

  const [sections, setSections] = useState<ArchetypePromptSection[]>([]);
  const [skills, setSkills] = useState<ArchetypeSkill[]>([]);
  const [configSchema, setConfigSchema] = useState<ArchetypeConfigParam[]>([]);

  useEffect(() => {
    fetchStudioArchetypes()
      .then(setExistingArchetypes)
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, []);

  function slugify(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, display_name: name, id: slugify(name) }));
  }

  async function handleCopyFrom(archetypeId: string) {
    if (!archetypeId) {
      setSections([]);
      setSkills([]);
      setConfigSchema([]);
      setCopyFromId("");
      return;
    }
    setCopyFromId(archetypeId);
    setCopying(true);
    try {
      const arch = await fetchStudioArchetype(archetypeId);
      setSections(arch.prompt_sections || []);
      setSkills(arch.skills || []);
      setConfigSchema(arch.config_schema || []);
      if (!form.display_name) {
        setForm((f) => ({
          ...f,
          display_name: `${arch.display_name} (Copy)`,
          id: slugify(`${arch.display_name} copy`),
          description: arch.description || "",
          domain: arch.domain,
        }));
      }
      toast.success(`Pre-filled from "${arch.display_name}"`);
    } catch {
      toast.error("Failed to load archetype");
    } finally {
      setCopying(false);
    }
  }

  async function handleSave() {
    if (!form.id || !form.display_name) {
      toast.error("Name and ID are required");
      return;
    }
    setSaving(true);
    try {
      await createStudioArchetype({
        id: form.id,
        display_name: form.display_name,
        description: form.description || undefined,
        domain: form.domain,
        prompt_sections: sections,
        skills,
        config_schema: configSchema,
      });
      toast.success("Archetype created");
      router.push(`/studio/admin/archetypes/${form.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create archetype");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-[#f0f6fc] mb-6">Create Archetype</h1>

      {/* Copy from existing */}
      {!loadingExisting && existingArchetypes.length > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-[#30363d] bg-[#161b22]">
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">
            Copy from existing archetype
          </label>
          <p className="text-xs text-[#8b949e] mb-3">
            Pre-fill sections, skills, and config from another archetype.
          </p>
          <div className="flex gap-2">
            <select
              value={copyFromId}
              onChange={(e) => handleCopyFrom(e.target.value)}
              disabled={copying}
              className="flex-1 px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
            >
              <option value="">Start from scratch</option>
              {existingArchetypes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name} ({a.prompt_sections_count} sections, {a.skills_count} skills)
                </option>
              ))}
            </select>
            {copying && (
              <div className="flex items-center px-3 text-xs text-[#8b949e]">Loading...</div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Display Name</label>
          <input
            type="text"
            value={form.display_name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g., Patient Math Tutor"
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
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="What kind of agents does this archetype produce?"
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] text-sm resize-none"
          />
        </div>

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

        {/* Summary of pre-filled content */}
        {(sections.length > 0 || skills.length > 0 || configSchema.length > 0) && (
          <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
            <p className="text-xs font-medium text-[#8b949e] mb-2">Pre-filled content:</p>
            <div className="flex gap-4 text-xs text-[#484f58]">
              <span>{sections.length} prompt sections</span>
              <span>{skills.length} skills</span>
              <span>{configSchema.length} config params</span>
            </div>
            <p className="text-xs text-[#484f58] mt-1">
              You can edit these after creation in the archetype editor.
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSave}
            disabled={saving || !form.id || !form.display_name}
            className="px-5 py-2.5 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Creating..." : "Create Archetype"}
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
