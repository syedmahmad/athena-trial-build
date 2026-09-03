import { redirect } from "next/navigation";

// Renamed: the roster/health dashboard lives at /educators/students now.
export default function Page() {
  redirect("/educators/students");
}
