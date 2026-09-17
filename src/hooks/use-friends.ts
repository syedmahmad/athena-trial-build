"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type Friend = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type IncomingFriendRequest = {
  friendshipId: string;
  fromUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

type FriendsResponse = {
  friends: Friend[];
  incoming: IncomingFriendRequest[];
};

export function useFriends() {
  const { data, isLoading, isError } = useQuery<FriendsResponse>({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await fetch("/api/friends");
      if (!res.ok) throw new Error("Failed to load friends");
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load friends");
  }, [isError]);

  return {
    friends: data?.friends ?? [],
    incoming: data?.incoming ?? [],
    isLoading,
  };
}

export function useInviteFriend() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, { email: string }>({
    mutationFn: async ({ email }) => {
      const res = await fetch("/api/friends/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to send invite");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Friend request sent!");
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
}

export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation<
    unknown,
    Error,
    { friendshipId: string; action: "accept" | "decline" }
  >({
    mutationFn: async (payload) => {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to respond to friend request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
}
