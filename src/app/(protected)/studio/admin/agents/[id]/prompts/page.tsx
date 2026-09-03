"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchStudioPrompts, createStudioPrompt, fetchStudioAgent, fetchStudioArchetype } from "@/lib/studio-api";
import { StatusBadge } from "@/components/studio/StatusBadge";
import type { StudioPromptSlotSummary, ArchetypePromptSection } from "@/types/studio";
import { toast } from "sonner";

export default function AgentPromptsPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [prompts, setPrompts] = useState<StudioPromptSlotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSlot, setNewSlot] = useState({ slug: "", display_name: "", description: "" });

  // Archetype section definitions for labeling
  const [archetypeSections, setArchetypeSections] = useState<ArchetypePromptSection[]>([]);

  useEffect(() => {
    loadData();
  }, [agentId]);

  async function loadData() {
    setLoading(true);
    try {
      const [promptsData, agentData] = await Promise.all([
        fetchStudioPrompts(agentId),
        fetchStudioAgent(agentId).catch(() => null),
      ]);
      setPrompts(promptsData);

      // If agent has an archetype, load section definitions
      if (agentData?.archetype_id) {
        const archetype = await fetchStudioArchetype(agentData.archetype_id).catch(() => null);
        if (archetype?.prompt_sections) {
          setArchetypeSections(archetype.prompt_sections);
        }
      }
    } catch {
      toast.error("Failed to load prompts");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newSlot.slug || !newSlot.display_name) {
      toast.error("Slug and display name are required");
      return;
    }
    setSaving(true);
    try {
      await createStudioPrompt(agentId, {
        slug: newSlot.slug,
        display_name: newSlot.display_name,
        description: newSlot.description || undefined,
      });
      toast.success("Prompt slot created");
      setNewSlot({ slug: "", display_name: "", description: "" });
      setShowForm(false);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create prompt slot");
    } finally {
      setSaving(false);
    }
  }

  // Build a map of archetype section definitions by slug
  const archetypeMap = new Map(archetypeSections.map((s) => [s.slug, s]));

  // Sort prompts: archetype-defined sections first (in archetype order), then custom
  const sortedPrompts = [...prompts].sort((a, b) => {
    const aIdx = archetypeSections.findIndex((s) => s.slug === a.slug);
    const bIdx = archetypeSections.findIndex((s) => s.slug === b.slug);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return a.sort_order - b.sort_order;
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-48 bg-[#161b22] rounded-xl animate-pulse border border-[#30363d]" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f6fc]">Prompt Slots</h1>
          {archetypeSections.length > 0 && (
            <p className="text-xs text-[#8b949e] mt-1">
              Sections marked with a badge are defined by the archetype.
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] transition-colors"
        >
          {showForm ? "Cancel" : "Add Prompt Slot"}
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="mb-6 p-4 rounded-xl border border-[#30363d] bg-[#161b22] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8b949e] mb-1">Slug</label>
              <input
                type="text"
                value={newSlot.slug}
                onChange={(e) => setNewSlot((s) => ({ ...s, slug: e.target.value }))}
                placeholder="system-prompt"
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm font-mono focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#8b949e] mb-1">Display Name</label>
              <input
                type="text"
                value={newSlot.display_name}
                onChange={(e) => setNewSlot((s) => ({ ...s, display_name: e.target.value }))}
                placeholder="System Prompt"
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8b949e] mb-1">Description (optional)</label>
            <input
              type="text"
              value={newSlot.description}
              onChange={(e) => setNewSlot((s) => ({ ...s, description: e.target.value }))}
              placeholder="What this prompt slot is for"
              className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 transition-colors"
          >
            {saving ? "Creating..." : "Create Slot"}
          </button>
        </div>
      )}

      {/* Prompt list */}
      {sortedPrompts.length === 0 ? (
        <div className="text-center py-16 text-[#8b949e]">
          <p>No prompt slots yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedPrompts.map((slot) => {
            const archetypeDef = archetypeMap.get(slot.slug);
            return (
              <button
                key={slot.id}
                onClick={() => router.push(`/studio/admin/agents/${agentId}/prompts/${slot.slug}`)}
                className="w-full text-left p-4 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-[#58a6ff]/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium text-[#f0f6fc]">
                      {archetypeDef ? archetypeDef.display_name : slot.display_name}
                    </h3>
                    <span className="text-xs text-[#484f58] font-mono">{slot.slug}</span>
                    {archetypeDef && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#58a6ff]/10 text-[#58a6ff] border border-[#58a6ff]/20">
                        archetype
                      </span>
                    )}
                    {!archetypeDef && archetypeSections.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#ffa657]/10 text-[#ffa657] border border-[#ffa657]/20">
                        custom
                      </span>
                    )}
                  </div>
                  {slot.latest_version && (
                    <StatusBadge status={slot.latest_version.status} />
                  )}
                </div>
                <p className="text-xs text-[#8b949e] mb-2">
                  {archetypeDef?.description || slot.description || ""}
                </p>
                {slot.latest_version ? (
                  <p className="text-xs text-[#484f58] font-mono truncate">
                    {slot.latest_version.content.slice(0, 80)}
                    {slot.latest_version.content.length > 80 ? "..." : ""}
                  </p>
                ) : (
                  <p className="text-xs text-[#484f58] italic">No versions yet</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
