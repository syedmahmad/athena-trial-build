"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchStudioAgents } from "@/lib/studio-api";
import { StatusBadge } from "@/components/studio/StatusBadge";
import type { StudioAgent } from "@/types/studio";
import { toast } from "sonner";

type FilterStatus = "all" | "active" | "draft" | "archived";

export default function StudioAgentsListPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<StudioAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");

  useEffect(() => {
    fetchStudioAgents()
      .then(setAgents)
      .catch(() => toast.error("Failed to load agents"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? agents : agents.filter((a) => a.status === filter);

  const tabs: { label: string; value: FilterStatus }[] = [
    { label: "All", value: "all" },
    { label: "Active", value: "active" },
    { label: "Draft", value: "draft" },
    { label: "Archived", value: "archived" },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#f0f6fc]">Agents</h1>
        <button
          onClick={() => router.push("/studio/admin/agents/new")}
          className="px-4 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] transition-colors"
        >
          New Agent
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-[#161b22] rounded-lg border border-[#30363d] w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === tab.value
                ? "bg-[#21262d] text-[#f0f6fc]"
                : "text-[#8b949e] hover:text-[#f0f6fc]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-[#161b22] animate-pulse border border-[#30363d]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#8b949e]">
          <p>No agents found.</p>
        </div>
      ) : (
        <div className="border border-[#30363d] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#30363d] bg-[#161b22]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b949e] uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b949e] uppercase tracking-wider">Domain</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b949e] uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b949e] uppercase tracking-wider">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((agent) => (
                <tr
                  key={agent.id}
                  onClick={() => router.push(`/studio/admin/agents/${agent.id}`)}
                  className="border-b border-[#30363d] last:border-0 hover:bg-[#161b22] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: agent.avatar_color || "#58a6ff" }}
                      />
                      <span className="text-sm text-[#f0f6fc] font-medium">{agent.display_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#8b949e]">{agent.domain}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={agent.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-[#8b949e]">
                    {new Date(agent.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
