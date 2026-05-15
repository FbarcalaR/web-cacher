"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  timingSafeEqual,
} from "@/lib/auth";

export async function login(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const rawNext = String(formData.get("next") ?? "");
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const expected = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expected || !secret) {
    throw new Error("APP_PASSWORD and SESSION_SECRET must be set");
  }

  if (!timingSafeEqual(password, expected)) {
    redirect(`/login?error=1${rawNext ? `&next=${encodeURIComponent(rawNext)}` : ""}`);
  }

  const token = await createSessionToken(secret);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  redirect(next);
}
