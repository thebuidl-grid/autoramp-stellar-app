"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Mail } from "lucide-react";

interface AuthFlowProps {
  onSuccess: (token: string) => void;
  disabled?: boolean;
}

/**
 * The two-step email -> OTP sign-up/sign-in form itself, with no dialog or
 * page chrome around it — shared by EmailOtpModal (dialog) and
 * /auth/signup (full page) so there's exactly one implementation of the
 * actual auth logic.
 */
export function AuthFlow({ onSuccess, disabled }: AuthFlowProps) {
  const { toast } = useToast();
  const { setAuth } = useAuthStore();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const firstOtpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "otp" && firstOtpInputRef.current) {
      setTimeout(() => {
        firstOtpInputRef.current?.focus();
      }, 100);
    }
  }, [step]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await authApi.sendOtp({ email, purpose: "SIGNUP" });
      setStep("otp");
      // devOtpCode is only present when the backend opts in via
      // OTP_DEV_RETURN_CODE (see OtpService.sendOtp) — when email delivery isn't configured, this
      // lets the flow still be tested end-to-end.
      const devCode = res.data?.devOtpCode;
      if (devCode) {
        setOtpCode(devCode);
        toast({
          title: "Dev mode: email not configured",
          description: `Code auto-filled: ${devCode}`,
          variant: "success",
        });
      } else {
        toast({
          title: "OTP sent",
          description: "Please check your email for the verification code",
          variant: "success",
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to send OTP",
        description: error?.response?.data?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyAndLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otpCode || otpCode.length !== 6) {
      toast({
        title: "Invalid OTP",
        description: "Please enter the 6-digit code",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.signUp({ email, otpCode });

      setAuth(
        {
          id: response.data.user.id,
          email: response.data.user.email,
          role: response.data.user.role,
        },
        response.data.accessToken
      );

      toast({
        title: "Success",
        description: "You're now logged in",
        variant: "success",
      });

      onSuccess(response.data.accessToken);

      setStep("email");
      setEmail("");
      setOtpCode("");
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error?.response?.data?.message || "Invalid OTP code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {step === "email" ? (
        <form onSubmit={handleSendOtp} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-sm text-white/70 block mb-2">
              Email address
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                size={18}
              />
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:ring-0 focus:outline-0 focus:border-2! focus:border-secondary! focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-0 focus-visible:border-0"
                disabled={isSendingOtp || disabled}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-secondary hover:bg-secondary/90 text-black font-medium"
            isLoading={isSendingOtp}
            disabled={disabled}
          >
            Send verification code
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyAndLogin} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-sm block mb-4 text-white/70">
              Enter the 6-digit code sent to {email}
            </label>
            <div className="flex gap-2 justify-between">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <input
                  key={index}
                  ref={index === 0 ? firstOtpInputRef : null}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={otpCode[index] || ""}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    if (value.length <= 1) {
                      const newOtp = otpCode.split("");
                      newOtp[index] = value;
                      const updatedOtp = newOtp.join("").slice(0, 6);
                      setOtpCode(updatedOtp);

                      if (value && index < 5) {
                        const nextInput = document.getElementById(
                          `otp-${index + 1}`
                        );
                        nextInput?.focus();
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Backspace" &&
                      !otpCode[index] &&
                      index > 0
                    ) {
                      const prevInput = document.getElementById(
                        `otp-${index - 1}`
                      );
                      prevInput?.focus();
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pastedData = e.clipboardData
                      .getData("text")
                      .replace(/\D/g, "")
                      .slice(0, 6);
                    setOtpCode(pastedData);
                    if (pastedData.length === 6) {
                      const lastInput = document.getElementById(`otp-5`);
                      lastInput?.focus();
                    }
                  }}
                  id={`otp-${index}`}
                  className="w-12 h-14 text-center text-2xl font-mono bg-white/5 focus:border-2! focus:border-secondary! text-white  focus:outline-none focus:ring-0 rounded-lg disabled:opacity-50"
                  disabled={isLoading}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-5">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12 border-white/10 text-white hover:bg-white/10"
              onClick={() => {
                setStep("email");
                setOtpCode("");
              }}
              disabled={isLoading}
            >
              Change email
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12 bg-secondary hover:bg-secondary/90 text-black font-medium"
              isLoading={isLoading}
            >
              Verify
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
