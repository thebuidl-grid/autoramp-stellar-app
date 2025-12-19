"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSignUp } from "@/lib/hooks";
import { authApi, getErrorMessage } from "@/lib/api";
import { useUIStore } from "@/lib/store";
import { ArrowRight, Sparkles, Shield, Zap, Globe, Mail, ArrowLeft } from "lucide-react";

export default function SignUpPage() {
  const signUp = useSignUp();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    otpCode: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"form" | "otp">("form");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);

  // Clear OTP digits on signup error
  useEffect(() => {
    if (signUp.isError && step === "otp") {
      setOtpDigits(["", "", "", "", "", ""]);
      // Focus first OTP input after error
      setTimeout(() => {
        const firstInput = document.getElementById("otp-0");
        firstInput?.focus();
      }, 100);
    }
  }, [signUp.isError, step]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const { addToast } = useUIStore();

  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Invalid email address";
    if (step === "form") {
      if (!formData.password) newErrors.password = "Password is required";
      else if (formData.password.length < 8) newErrors.password = "Password must be at least 8 characters";
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
      if (!formData.phoneNumber) newErrors.phoneNumber = "Phone number is required";
      else if (!/^\+?[1-9]\d{1,14}$/.test(formData.phoneNumber.replace(/\s/g, ""))) {
        newErrors.phoneNumber = "Please enter a valid phone number";
      }
    } else {
      const otpCode = otpDigits.join("");
      if (!otpCode) newErrors.otpCode = "OTP code is required";
      else if (!/^\d{6}$/.test(otpCode)) newErrors.otpCode = "OTP must be 6 digits";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSendingOtp(true);
    try {
      await authApi.sendOtp({ email: formData.email });
      setOtpSent(true);
      setOtpCountdown(60);
      setStep("otp");
      setOtpDigits(["", "", "", "", "", ""]);
      addToast({
        title: "OTP Sent",
        description: "Please check your email for the verification code",
        variant: "success",
      });
    } catch (error) {
      addToast({
        title: "Failed to send OTP",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCountdown > 0 || sendingOtp) return;
    
    setSendingOtp(true);
    try {
      await authApi.sendOtp({ email: formData.email });
      setOtpCountdown(60);
      setOtpDigits(["", "", "", "", "", ""]);
      addToast({
        title: "OTP Resent",
        description: "A new code has been sent to your email",
        variant: "success",
      });
    } catch (error) {
      addToast({
        title: "Failed to resend OTP",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    if (step === "form") {
      handleSendOtp(e);
    } else {
      const otpCode = otpDigits.join("");
      signUp.mutate({
        email: formData.email,
        password: formData.password,
        phoneNumber: formData.phoneNumber,
        otpCode: otpCode,
      });
    }
  };

  const features = [
    { icon: Zap, title: "Instant transfers", desc: "Complete in seconds" },
    { icon: Shield, title: "Bank-grade security", desc: "Your funds are safe" },
    { icon: Globe, title: "Multi-chain", desc: "4 networks supported" },
  ];

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* Gradient orb */}
      <div 
        className="fixed w-[800px] h-[800px] rounded-full bg-gradient-to-r from-white/5 to-transparent blur-3xl pointer-events-none transition-transform duration-1000 ease-out"
        style={{
          left: mousePosition.x - 400,
          top: mousePosition.y - 400,
        }}
      />
      
      {/* Grid pattern */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      {/* Back to home */}
      <div className="fixed top-6 left-6 z-50">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <span className="text-black font-black text-lg">C</span>
          </div>
          <span className="font-bold text-xl tracking-tight">CNGN</span>
        </Link>
      </div>

      <div className="min-h-screen flex">
        {/* Left side - Features (hidden on mobile) */}
        <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12">
          <div className="max-w-md">
            <h2 className="text-5xl font-bold tracking-tight mb-6">
              Join the future<br />
              <span className="text-white/30">of finance.</span>
            </h2>
            <p className="text-white/50 text-lg mb-12">
              Create your account and start converting Naira to crypto in minutes.
            </p>

            <div className="space-y-6">
              {features.map((feature, i) => (
                <div key={i} className="flex items-start gap-4 group">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                    <feature.icon size={20} className="text-white/70" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-white/50 text-sm">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right side - Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-20">
          <div className="w-full max-w-md relative">
            {/* Glow effect behind card */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-3xl blur-2xl scale-110" />
            
            <div className="relative p-8 md:p-10 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs mb-6">
                  <Sparkles size={12} />
                  <span className="text-white/70">Get started for free</span>
                </div>
                <h1 className="text-4xl font-bold tracking-tight mb-2">
                  Create account
                </h1>
                <p className="text-white/50">
                  Start trading in under 2 minutes
                </p>
              </div>

              {step === "form" ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/70">Email</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                      disabled={otpSent}
                    />
                    {errors.email && (
                      <p className="text-sm text-red-400">{errors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/70">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+234 800 000 0000"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                      disabled={otpSent}
                      required
                    />
                    {errors.phoneNumber && (
                      <p className="text-sm text-red-400">{errors.phoneNumber}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/70">Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                        disabled={otpSent}
                      />
                      {errors.password && (
                        <p className="text-sm text-red-400">{errors.password}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/70">Confirm</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                        disabled={otpSent}
                      />
                      {errors.confirmPassword && (
                        <p className="text-sm text-red-400">{errors.confirmPassword}</p>
                      )}
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 rounded-xl text-base font-semibold mt-2"
                    isLoading={sendingOtp}
                    disabled={sendingOtp}
                  >
                    {sendingOtp ? "Sending..." : "Send Verification Code"}
                    <Mail size={18} className="ml-2" />
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-4">
                      <Mail size={24} className="text-white/70" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Check your email</h2>
                    <p className="text-white/50 text-sm">
                      We sent a 6-digit code to <span className="font-medium text-white">{formData.email}</span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm mb-5 font-medium text-white/70">Verification Code</label>
                    <div className="flex gap-2 justify-between">
                      {otpDigits.map((digit, index) => (
                        <input
                          key={index}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, "");
                            const newDigits = [...otpDigits];
                            
                            // Allow clearing (empty value) or setting a new digit
                            if (value.length <= 1) {
                              newDigits[index] = value;
                              setOtpDigits(newDigits);
                              
                              // Auto-focus next input if a digit was entered
                              if (value && index < 5) {
                                const nextInput = document.getElementById(`otp-${index + 1}`);
                                nextInput?.focus();
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace") {
                              const newDigits = [...otpDigits];
                              
                              if (digit) {
                                // Clear current digit
                                newDigits[index] = "";
                                setOtpDigits(newDigits);
                              } else if (index > 0) {
                                // Move to previous input and clear it
                                newDigits[index - 1] = "";
                                setOtpDigits(newDigits);
                                const prevInput = document.getElementById(`otp-${index - 1}`);
                                prevInput?.focus();
                              }
                            } else if (e.key === "Delete") {
                              // Clear current digit on Delete key
                              const newDigits = [...otpDigits];
                              newDigits[index] = "";
                              setOtpDigits(newDigits);
                            }
                          }}
                          onPaste={(e) => {
                            e.preventDefault();
                            const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                            const newDigits = [...otpDigits];
                            for (let i = 0; i < pastedData.length && index + i < 6; i++) {
                              newDigits[index + i] = pastedData[i];
                            }
                            setOtpDigits(newDigits);
                            
                            // Focus the next empty input or the last one
                            const nextEmptyIndex = newDigits.findIndex((d, i) => i >= index && !d);
                            const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
                            const nextInput = document.getElementById(`otp-${focusIndex}`);
                            nextInput?.focus();
                          }}
                          id={`otp-${index}`}
                          autoFocus={index === 0}
                          className="w-12 h-14 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all text-center text-2xl font-mono"
                        />
                      ))}
                    </div>
                    {errors.otpCode && (
                      <p className="text-sm text-red-400 text-center">{errors.otpCode}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("form");
                        setOtpDigits(["", "", "", "", "", ""]);
                      }}
                      className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
                    >
                      <ArrowLeft size={16} />
                      Change email
                    </button>
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={otpCountdown > 0 || sendingOtp}
                      className="text-white/50 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingOtp ? "Sending..." : otpCountdown > 0 ? `Resend in ${otpCountdown}s` : "Resend code"}
                    </button>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 rounded-xl text-base font-semibold mt-2" 
                    isLoading={signUp.isPending}
                  >
                    Verify & Create Account
                    <ArrowRight size={18} className="ml-2" />
                  </Button>

                  <p className="text-xs text-white/30 text-center pt-2">
                    By signing up, you agree to our{" "}
                    <Link href="#" className="text-white/50 hover:underline">Terms</Link> and{" "}
                    <Link href="#" className="text-white/50 hover:underline">Privacy Policy</Link>
                  </p>
                </form>
              )}

              <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-center text-white/50 text-sm">
                  Already have an account?{" "}
                  <Link href="/auth/signin" className="text-white font-medium hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>

            {/* Decorative elements */}
            <div className="absolute -top-20 -right-20 w-40 h-40 border border-white/5 rounded-full" />
            <div className="absolute -bottom-10 -left-10 w-20 h-20 border border-white/5 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
