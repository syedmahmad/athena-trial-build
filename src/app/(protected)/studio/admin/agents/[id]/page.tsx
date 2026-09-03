"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { fetchStudioAgent, updateStudioAgent, deleteStudioAgent, cloneStudioAgent } from "@/lib/studio-api";
import { StatusBadge } from "@/components/studio/StatusBadge";
import type { StudioAgentDetail } from "@/types/studio";
import { toast } from "sonner";

const COLORS = ["#58a6ff", "#f78166", "#7ee787", "#d2a8ff", "#ffa657", "#79c0ff", "#ff7b72", "#56d364"];

const SUB_TABS = [
  { label: "Overview", path: "" },
  { label: "Config", path: "/config" },
  { label: "Prompts", path: "/prompts" },
  { label: "Deployments", path: "/deployments" },
  { label: "Sessions", path: "/sessions" },
];

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<StudioAgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneForm, setCloneForm] = useState({ new_id: "", display_name: "", tagline: "" });
  const [cloning, setCloning] = useState(false);

  const [form, setForm] = useState({
    display_name: "",
    tagline: "",
    description: "",
    domain: "general" as "math" | "rw" | "general",
    avatar_color: "#58a6ff",
    status: "draft" as "draft" | "active" | "archived",
  });

  useEffect(() => {
    fetchStudioAgent(agentId)
      .then((data) => {
        setAgent(data);
        setForm({
          display_name: data.display_name,
          tagline: data.tagline || "",
          description: data.description || "",
          domain: data.domain as "math" | "rw" | "general",
          avatar_color: data.avatar_color,
          status: data.status,
        });
      })
      .catch(() => toast.error("Failed to load agent"))
      .finally(() => setLoading(false));
  }, [agentId]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateStudioAgent(agentId, {
        display_name: form.display_name,
        tagline: form.tagline || undefined,
        description: form.description || undefined,
        domain: form.domain,
        avatar_color: form.avatar_color,
        status: form.status,
      });
      toast.success("Agent updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update agent");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteStudioAgent(agentId);
      toast.success("Agent deleted");
      router.push("/studio/admin/agents");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete agent");
    }
  }

  async function handleClone() {
    if (!cloneForm.new_id || !cloneForm.display_name) {
      toast.error("ID and display name are required");
      return;
    }
    setCloning(true);
    try {
      await cloneStudioAgent(agentId, {
        new_id: cloneForm.new_id,
        display_name: cloneForm.display_name,
        tagline: cloneForm.tagline || undefined,
      });
      toast.success("Agent cloned successfully");
      router.push(`/studio/admin/agents/${cloneForm.new_id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clone agent");
    } finally {
      setCloning(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-[#161b22] rounded animate-pulse mb-4" />
        <div className="h-64 bg-[#161b22] rounded-xl animate-pulse border border-[#30363d]" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-8 text-[#8b949e]">Agent not found.</div>
    );
  }

  const basePath = `/studio/admin/agents/${agentId}`;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: agent.avatar_color }}
        >
          {agent.display_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#f0f6fc]">{agent.display_name}</h1>
          <p className="text-sm text-[#8b949e] font-mono">{agent.id}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {agent.archetype_id && (
            <span className="px-2 py-1 rounded text-xs font-mono text-[#8b949e] bg-[#21262d] border border-[#30363d]">
              archetype: {agent.archetype_id}
            </span>
          )}
          <button
            onClick={() => {
              setCloneForm({ new_id: "", display_name: "", tagline: "" });
              setShowCloneDialog(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-[#21262d] text-[#f0f6fc] text-xs border border-[#30363d] hover:bg-[#30363d] transition-colors"
          >
            Clone
          </button>
          <StatusBadge status={agent.status} />
        </div>
      </div>

      {/* Clone Dialog */}
      {showCloneDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-[#f0f6fc] mb-4">Clone Agent</h2>
            <p className="text-sm text-[#8b949e] mb-4">
              Create a copy of <span className="font-medium text-[#f0f6fc]">{agent.display_name}</span> with all prompts, config, and skills.
            </p>
            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-xs font-medium text-[#8b949e] mb-1">Display Name</label>
                <input
                  type="text"
                  value={cloneForm.display_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setCloneForm((f) => ({
                      ...f,
                      display_name: name,
                      new_id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                    }));
                  }}
                  placeholder="New Agent Name"
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8b949e] mb-1">ID (slug)</label>
                <input
                  type="text"
                  value={cloneForm.new_id}
                  onChange={(e) => setCloneForm((f) => ({ ...f, new_id: e.target.value }))}
                  placeholder="new-agent-id"
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm font-mono focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8b949e] mb-1">Tagline (optional)</label>
                <input
                  type="text"
                  value={cloneForm.tagline}
                  onChange={(e) => setCloneForm((f) => ({ ...f, tagline: e.target.value }))}
                  placeholder="Short description"
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClone}
                disabled={cloning || !cloneForm.new_id || !cloneForm.display_name}
                className="px-4 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 transition-colors"
              >
                {cloning ? "Cloning..." : "Clone Agent"}
              </button>
              <button
                onClick={() => setShowCloneDialog(false)}
                className="px-4 py-2 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm border border-[#30363d] hover:bg-[#30363d] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex gap-1 mb-8 border-b border-[#30363d]">
        {SUB_TABS.map((tab) => {
          const href = basePath + tab.path;
          const isActive = pathname === href;
          return (
            <Link
              key={tab.path}
              href={href}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-[#58a6ff] text-[#f0f6fc]"
                  : "border-transparent text-[#8b949e] hover:text-[#f0f6fc]"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Edit form */}
      <div className="max-w-2xl space-y-5">
        <div>
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Display Name</label>
          <input
            type="text"
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] focus:outline-none focus:border-[#58a6ff] text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Tagline</label>
          <input
            type="text"
            value={form.tagline}
            onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] focus:outline-none focus:border-[#58a6ff] text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] focus:outline-none focus:border-[#58a6ff] text-sm resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Domain</label>
            <select
              value={form.domain}
              onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value as typeof form.domain }))}
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

        <div className="flex items-center gap-3 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-5 py-2.5 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/30 hover:bg-red-500/20 transition-colors ml-auto"
            >
              Delete Agent
            </button>
          ) : (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-red-400">Are you sure?</span>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm border border-[#30363d] hover:bg-[#30363d] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
