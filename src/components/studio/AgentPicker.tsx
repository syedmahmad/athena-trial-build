"use client";

import { useEffect, useState } from "react";
import { fetchStudioAgents } from "@/lib/studio-api";
import type { StudioAgent } from "@/types/studio";
import { toast } from "sonner";

interface AgentPickerProps {
  onSelect: (agent: StudioAgent) => void;
  selectedId?: string;
}

export function AgentPicker({ onSelect, selectedId }: AgentPickerProps) {
  const [agents, setAgents] = useState<StudioAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudioAgents({ status: "active" })
      .then(setAgents)
      .catch(() => toast.error("Failed to load agents"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl bg-[#161b22] animate-pulse border border-[#30363d]"
          />
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-12 text-[#8b949e]">
        <p className="text-lg">No active agents available</p>
        <p className="text-sm mt-1">Create agents in the admin panel first.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map((agent) => {
        const isSelected = selectedId === agent.id;
        return (
          <button
            key={agent.id}
            onClick={() => onSelect(agent)}
            className={`relative p-5 rounded-xl border text-left transition-all duration-150 ${
              isSelected
                ? "border-[#58a6ff] bg-[#58a6ff]/10 ring-1 ring-[#58a6ff]"
                : "border-[#30363d] bg-[#161b22] hover:border-[#58a6ff]/50 hover:bg-[#161b22]/80"
            }`}
          >
            {isSelected && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#58a6ff] flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <div
              className="w-10 h-10 rounded-lg mb-3 flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: agent.avatar_color || "#58a6ff" }}
            >
              {agent.display_name.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-[#f0f6fc] font-semibold text-sm">{agent.display_name}</h3>
            {agent.tagline && (
              <p className="text-[#8b949e] text-xs mt-1 line-clamp-2">{agent.tagline}</p>
            )}
            <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-medium bg-[#21262d] text-[#8b949e] border border-[#30363d]">
              {agent.domain}
            </span>
          </button>
        );
      })}
    </div>
  );
}
