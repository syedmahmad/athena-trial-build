"use client";

import { useState } from "react";
import { UserPlus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFriends, useInviteFriend, useRespondToFriendRequest } from "@/hooks/use-friends";

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

  const { incoming } = useFriends();
  const inviteMutation = useInviteFriend();
  const respondMutation = useRespondToFriendRequest();

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate(
      { email: inviteEmail.trim() },
      { onSuccess: () => { setInviteEmail(""); setShowInvite(false); } }
    );
  }

  const sorted = [...friends].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="border bg-card p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Friends&apos; Scores
      </h3>

      {incoming.length > 0 && (
        <div className="mb-4 space-y-2 border-b pb-4">
          {incoming.map((req) => (
            <div key={req.friendshipId} className="flex items-center gap-2">
              <UserPlus className="h-3.5 w-3.5 shrink-0 text-primary" />
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">
                  {req.displayName || "Someone"}
                </span>{" "}
                <span className="text-muted-foreground">wants to be friends</span>
              </p>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-athena-success"
                disabled={respondMutation.isPending}
                onClick={() =>
                  respondMutation.mutate({ friendshipId: req.friendshipId, action: "accept" })
                }
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                disabled={respondMutation.isPending}
                onClick={() =>
                  respondMutation.mutate({ friendshipId: req.friendshipId, action: "decline" })
                }
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

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
          <Button size="sm" onClick={handleInvite} disabled={inviteMutation.isPending}>
            {inviteMutation.isPending ? "..." : "Send"}
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
