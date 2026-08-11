import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth/auth";
import { getCurrentUser } from "@/lib/auth/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <Card className="mx-auto max-w-sm">
      <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
        <CardTitle>Sign in to fusguessr</CardTitle>
        <CardDescription>
          Your guesses and streak are saved to your account.
        </CardDescription>

        <form
          className="w-full"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <Button type="submit" className="w-full">
            Continue with Google
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
