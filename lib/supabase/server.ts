import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function cloudConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, "Cloud audio has not been configured on the server.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) }) },
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sign in to your library first.");
  const { data, error } = await adminSupabase().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session expired. Please sign in again.");
  return data.user;
}

export function apiError(error: unknown) {
  if (!(error instanceof HttpError)) console.error("[tome] request failed", error);
  return NextResponse.json({ ok: false, error: error instanceof HttpError ? error.message : "Request failed. Please retry." },
    { status: error instanceof HttpError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
}

export function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
