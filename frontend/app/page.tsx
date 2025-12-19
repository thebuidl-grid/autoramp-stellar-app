"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
  ArrowDownLeft, 
  ArrowUpRight,
  Sparkles,
  ChevronRight
} from "lucide-react";

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [target]);
  
  return <span>{count.toLocaleString()}{suffix}</span>;
}

export default function HomePage() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Gradient orbs */}
      <div 
        className="fixed w-[600px] h-[600px] rounded-full bg-gradient-to-r from-white/5 to-transparent blur-3xl pointer-events-none transition-transform duration-1000 ease-out"
        style={{
          left: mousePosition.x - 300,
          top: mousePosition.y - 300,
        }}
      />
      
      {/* Grid pattern */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-6 mt-6">
          <div className="max-w-7xl mx-auto px-6 py-4 rounded-2xl bg-background/50 backdrop-blur-xl border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                  <span className="text-black font-black text-lg">C</span>
                </div>
                <span className="font-bold text-xl tracking-tight">CNGN</span>
              </div>
              <nav className="hidden md:flex items-center gap-8">
                <a href="#features" className="text-sm text-white/60 hover:text-white transition-colors">Features</a>
                <a href="#how-it-works" className="text-sm text-white/60 hover:text-white transition-colors">How it works</a>
                <a href="#api" className="text-sm text-white/60 hover:text-white transition-colors">API</a>
              </nav>
              <div className="flex items-center gap-3">
                <Link href="/auth/signin">
                  <Button variant="ghost" size="sm">Sign In</Button>
                </Link>
                <Link href="/auth/signup">
                  <Button size="sm">
                    Get Started
                    <ChevronRight size={16} />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-sm">
                <Sparkles size={14} className="text-white" />
                <span className="text-white/80">Now live on Base</span>
              </div>
              
              <h1 className="text-6xl md:text-8xl font-bold leading-[0.9] tracking-tighter">
                <span className="block">Naira to Crypto</span>
              </h1>
              
              <p className="text-lg text-white/50 max-w-md leading-relaxed">
                The fastest on/off ramp for Nigerian Naira. 
                Convert in seconds, not days.
              </p>
              
              <div className="flex gap-4 pt-4">
                <Link href="/auth/signup">
                  <Button size="lg" className="h-14 px-6 text-sm rounded-full">
                    Start Trading
                    <ArrowRight size={20} />
                  </Button>
                </Link>
                <Link href="#how-it-works">
                  <Button size="lg" variant="outline" className="h-14 px-6 text-sm rounded-full border-white/20 hover:bg-white/5">
                    See how it works
                  </Button>
                </Link>
              </div>
            </div>

            {/* Hero visual */}
            <div className="relative hidden lg:block">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-3xl blur-3xl" />
              
              {/* Cards stack */}
              <div className="relative space-y-4">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm transform hover:scale-[1.02] transition-transform">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center">
                        <ArrowDownLeft size={20} />
                      </div>
                      <div>
                        <p className="text-sm text-white/50">Buy Crypto</p>
                        <p className="font-semibold">OnRamp</p>
                      </div>
                    </div>
                    <span className="text-green-400 text-sm font-medium">+2.5%</span>
                  </div>
                  <div className="h-px bg-white/10 mb-4" />
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">NGN → CNGN</span>
                    <span className="font-mono">₦100,000</span>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm transform hover:scale-[1.02] transition-transform ml-8">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                        <ArrowUpRight size={20} />
                      </div>
                      <div>
                        <p className="text-sm text-white/50">Sell Crypto</p>
                        <p className="font-semibold">OffRamp</p>
                      </div>
                    </div>
                    <span className="text-orange-400 text-sm font-medium">Instant</span>
                  </div>
                  <div className="h-px bg-white/10 mb-4" />
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">CNGN → NGN</span>
                    <span className="font-mono">100 CNGN</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats marquee */}
      <section className="py-8 border-y border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-16 mx-8">
              <div className="flex items-center gap-4">
                <span className="text-4xl font-bold">₦<AnimatedCounter target={50} />M+</span>
                <span className="text-white/40 text-sm">Volume</span>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex items-center gap-4">
                <span className="text-4xl font-bold"><AnimatedCounter target={5000} />+</span>
                <span className="text-white/40 text-sm">Users</span>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex items-center gap-4">
                <span className="text-4xl font-bold">&lt;<AnimatedCounter target={30} />s</span>
                <span className="text-white/40 text-sm">Avg. Time</span>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex items-center gap-4">
                <span className="text-4xl font-bold"><AnimatedCounter target={4} /></span>
                <span className="text-white/40 text-sm">Networks</span>
              </div>
              <div className="w-px h-8 bg-white/10" />
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-20">
            <p className="text-white/40 text-sm font-medium tracking-widest uppercase mb-4">Features</p>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Built for speed.<br />
              <span className="text-white/30">Designed for Africa.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Lightning Fast",
                description: "Complete transactions in under 30 seconds. No waiting, no delays.",
                metric: "<30s",
                metricLabel: "avg transaction"
              },
              {
                title: "Bank Transfer",
                description: "Pay directly from your Nigerian bank account. No cards needed.",
                metric: "200+",
                metricLabel: "banks supported"
              },
              {
                title: "Multi-Chain",
                description: "Access Base, Ethereum, Polygon, and BSC all in one place.",
                metric: "4",
                metricLabel: "networks"
              }
            ].map((feature, i) => (
              <div 
                key={i}
                className="group relative p-8 rounded-3xl bg-white/[0.02] border border-white/10 hover:border-white/20 hover:bg-white/[0.04] transition-all duration-300"
              >
                <div className="absolute top-8 right-8 text-right">
                  <p className="text-3xl font-bold font-mono">{feature.metric}</p>
                  <p className="text-xs text-white/40">{feature.metricLabel}</p>
                </div>
                <div className="pt-20">
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-white/50 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-32 px-6 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <p className="text-white/40 text-sm font-medium tracking-widest uppercase mb-4">How it works</p>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight">
              Three steps.<br />
              <span className="text-white/30">That&apos;s it.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Create Account", desc: "Sign up with your email in under a minute" },
              { step: "02", title: "Verify Identity", desc: "Quick KYC with BVN or NIN verification" },
              { step: "03", title: "Start Trading", desc: "Buy or sell crypto via bank transfer" },
            ].map((item, i) => (
              <div key={i} className="relative">
                <div className="text-8xl font-bold text-white/5 absolute -top-4 -left-2">{item.step}</div>
                <div className="relative pt-16 pl-4">
                  <h3 className="text-2xl font-bold mb-3">{item.title}</h3>
                  <p className="text-white/50">{item.desc}</p>
                </div>
                {i < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-px bg-white/20" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="group relative p-10 rounded-3xl bg-white/5 border border-white/10 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-black/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 group-hover:scale-150 transition-transform duration-700" />
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center mb-8">
                  <ArrowDownLeft size={28} />
                </div>
                <h3 className="text-3xl font-bold mb-4">Buy Crypto</h3>
                <p className="text-white/60 mb-8 text-lg leading-relaxed">
                  Convert Nigerian Naira to crypto instantly. Pay via bank transfer, receive tokens in your wallet.
                </p>
                <ul className="space-y-3 mb-8">
                  {["Pay with any Nigerian bank", "Receive in 30 seconds", "Multiple networks supported"].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-white/70">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signup">
                  <Button className="bg-white text-black rounded-full h-12 px-6">
                    Start Buying
                    <ArrowRight size={18} />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="group relative p-10 rounded-3xl bg-white/5 border border-white/10 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 group-hover:scale-150 transition-transform duration-700" />
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center mb-8">
                  <ArrowUpRight size={28} />
                </div>
                <h3 className="text-3xl font-bold mb-4">Sell Crypto</h3>
                <p className="text-white/60 mb-8 text-lg leading-relaxed">
                  Convert crypto back to Naira. Send tokens, receive NGN directly in your bank account.
                </p>
                <ul className="space-y-3 mb-8">
                  {["Send from any wallet", "Instant bank transfer", "Competitive rates"].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-white/70">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signup">
                  <Button variant="outline" className="bg-white text-black rounded-full h-12 px-6">
                    Start Selling
                    <ArrowRight size={18} />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* API */}
      <section id="api" className="py-32 px-6 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-white/40 text-sm font-medium tracking-widest uppercase mb-4">For Developers</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
                Powerful API.<br />
                <span className="text-white/30">Simple integration.</span>
              </h2>
              <p className="text-white/50 text-lg leading-relaxed mb-8">
                Integrate CNGN Ramp into your application with just a few lines of code. 
                Perfect for exchanges, wallets, and fintech platforms.
              </p>
              <Link href="/auth/signup">
                <Button size="lg" className="rounded-full h-14 px-8">
                  Get API Access
                  <ArrowRight size={20} />
                </Button>
              </Link>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-3xl blur-2xl" />
              <div className="relative p-6 rounded-2xl bg-black border border-white/10 font-mono text-sm overflow-hidden">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-white/20" />
                  <div className="w-3 h-3 rounded-full bg-white/20" />
                  <div className="w-3 h-3 rounded-full bg-white/20" />
                </div>
                <pre className="text-white/70 overflow-x-auto">
{`curl -X POST https://api.cngn.app/onramp \\
  -H "x-api-key: sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 100000,
    "network": "base",
    "destination": {
      "address": "0x..."
    }
  }'`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            Ready to start?
          </h2>
          <p className="text-white/50 text-xl mb-10 max-w-xl mx-auto">
            Join thousands of Nigerians converting Naira to crypto every day.
          </p>
          <Link href="/auth/signup">
            <Button size="lg" className="h-16 px-10 text-lg rounded-full">
              Create Free Account
              <ArrowRight size={24} />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
              <span className="text-black font-black text-sm">C</span>
            </div>
            <span className="font-bold tracking-tight">CNGN Ramp</span>
          </div>
          <p className="text-sm text-white/40">
            © 2025 CNGN Ramp. All rights reserved.
          </p>
        </div>
      </footer>

      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 20s linear infinite;
        }
      `}</style>
    </div>
  );
}
