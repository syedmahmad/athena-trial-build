"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type FriendScore = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  totalScore: number;
  weeklyDelta: number;
};

const AVATAR_COLORS = [
  "bg-red-400",
  "bg-pink-400",
  "bg-purple-400",
  "bg-blue-400",
  "bg-emerald-400",
  "bg-amber-400",
];

export function FriendsLeaderboard({ friends }: { friends: FriendScore[] }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/friends/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to send invite");
        return;
      }
      toast.success("Friend request sent!");
      setInviteEmail("");
      setShowInvite(false);
    } catch {
      toast.error("Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  const sorted = [...friends].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="border bg-card p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Friends&apos; Scores
      </h3>

      {sorted.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          No friends yet. Invite someone to compete!
        </p>
      ) : (
        <div className="mb-4 space-y-3">
          {sorted.map((friend, i) => (
            <div key={friend.id} className="flex items-center gap-3">
              <div
                className={`h-3 w-3 shrink-0 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {friend.displayName || "Unknown"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold tabular-nums">
                  {friend.totalScore}
                </p>
                {friend.weeklyDelta > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    +{friend.weeklyDelta}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showInvite ? (
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="friend@email.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            className="flex-1 border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <Button size="sm" onClick={handleInvite} disabled={inviting}>
            {inviting ? "..." : "Send"}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 uppercase tracking-wider text-xs"
          onClick={() => setShowInvite(true)}
        >
          Invite Friends
        </Button>
      )}
    </div>
  );
}
