"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_TUTOR_CHARACTER,
  DEFAULT_TUTOR_VOICE,
  TUTOR_CHARACTER_STORAGE_KEY,
  TUTOR_VOICE_COOKIE,
  TUTOR_VOICE_STORAGE_KEY,
  getTutorCharacter,
  isTutorCharacterId,
  resolveEffectiveVoiceId,
  type TutorCharacterId,
  type TutorVoiceId,
} from "@/lib/tutor-characters";

type TutorCharacterContextValue = {
  characterId: TutorCharacterId;
  voiceId: TutorVoiceId;
  setCharacterId: (id: TutorCharacterId) => void;
  setVoiceId: (id: TutorVoiceId) => void;
  /** Convenience: replace character AND its default voice in one call. */
  selectCharacter: (id: TutorCharacterId) => void;
};

const TutorCharacterContext = createContext<TutorCharacterContextValue | null>(
  null,
);

// Local-tab change event so multiple consumers in the same tab stay
// in sync without depending on the cross-tab `storage` event.
const STORAGE_EVENT = "athena:tutor-character-change";

function subscribe(callback: () => void) {
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(STORAGE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(STORAGE_EVENT, handler);
  };
}

function readCharacterId(): TutorCharacterId {
  try {
    const stored = window.localStorage.getItem(TUTOR_CHARACTER_STORAGE_KEY);
    if (isTutorCharacterId(stored)) return stored;
  } catch {
    // localStorage can throw in private-mode browsers — silent fallback.
  }
  return DEFAULT_TUTOR_CHARACTER;
}

function readVoiceId(): TutorVoiceId {
  try {
    const stored = window.localStorage.getItem(TUTOR_VOICE_STORAGE_KEY);
    if (typeof stored === "string" && stored.length > 0) return stored;
  } catch {
    // ignore
  }
  return DEFAULT_TUTOR_VOICE;
}

// useSyncExternalStore demands a stable reference between calls when
// nothing has changed; otherwise React re-renders on every subscribe
// fire. Cache the {character, voice} tuple and only mint a new object
// when one actually changes.
let snapshotCache: {
  character: TutorCharacterId;
  voice: TutorVoiceId;
  ref: { character: TutorCharacterId; voice: TutorVoiceId };
} | null = null;

function getSnapshot() {
  const character = readCharacterId();
  const voice = readVoiceId();
  if (
    snapshotCache &&
    snapshotCache.character === character &&
    snapshotCache.voice === voice
  ) {
    return snapshotCache.ref;
  }
  const ref = { character, voice };
  snapshotCache = { character, voice, ref };
  return ref;
}

const SERVER_SNAPSHOT = {
  character: DEFAULT_TUTOR_CHARACTER,
  voice: DEFAULT_TUTOR_VOICE,
};

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/** Write the chosen voice to a cookie so the server-side TTS route can
 *  pick it up without every client caller threading voiceId through.
 *  "default" clears the cookie so the route falls back to the env. */
function writeVoiceCookie(voiceId: TutorVoiceId) {
  if (typeof document === "undefined") return;
  const resolved = resolveEffectiveVoiceId(voiceId);
  if (!resolved) {
    document.cookie = `${TUTOR_VOICE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    return;
  }
  // 1 year — preference is sticky until the user picks again.
  document.cookie = `${TUTOR_VOICE_COOKIE}=${encodeURIComponent(
    resolved,
  )}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Best-effort upsert to user_preferences. Fire-and-forget — the
 *  localStorage write is the source of truth client-side; DB sync is
 *  for cross-device persistence. */
async function syncToServer(
  characterId: TutorCharacterId,
  voiceId: TutorVoiceId,
) {
  try {
    await fetch("/api/tutor-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId, voiceId }),
    });
  } catch {
    // Offline / 401 / 500 — keep the local-only choice; we'll resync on
    // the next change. No toast: this is background work.
  }
}

export function TutorCharacterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // On first mount in the browser, pull the server-side preference and
  // hydrate localStorage if the server has a different (newer) value.
  // Server wins on initial load so a user who switched characters on
  // another device sees their choice when they return.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tutor-preferences", { method: "GET" });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          characterId?: string | null;
          voiceId?: string | null;
        };
        if (cancelled) return;
        const incomingCharacter = isTutorCharacterId(json.characterId)
          ? json.characterId
          : null;
        const incomingVoice =
          typeof json.voiceId === "string" && json.voiceId.length > 0
            ? json.voiceId
            : null;
        const localCharacter = readCharacterId();
        const localVoice = readVoiceId();
        let changed = false;
        if (incomingCharacter && incomingCharacter !== localCharacter) {
          window.localStorage.setItem(
            TUTOR_CHARACTER_STORAGE_KEY,
            incomingCharacter,
          );
          changed = true;
        }
        if (incomingVoice && incomingVoice !== localVoice) {
          window.localStorage.setItem(TUTOR_VOICE_STORAGE_KEY, incomingVoice);
          writeVoiceCookie(incomingVoice);
          changed = true;
        }
        if (changed) {
          window.dispatchEvent(new Event(STORAGE_EVENT));
        }
      } catch {
        // Server unreachable / not signed in — stay on local values.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the cookie in lockstep with the current voice. Runs on every
  // snapshot change so a tab opened after a voice change in another
  // tab also picks up the right cookie.
  useEffect(() => {
    writeVoiceCookie(snapshot.voice);
  }, [snapshot.voice]);

  const setCharacterId = useCallback((id: TutorCharacterId) => {
    try {
      window.localStorage.setItem(TUTOR_CHARACTER_STORAGE_KEY, id);
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch {
      // ignore
    }
    void syncToServer(id, readVoiceId());
  }, []);

  const setVoiceId = useCallback((id: TutorVoiceId) => {
    try {
      window.localStorage.setItem(TUTOR_VOICE_STORAGE_KEY, id);
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch {
      // ignore
    }
    writeVoiceCookie(id);
    void syncToServer(readCharacterId(), id);
  }, []);

  const selectCharacter = useCallback((id: TutorCharacterId) => {
    const character = getTutorCharacter(id);
    const nextVoice = character.defaultVoiceId ?? DEFAULT_TUTOR_VOICE;
    try {
      window.localStorage.setItem(TUTOR_CHARACTER_STORAGE_KEY, id);
      window.localStorage.setItem(TUTOR_VOICE_STORAGE_KEY, nextVoice);
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch {
      // ignore
    }
    writeVoiceCookie(nextVoice);
    void syncToServer(id, nextVoice);
  }, []);

  const value = useMemo(
    () => ({
      characterId: snapshot.character,
      voiceId: snapshot.voice,
      setCharacterId,
      setVoiceId,
      selectCharacter,
    }),
    [
      snapshot.character,
      snapshot.voice,
      setCharacterId,
      setVoiceId,
      selectCharacter,
    ],
  );

  return (
    <TutorCharacterContext.Provider value={value}>
      {children}
    </TutorCharacterContext.Provider>
  );
}

export function useTutorCharacter(): TutorCharacterContextValue {
  const ctx = useContext(TutorCharacterContext);
  if (!ctx) {
    // Fallback used when a consumer renders outside the provider tree
    // (e.g. Storybook). Reads from localStorage but can't mutate.
    return {
      characterId: DEFAULT_TUTOR_CHARACTER,
      voiceId: DEFAULT_TUTOR_VOICE,
      setCharacterId: () => {},
      setVoiceId: () => {},
      selectCharacter: () => {},
    };
  }
  return ctx;
}
