import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStaffSession, type StaffRole, type StaffSession } from "@/lib/session.functions";

export function useStaffSession() {
  const fetchSession = useServerFn(getStaffSession);
  const query = useQuery<StaffSession>({
    queryKey: ["staff-session"],
    queryFn: () => fetchSession(),
    staleTime: 60_000,
  });

  const roles = query.data?.roles ?? [];
  const permissions = query.data?.permissions ?? [];

  return {
    ...query,
    session: query.data,
    roles,
    permissions,
    hasRole: (role: StaffRole) => roles.includes(role),
    hasAnyRole: (candidates: StaffRole[]) => candidates.some((r) => roles.includes(r)),
    hasPermission: (code: string) => permissions.includes(code),
    hasAnyPermission: (codes: string[]) => codes.some((c) => permissions.includes(c)),
  };
}
