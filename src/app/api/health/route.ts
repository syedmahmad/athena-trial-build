import { supabase } from "@/lib/supabase/client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { error } = await supabase.from("users").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ok", database: "connected" });
  } catch {
    return NextResponse.json(
      { status: "error", database: "disconnected" },
      { status: 500 }
    );
  }
}
