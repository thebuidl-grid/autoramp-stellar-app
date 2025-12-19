"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAdminLogin } from "@/lib/hooks";
import { ArrowRight, Shield } from "lucide-react";

export default function AdminLoginPage() {
  const adminLogin = useAdminLogin();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.email) newErrors.email = "Email is required";
    if (!formData.password) newErrors.password = "Password is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    adminLogin.mutate(formData);
  };

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
            <span className="text-black font-black text-lg">A</span>
          </div>
          <span className="font-bold text-xl tracking-tight">AutoRamp</span>
        </Link>
      </div>

      <div className="min-h-screen flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md relative">
          {/* Glow effect behind card */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-3xl blur-2xl scale-110" />
          
          <div className="relative p-8 md:p-10 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
            <div className="mb-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
                <Shield size={28} className="text-white/70" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                Admin Login
              </h1>
              <p className="text-white/50">
                Access the admin dashboard
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Email</label>
                <input
                  type="email"
                  placeholder="admin@cngn.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                />
                {errors.email && (
                  <p className="text-sm text-red-400">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                />
                {errors.password && (
                  <p className="text-sm text-red-400">{errors.password}</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 rounded-xl text-base font-semibold mt-2" 
                isLoading={adminLogin.isPending}
              >
                Sign In
                <ArrowRight size={18} />
              </Button>
            </form>

            <div className="mt-8 text-center">
              <Link 
                href="/auth/signin" 
                className="text-sm text-white/40 hover:text-white/70 transition-colors"
              >
                ← Back to User Login
              </Link>
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute -top-20 -right-20 w-40 h-40 border border-white/5 rounded-full" />
          <div className="absolute -bottom-10 -left-10 w-20 h-20 border border-white/5 rounded-full" />
        </div>
      </div>
    </div>
  );
}
