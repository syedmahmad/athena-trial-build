"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchStudioDeployments,
  fetchStudioPrompts,
  createStudioDeployment,
  promoteStudioDeployment,
  retireStudioDeployment,
  rollbackStudioDeployment,
} from "@/lib/studio-api";
import { StatusBadge } from "@/components/studio/StatusBadge";
import type { StudioDeployment, StudioPromptSlotSummary } from "@/types/studio";
import { toast } from "sonner";

export default function AgentDeploymentsPage() {
  const params = useParams();
  const agentId = params.id as string;

  const [deployments, setDeployments] = useState<StudioDeployment[]>([]);
  const [prompts, setPrompts] = useState<StudioPromptSlotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [promptPins, setPromptPins] = useState<Record<string, string>>({});
  const [changeNote, setChangeNote] = useState("");

  useEffect(() => {
    loadData();
  }, [agentId]);

  async function loadData() {
    setLoading(true);
    try {
      const [deps, prms] = await Promise.all([
        fetchStudioDeployments(agentId),
        fetchStudioPrompts(agentId),
      ]);
      setDeployments(deps);
      setPrompts(prms);
      // Initialize prompt pins with latest published version IDs
      const pins: Record<string, string> = {};
      prms.forEach((p) => {
        if (p.latest_version && p.latest_version.status === "published") {
          pins[p.slug] = p.latest_version.id;
        }
      });
      setPromptPins(pins);
    } catch {
      toast.error("Failed to load deployments");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (Object.keys(promptPins).length === 0) {
      toast.error("At least one prompt pin is required");
      return;
    }
    setSaving(true);
    try {
      await createStudioDeployment(agentId, {
        prompt_pins: promptPins,
        change_note: changeNote || undefined,
      });
      toast.success("Deployment created");
      setShowForm(false);
      setChangeNote("");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create deployment");
    } finally {
      setSaving(false);
    }
  }

  async function handlePromote(id: string) {
    try {
      await promoteStudioDeployment(id);
      toast.success("Deployment promoted to live");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to promote");
    }
  }

  async function handleRetire(id: string) {
    try {
      await retireStudioDeployment(id);
      toast.success("Deployment retired");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to retire");
    }
  }

  async function handleRollback(id: string) {
    try {
      await rollbackStudioDeployment(id);
      toast.success("Deployment rolled back");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rollback");
    }
  }

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
        <h1 className="text-2xl font-bold text-[#f0f6fc]">Deployments</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] transition-colors"
        >
          {showForm ? "Cancel" : "Create Deployment"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 p-5 rounded-xl border border-[#30363d] bg-[#161b22] space-y-4">
          <h3 className="text-sm font-medium text-[#f0f6fc]">Pin Prompt Versions</h3>
          {prompts.length === 0 ? (
            <p className="text-xs text-[#484f58]">No prompt slots configured.</p>
          ) : (
            <div className="space-y-2">
              {prompts.map((p) => (
                <div key={p.slug} className="flex items-center gap-3">
                  <span className="text-xs text-[#f0f6fc] font-mono w-40">{p.slug}</span>
                  <input
                    type="text"
                    value={promptPins[p.slug] || ""}
                    onChange={(e) => setPromptPins((pp) => ({ ...pp, [p.slug]: e.target.value }))}
                    placeholder={p.latest_version ? `Latest: ${p.latest_version.id.slice(0, 8)}...` : "No published version"}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-xs font-mono focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-[#8b949e] mb-1">Change Note</label>
            <input
              type="text"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Describe this deployment"
              className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 transition-colors"
          >
            {saving ? "Creating..." : "Deploy"}
          </button>
        </div>
      )}

      {/* Deployment list */}
      {deployments.length === 0 ? (
        <div className="text-center py-16 text-[#8b949e]">
          <p>No deployments yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deployments.map((dep) => (
            <div key={dep.id} className="p-4 rounded-xl border border-[#30363d] bg-[#161b22]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-[#f0f6fc]">v{dep.version}</span>
                  <StatusBadge status={dep.status} />
                </div>
                <span className="text-xs text-[#484f58]">
                  {new Date(dep.created_at).toLocaleString()}
                </span>
              </div>
              {dep.change_note && (
                <p className="text-xs text-[#8b949e] mb-2">{dep.change_note}</p>
              )}
              <div className="flex items-center gap-2 text-xs mb-3">
                <span className="text-[#484f58]">Pins:</span>
                {Object.entries(dep.prompt_pins).map(([slug, versionId]) => (
                  <span key={slug} className="px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] font-mono border border-[#30363d]">
                    {slug}: {(versionId as string).slice(0, 8)}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                {dep.status === "staging" && (
                  <button
                    onClick={() => handlePromote(dep.id)}
                    className="px-3 py-1.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20"
                  >
                    Promote to Live
                  </button>
                )}
                {dep.status === "live" && (
                  <button
                    onClick={() => handleRetire(dep.id)}
                    className="px-3 py-1.5 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                  >
                    Retire
                  </button>
                )}
                {dep.status === "retired" && (
                  <button
                    onClick={() => handleRollback(dep.id)}
                    className="px-3 py-1.5 rounded text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20"
                  >
                    Rollback
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
