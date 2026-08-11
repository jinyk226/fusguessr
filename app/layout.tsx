import type { Metadata } from "next";
import Link from "next/link";
import { Toaster } from "sonner";

import "./globals.css";
import { getCurrentUser } from "@/lib/auth/admin";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "fusguessr",
  description:
    "A daily guessing game: name the two Pokemon fused into one sprite.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <header className="border-b border-[var(--border)]">
          <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              fusguessr
            </Link>

            <div className="flex items-center gap-2 text-sm">
              {user ? (
                <>
                  <Link href="/results" className="hover:underline">
                    Stats
                  </Link>
                  {user.role === "ADMIN" && (
                    <Link href="/admin" className="hover:underline">
                      Admin
                    </Link>
                  )}
                  <form
                    action={async () => {
                      "use server";
                      const { signOut } = await import("@/lib/auth/auth");
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <Button type="submit" variant="ghost" size="sm">
                      Sign out
                    </Button>
                  </form>
                </>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
              )}
            </div>
          </nav>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
