import type { ReactNode } from "react";

/**
 * Single source of truth for the application navigation.
 *
 * Consumed by both the desktop `Sidebar` and the `AppShell` mobile drawer so
 * they never drift apart (DRY). Each item declares which role literals may see
 * it; `navItemsForRoles` filters by the authenticated user's `roles`.
 *
 * Icons are reused verbatim from the original FE1 Sidebar SVGs. A student and a
 * teacher never see the same sidebar, so reusing an icon across roles is safe —
 * there is no visual collision within a single role's menu.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Role literals allowed to see this item (matches `CurrentUserResponse.roles`). */
  roles: string[];
  /** When true, only an exact pathname match counts as active (used for "/"). */
  exact?: boolean;
  /** Short descriptive copy shown on the Dashboard's functional action cards. */
  description?: string;
  /** Additional path prefixes that should mark this nav item as active
   * (e.g. "/attempts" for the "My attempts" item whose href is "/attempts"). */
  alsoActive?: string[];
  /**
   * Identity-M2: which active view owns this item. "shared" items (dashboard,
   * admin) render in every view; student/teacher items render only when the
   * user's activeView matches AND the roles permit.
   */
  view?: "student" | "teacher" | "shared";
}

const ICON = "w-5 h-5";

const DashboardIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={ICON}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);

const ExamIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={ICON}>
    {/* Open book: two pages fanning from a center spine, rounded valleys at top & bottom. */}
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
  </svg>
);

const ClockIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={ICON}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const BankIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={ICON}>
    {/* Classical institution silhouette: triangular pediment + three columns + base. */}
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8 12 3.5 20 8Zm1.5 1.5v7M12 9.5v7m6.5-7v7M3.5 16.5h17M2.5 20h19" />
  </svg>
);

const UsersIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={ICON}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
  </svg>
);

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: DashboardIcon, roles: ["STUDENT", "TEACHER"], exact: true, view: "shared" },
  { href: "/sessions", label: "Available sessions", icon: ExamIcon, roles: ["STUDENT"], view: "student", description: "Browse open exam sessions and join one when you’re ready." },
  { href: "/attempts", label: "My attempts", icon: ClockIcon, roles: ["STUDENT"], view: "student", description: "Review your past attempts and their detailed results." },
  { href: "/my-classes", label: "My classes", icon: UsersIcon, roles: ["STUDENT"], view: "student", description: "Classes you joined via email invitation — leave anytime." },
  { href: "/question-banks", label: "Question banks", icon: BankIcon, roles: ["TEACHER"], view: "teacher", description: "Build and organize reusable collections of questions." },
  { href: "/exams", label: "Exams", icon: ExamIcon, roles: ["TEACHER"], view: "teacher", description: "Assemble exams from your question banks and run their sessions." },
  { href: "/classes", label: "Classes", icon: UsersIcon, roles: ["TEACHER"], view: "teacher", description: "Manage your classes and student rosters." },
];

/** Items visible to the given roles. Falls back to the Dashboard-only set. */
export function navItemsForRoles(roles?: string[] | null): NavItem[] {
  if (!roles || roles.length === 0) {
    return NAV_ITEMS.filter((i) => i.exact);
  }
  return NAV_ITEMS.filter((i) => i.roles.some((r) => roles.includes(r)));
}

/**
 * Identity-M2: items visible in the given active view — "shared" items always,
 * view-specific items only when the activeView matches AND the roles permit.
 * Falls back to the Dashboard-only set for anonymous/empty roles.
 */
export function navItemsForView(roles: string[] | null | undefined, view: "student" | "teacher"): NavItem[] {
  if (!roles || roles.length === 0) {
    return NAV_ITEMS.filter((i) => i.exact);
  }
  return NAV_ITEMS.filter(
    (i) => (i.view ?? "shared") === "shared" || i.view === view,
  ).filter((i) => i.roles.some((r) => roles.includes(r)));
}

/** Shared active-link predicate so Sidebar and the mobile drawer agree. */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
  if (item.alsoActive) {
    return item.alsoActive.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
  }
  return false;
}
