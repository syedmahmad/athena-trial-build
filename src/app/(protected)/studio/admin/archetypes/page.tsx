"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchStudioArchetypes } from "@/lib/studio-api";
import type { StudioArchetypeSummary } from "@/types/studio";
import { toast } from "sonner";

export default function ArchetypesListPage() {
  const router = useRouter();
  const [archetypes, setArchetypes] = useState<StudioArchetypeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudioArchetypes()
      .then(setArchetypes)
      .catch(() => toast.error("Failed to load archetypes"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-[#161b22] rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[#161b22] rounded-xl animate-pulse border border-[#30363d]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f6fc]">Archetypes</h1>
          <p className="text-sm text-[#8b949e] mt-1">
            Reusable recipes that define an agent's structure, prompts, skills, and config parameters.
          </p>
        </div>
        <button
          onClick={() => router.push("/studio/admin/archetypes/new")}
          className="px-4 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] transition-colors"
        >
          Create Archetype
        </button>
      </div>

      {archetypes.length === 0 ? (
        <div className="text-center py-16 text-[#8b949e]">
          <p className="text-lg mb-2">No archetypes yet</p>
          <p className="text-sm">Create one to start building agents from reusable templates.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {archetypes.map((arch) => (
            <button
              key={arch.id}
              onClick={() => router.push(`/studio/admin/archetypes/${arch.id}`)}
              className="w-full text-left p-5 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-[#58a6ff]/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-[#f0f6fc]">{arch.display_name}</h3>
                  <span className="text-xs text-[#484f58] font-mono">{arch.id}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#21262d] text-[#8b949e] border border-[#30363d]">
                    {arch.domain}
                  </span>
                </div>
              </div>
              {arch.description && (
                <p className="text-xs text-[#8b949e] mb-3">{arch.description}</p>
              )}
              <div className="flex gap-4 text-xs text-[#484f58]">
                <span>{arch.prompt_sections_count} prompt sections</span>
                <span>{arch.skills_count} skills</span>
                <span>{arch.config_params_count} config params</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
