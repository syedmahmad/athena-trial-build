import { redirect } from "next/navigation";

// The calendar is now a view inside Homework; keep old links working.
export default function Page() {
  redirect("/educators/homework?view=calendar");
}
