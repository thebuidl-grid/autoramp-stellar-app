"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { authApi, getErrorMessage } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";

export default function MerchantLoginPage() {
    const setAuth = useAuthStore((state) => state.setAuth);
    const [step, setStep] = useState<"email" | "otp">("email");
    const [email, setEmail] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            toast({
                title: "Error",
                description: "Please enter your email address",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            await authApi.sendOtp({ email, purpose: "SIGNUP" });
            setStep("otp");
            toast({
                title: "OTP Sent",
                description: "Please check your email for the verification code",
                variant: "success",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: getErrorMessage(error),
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (otpCode.length !== 6) {
            toast({
                title: "Invalid OTP",
                description: "Please enter the 6-digit code",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            // Reusing signUp for login as per auth implementation
            const response = await authApi.signUp({ email, otpCode });
            const { user, accessToken } = response.data;

            // Save auth session globally using the store
            setAuth(user as any, accessToken);

            // Check if merchant has approved API access
            if (!user.isApiAccessApproved) {
                toast({
                    title: "Access Pending",
                    description: "Your API access is pending approval. Please ensure you have completed the KYB onboarding.",
                    variant: "destructive",
                });

                // Redirect to KYB form – they stay logged in now!
                router.push("/merchant/onboarding");
                return;
            }

            router.push("/merchant/dashboard");
            toast({
                title: "Success",
                description: "Logged in successfully",
                variant: "success",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: getErrorMessage(error),
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-black/30">
            {/* Left side - Image/Branding */}
            <div className="hidden w-1/2 bg-black lg:block relative overflow-hidden left-sidebar bg-cover bg-center">
                <div className="absolute inset-0" />
                <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
                    <div className="flex items-center gap-3">
                        <Image src="/logo.png" alt="AutoRamp" width={32} height={32} />
                        <span className="font-bold text-xl tracking-tight">
                            Auto<span className="text-secondary">Ramp</span>
                        </span>
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-5xl font-bold leading-tight">
                            Manage your <br />
                            crypto payment <br />
                            integration.
                        </h1>
                        <p className="text-lg text-gray-400">
                            Secure, fast, and reliable payments for your business.
                        </p>
                    </div>
                    <div className="text-sm text-gray-500">
                        &copy; {new Date().getFullYear()} AutoRamp. All rights reserved.
                    </div>
                </div>
            </div>

            {/* Right side - Login Form */}
            <div className="flex w-full flex-col justify-center px-4 py-12 lg:w-1/2 lg:px-12">
                <div className="mx-auto w-full max-w-lg space-y-8 backdrop-blur-sm p-8 rounded-xl shadow-lg">
                    <div className="space-y-2 text-center lg:text-left">
                        <h2 className="text-3xl font-bold tracking-tight">Merchant Login</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {step === "email"
                                ? "Enter your business email to access your dashboard"
                                : `Enter the 6-digit code sent to ${email}`
                            }
                        </p>
                    </div>

                    {step === "email" ? (
                        <form onSubmit={handleSendOtp} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="name@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading}
                                    className="bg-white dark:bg-gray-950"
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isLoading}
                            >
                                {isLoading ? "Sending code..." : "Continue with Email"}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleVerifyOtp} className="space-y-6">
                            <div className="flex gap-2 justify-between">
                                {[0, 1, 2, 3, 4, 5].map((index) => (
                                    <input
                                        key={index}
                                        id={`otp-${index}`}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={otpCode[index] || ""}
                                        onChange={(e) => {
                                            const value = e.target.value.replace(/\D/g, "");
                                            if (value.length <= 1) {
                                                const newOtp = otpCode.split("");
                                                newOtp[index] = value;
                                                // Pad with spaces if needed to maintain length during editing
                                                while (newOtp.length < 6) newOtp.push("");
                                                const updatedOtp = newOtp.join("").slice(0, 6);
                                                setOtpCode(updatedOtp);

                                                if (value && index < 5) {
                                                    document.getElementById(`otp-${index + 1}`)?.focus();
                                                }
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Backspace" && !otpCode[index] && index > 0) {
                                                document.getElementById(`otp-${index - 1}`)?.focus();
                                            }
                                        }}
                                        onPaste={(e) => {
                                            e.preventDefault();
                                            const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                                            setOtpCode(pastedData);
                                            if (pastedData.length === 6) {
                                                document.getElementById(`otp-5`)?.focus();
                                            }
                                        }}
                                        className="w-10 h-12 text-center text-xl font-mono border rounded-md  bg-transparent focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-50"
                                        disabled={isLoading}
                                    />
                                ))}
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => setStep("email")}
                                    disabled={isLoading}
                                >
                                    Back
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1"
                                    disabled={isLoading || otpCode.length !== 6}
                                >
                                    {isLoading ? "Verifying..." : "Verify & Login"}
                                </Button>
                            </div>
                        </form>
                    )}

                    <div className="text-center text-sm">
                        <p className="text-gray-500">
                            Don't have an account? <br />
                            Contact our support team to get started.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
