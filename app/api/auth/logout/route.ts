import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";

export async function POST() {
  try {
    await endSession();
  } catch (error) {
    // Le cookie est supprime meme si l'invalidation en base echoue.
    console.error("Logout error:", error);
  }
  return NextResponse.json({ ok: true });
}
