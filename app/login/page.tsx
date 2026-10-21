import { redirect } from "next/navigation";

/** The old passcode page: accounts have replaced it. */
export default function Login() {
  redirect("/sign-in");
}
