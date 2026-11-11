import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { dashboardPathForRole } from "@/lib/role-routes";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeRedirect />
    </Suspense>
  );
}

async function HomeRedirect(): Promise<null> {
  const user = await getCurrentUser();
  redirect(user ? dashboardPathForRole(user.role) : "/login");
  return null;
}
