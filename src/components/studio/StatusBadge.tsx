"use client";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  archived: "bg-red-500/20 text-red-400 border-red-500/30",
  staging: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  live: "bg-green-500/20 text-green-400 border-green-500/30",
  retired: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  published: "bg-green-500/20 text-green-400 border-green-500/30",
};

export function StatusBadge({ status }: { status: string }) {
  const colors = statusColors[status] || "bg-gray-500/20 text-gray-400 border-gray-500/30";

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors}`}
    >
      {status}
    </span>
  );
}
