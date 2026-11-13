import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
export default async function MaritimePassageEntryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER_MAR") redirect("/dashboard");
  redirect("/dashboard/maritime/new");
}
