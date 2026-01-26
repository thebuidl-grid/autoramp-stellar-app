"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authApi, SignInDto, SignUpDto, getErrorMessage } from "@/lib/api";
import { merchantApi } from "@/lib/merchant";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";

/**
 * Sign In Hook
 */
export function useSignIn() {
  const router = useRouter();
  const { toast } = useToast();
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: (data: SignInDto) => authApi.signIn(data),
    onSuccess: (response) => {
      const { user, accessToken } = response.data;
      setAuth(user, accessToken);
      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
        variant: "success",
      });
      router.push("/dashboard");
    },
    onError: (error) => {
      toast({
        title: "Sign in failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}

/**
 * Sign Up Hook
 */
export function useSignUp() {
  const router = useRouter();
  const { toast } = useToast();
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: (data: SignUpDto) => authApi.signUp(data),
    onSuccess: (response) => {
      const { user, accessToken } = response.data;
      setAuth(user, accessToken);
      toast({
        title: "Account created!",
        description: "Welcome to AutoRamp. You can now start trading.",
        variant: "success",
      });
      router.push("/dashboard");
    },
    onError: (error) => {
      toast({
        title: "Sign up failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}

/**
 * Admin Login Hook
 */
export function useAdminLogin() {
  const router = useRouter();
  const { toast } = useToast();
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: (data: SignInDto) => authApi.adminLogin(data),
    onSuccess: (response) => {
      const { user, accessToken } = response.data;
      setAuth({ ...user, role: "ADMIN" }, accessToken);
      toast({
        title: "Welcome, Admin!",
        description: "You have successfully logged in.",
        variant: "success",
      });
      router.push("/admin");
    },
    onError: (error) => {
      toast({
        title: "Login failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}

/**
 * Merchant Status Hook
 */
export function useMerchantStatus() {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ["merchantStatus", user?.id],
    queryFn: () => merchantApi.getMerchantStatus(),
    enabled: !!user,
  });
}

/**
 * Merchant Onboarding Check Hook
 */
export function useIsOnboarded() {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ["merchantOnboarded", user?.id],
    queryFn: () => merchantApi.getIsOnboarded(),
    enabled: !!user,
  });
}

