"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthFlow } from "@/components/auth/auth-flow";
import { useAuthStore } from "@/lib/store";

export default function SignUpPage() {
  const router = useRouter();
  const { user, token, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (_hasHydrated && token && user) {
      router.push("/");
    }
  }, [_hasHydrated, token, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-white text-xl font-semibold mb-1">
          Sign in to AutoRamp
        </h1>
        <p className="text-white/50 text-sm mb-2">
          Enter your email — we&apos;ll send a one-time code. New here? An
          account is created automatically.
        </p>
        <AuthFlow onSuccess={() => router.push("/")} />
      </div>
    </div>
  );
}
