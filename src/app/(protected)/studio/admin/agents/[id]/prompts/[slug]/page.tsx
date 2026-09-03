"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchStudioPromptVersions,
  createStudioPromptVersion,
  publishStudioPromptVersion,
  archiveStudioPromptVersion,
  validateStudioPrompt,
} from "@/lib/studio-api";
import { StatusBadge } from "@/components/studio/StatusBadge";
import type { StudioPromptVersion, PromptVariable } from "@/types/studio";
import { toast } from "sonner";

export default function PromptVersionEditorPage() {
  const params = useParams();
  const agentId = params.id as string;
  const slug = params.slug as string;

  const [versions, setVersions] = useState<StudioPromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Editor state
  const [content, setContent] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [variables, setVariables] = useState<PromptVariable[]>([]);
  const [newVar, setNewVar] = useState({ name: "", type: "string" as "string" | "number" | "boolean", default: "", required: true });

  // Test output
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testErrors, setTestErrors] = useState<string[]>([]);

  useEffect(() => {
    loadVersions();
  }, [agentId, slug]);

  function loadVersions() {
    setLoading(true);
    fetchStudioPromptVersions(agentId, slug)
      .then((data) => {
        setVersions(data);
        // Load latest draft or published into editor
        const latest = data[0];
        if (latest) {
          setContent(latest.content);
          setVariables(latest.variables || []);
        }
      })
      .catch(() => toast.error("Failed to load versions"))
      .finally(() => setLoading(false));
  }

  async function handleSaveDraft() {
    if (!content.trim()) {
      toast.error("Content is required");
      return;
    }
    setSaving(true);
    try {
      await createStudioPromptVersion(agentId, slug, {
        content,
        variables,
        change_note: changeNote || undefined,
      });
      toast.success("Draft saved");
      setChangeNote("");
      loadVersions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestOutput(null);
    setTestErrors([]);
    try {
      const result = await validateStudioPrompt(agentId, {
        content,
        variables,
        context: {},
      });
      setTestOutput(result.resolved);
      setTestErrors(result.errors);
      if (result.errors.length === 0) {
        toast.success("Prompt validated successfully");
      } else {
        toast.error(`${result.errors.length} error(s) found`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setTesting(false);
    }
  }

  async function handlePublish(versionId: string) {
    try {
      await publishStudioPromptVersion(versionId);
      toast.success("Version published");
      loadVersions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    }
  }

  async function handleArchive(versionId: string) {
    try {
      await archiveStudioPromptVersion(versionId);
      toast.success("Version archived");
      loadVersions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    }
  }

  function addVariable() {
    if (!newVar.name.trim()) return;
    setVariables((v) => [...v, { ...newVar, name: newVar.name.trim(), default: newVar.default || undefined }]);
    setNewVar({ name: "", type: "string", default: "", required: true });
  }

  function removeVariable(name: string) {
    setVariables((v) => v.filter((x) => x.name !== name));
  }

  // Highlight {{variables}} in content display
  function renderHighlightedContent() {
    return content.replace(/\{\{(\w+)\}\}/g, "{{$1}}");
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-64 bg-[#161b22] rounded-xl animate-pulse border border-[#30363d]" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[#f0f6fc]">Prompt: {slug}</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Editor panel */}
        <div className="xl:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#f0f6fc] mb-1.5">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              className="w-full px-4 py-3 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] font-mono text-sm focus:outline-none focus:border-[#58a6ff] resize-y leading-relaxed"
              placeholder="Enter your prompt content here. Use {{variable_name}} for template variables."
            />
            {/* Variable highlighting hint */}
            {content.match(/\{\{(\w+)\}\}/g) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {Array.from(new Set(content.match(/\{\{(\w+)\}\}/g) || [])).map((v) => (
                  <span key={v} className="px-2 py-0.5 rounded bg-[#58a6ff]/10 text-[#58a6ff] text-xs font-mono border border-[#58a6ff]/30">
                    {v}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Variables editor */}
          <div>
            <label className="block text-sm font-medium text-[#f0f6fc] mb-2">Variables</label>
            {variables.length > 0 && (
              <div className="space-y-2 mb-3">
                {variables.map((v) => (
                  <div key={v.name} className="flex items-center gap-2 p-2 rounded-lg bg-[#161b22] border border-[#30363d]">
                    <span className="text-xs font-mono text-[#f0f6fc] flex-1">{v.name}</span>
                    <span className="text-[10px] text-[#8b949e] px-1.5 py-0.5 bg-[#21262d] rounded">{v.type}</span>
                    {v.required && <span className="text-[10px] text-[#ffa657]">required</span>}
                    {v.default && <span className="text-[10px] text-[#484f58]">= {v.default}</span>}
                    <button onClick={() => removeVariable(v.name)} className="text-[#8b949e] hover:text-red-400 text-xs">x</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <input
                type="text"
                value={newVar.name}
                onChange={(e) => setNewVar((v) => ({ ...v, name: e.target.value }))}
                placeholder="name"
                className="flex-1 px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-xs font-mono focus:outline-none focus:border-[#58a6ff]"
              />
              <select
                value={newVar.type}
                onChange={(e) => setNewVar((v) => ({ ...v, type: e.target.value as "string" | "number" | "boolean" }))}
                className="px-2 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-xs focus:outline-none focus:border-[#58a6ff]"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
              <input
                type="text"
                value={newVar.default}
                onChange={(e) => setNewVar((v) => ({ ...v, default: e.target.value }))}
                placeholder="default"
                className="w-24 px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-xs focus:outline-none focus:border-[#58a6ff]"
              />
              <label className="flex items-center gap-1 text-xs text-[#8b949e]">
                <input
                  type="checkbox"
                  checked={newVar.required}
                  onChange={(e) => setNewVar((v) => ({ ...v, required: e.target.checked }))}
                  className="accent-[#58a6ff]"
                />
                Req
              </label>
              <button
                onClick={addVariable}
                className="px-3 py-1.5 rounded-lg bg-[#21262d] text-[#f0f6fc] text-xs border border-[#30363d] hover:bg-[#30363d]"
              >
                Add
              </button>
            </div>
          </div>

          {/* Change note + actions */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-[#8b949e] mb-1">Change Note</label>
              <input
                type="text"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="What changed in this version?"
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {saving ? "Saving..." : "Save as Draft"}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm border border-[#30363d] hover:bg-[#30363d] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {testing ? "Testing..." : "Test Prompt"}
            </button>
          </div>

          {/* Test output */}
          {(testOutput || testErrors.length > 0) && (
            <div className="p-4 rounded-xl border border-[#30363d] bg-[#161b22]">
              <p className="text-xs font-medium text-[#8b949e] mb-2">Test Result</p>
              {testErrors.length > 0 && (
                <div className="space-y-1 mb-2">
                  {testErrors.map((e, i) => (
                    <p key={i} className="text-xs text-red-400">{e}</p>
                  ))}
                </div>
              )}
              {testOutput && (
                <pre className="text-xs text-[#f0f6fc] font-mono whitespace-pre-wrap overflow-auto max-h-48">
                  {testOutput}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Version history sidebar */}
        <div>
          <h2 className="text-sm font-medium text-[#f0f6fc] mb-3">Version History</h2>
          {versions.length === 0 ? (
            <p className="text-xs text-[#484f58]">No versions yet.</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {versions.map((v) => (
                <div key={v.id} className="p-3 rounded-lg border border-[#30363d] bg-[#161b22]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[#f0f6fc]">v{v.version}</span>
                    <StatusBadge status={v.status} />
                  </div>
                  {v.change_note && (
                    <p className="text-[10px] text-[#8b949e] mb-1">{v.change_note}</p>
                  )}
                  <p className="text-[10px] text-[#484f58] mb-2">
                    {new Date(v.created_at).toLocaleString()}
                  </p>
                  <div className="flex gap-1">
                    {v.status === "draft" && (
                      <button
                        onClick={() => handlePublish(v.id)}
                        className="px-2 py-1 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20"
                      >
                        Publish
                      </button>
                    )}
                    {v.status !== "archived" && (
                      <button
                        onClick={() => handleArchive(v.id)}
                        className="px-2 py-1 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                      >
                        Archive
                      </button>
                    )}
                    <button
                      onClick={() => { setContent(v.content); setVariables(v.variables || []); }}
                      className="px-2 py-1 rounded text-[10px] bg-[#21262d] text-[#8b949e] border border-[#30363d] hover:bg-[#30363d]"
                    >
                      Load
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
