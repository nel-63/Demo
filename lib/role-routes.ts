export function dashboardPathForRole(role: string): string {
  return role === "USER_MAR" ? "/dashboard/maritime" : "/dashboard";
}
