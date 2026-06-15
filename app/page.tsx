import { redirect } from "next/navigation";

// Root redirects to the dashboard home
export default function RootPage() {
  redirect("/");
}
