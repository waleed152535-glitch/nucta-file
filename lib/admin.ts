import { currentUser } from "./auth";

/** The developer consoles are for Nucta File's own staff (NUCTA_ADMIN_EMAILS) only. */
export async function requireAdmin(): Promise<void> {
  const u = await currentUser();
  if (!u?.admin) throw new Error("This is for Nucta File's administrators only.");
}
