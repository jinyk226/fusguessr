import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/admin";

/**
 * Route-level admin gate.
 *
 * This keeps non-admins out of the pages; the Server Actions those pages call
 * re-check authorisation individually, since a layout cannot gate a direct
 * action invocation.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/sign-in");
  if (user.role !== "ADMIN") redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-4 border-b border-[var(--border)] pb-3 text-sm">
        <Link href="/admin" className="hover:underline">
          Dashboard
        </Link>
        <Link href="/admin/bank" className="hover:underline">
          Fusion bank
        </Link>
      </nav>
      {children}
    </div>
  );
}
