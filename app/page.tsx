import { redirect } from "next/navigation";

/** The dashboard is home. The project's own progress page lives at /status. */
export default function Home() {
  redirect("/dashboard");
}
