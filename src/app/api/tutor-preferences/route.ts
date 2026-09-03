// Read/write the user's tutor character + voice preference.
// Backs the cross-device sync used by TutorCharacterProvider — the
// localStorage write is the source of truth client-side, this just
// mirrors it to user_preferences so other devices pick it up.

import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import {
  getUserPreferences,
  upsertUserPreferences,
} from "@/lib/db/queries/preferences";
import { isTutorCharacterId } from "@/lib/tutor-characters";

export async function GET() {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(userId);
  if (!user) {
    // Provider treats 404 the same as no preference — falls back to
    // localStorage / app defaults. Don't 500 the unsigned-in path.
    return NextResponse.json({ characterId: null, voiceId: null });
  }
  const prefs = await getUserPreferences(user.id);
  return NextResponse.json({
    characterId: prefs?.tutorCharacterId ?? null,
    voiceId: prefs?.tutorVoiceId ?? null,
  });
}

export async function PUT(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: { characterId?: unknown; voiceId?: unknown };
  try {
    body = (await req.json()) as { characterId?: unknown; voiceId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: { tutorCharacterId?: string | null; tutorVoiceId?: string | null } = {};
  if (body.characterId !== undefined) {
    if (body.characterId === null) {
      update.tutorCharacterId = null;
    } else if (isTutorCharacterId(body.characterId)) {
      update.tutorCharacterId = body.characterId;
    } else {
      return NextResponse.json(
        { error: "Invalid characterId" },
        { status: 400 },
      );
    }
  }
  if (body.voiceId !== undefined) {
    if (body.voiceId === null) {
      update.tutorVoiceId = null;
    } else if (typeof body.voiceId === "string" && body.voiceId.length <= 64) {
      // ElevenLabs ids are alphanumeric; the cap defends the DB column.
      update.tutorVoiceId = body.voiceId;
    } else {
      return NextResponse.json({ error: "Invalid voiceId" }, { status: 400 });
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noChange: true });
  }

  const prefs = await upsertUserPreferences(user.id, update);
  return NextResponse.json({
    ok: true,
    characterId: prefs?.tutorCharacterId ?? null,
    voiceId: prefs?.tutorVoiceId ?? null,
  });
}
