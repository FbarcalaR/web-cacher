import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function GET(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
