"use server";

/**
 * What a director does on their approval page: approve, or ask a question.
 * Reached without signing in, so each is guarded by the link's token alone
 * (see lib/approval-core.ts).
 */
import { headers } from "next/headers";
import { approveByToken, queryByToken } from "./approval-core";

export interface ApproveState { problems: string[]; done?: "approved" | "query" }

export async function approveAction(_: ApproveState, f: FormData): Promise<ApproveState> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip");
  const r = await approveByToken(String(f.get("token") ?? ""), String(f.get("name") ?? ""), f.get("agreed") === "yes", { ip, ua: h.get("user-agent") });
  return r.ok ? { problems: [], done: "approved" } : { problems: [r.problem ?? "Couldn't record the approval."] };
}

export async function queryAction(_: ApproveState, f: FormData): Promise<ApproveState> {
  const r = await queryByToken(String(f.get("token") ?? ""), String(f.get("message") ?? ""));
  return r.ok ? { problems: [], done: "query" } : { problems: [r.problem ?? "Couldn't send the question."] };
}
