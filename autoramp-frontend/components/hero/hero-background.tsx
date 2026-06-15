"use client";

export function HeroBackground() {
  return (
    <>
      {/* Noise Texture Background */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      ></div>

      {/* Glowing Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large glowing orb - top right */}
        <div 
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-20 animate-pulse-slow"
          style={{
            background: 'radial-gradient(circle, rgba(0, 249, 199, 0.4) 0%, rgba(0, 249, 199, 0.1) 40%, transparent 70%)',
          }}
        ></div>
        
        {/* Medium glowing orb - bottom left */}
        <div 
          className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full blur-3xl opacity-15"
          style={{
            background: 'radial-gradient(circle, rgba(0, 249, 199, 0.3) 0%, rgba(0, 249, 199, 0.1) 50%, transparent 80%)',
          }}
        ></div>
        
        {/* Small glowing orb - center */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-3xl opacity-10"
          style={{
            background: 'radial-gradient(circle, rgba(0, 249, 199, 0.2) 0%, transparent 60%)',
          }}
        ></div>
        
        {/* Gradient mesh overlay */}
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            background: 'radial-gradient(ellipse at top, rgba(0, 249, 199, 0.1) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(0, 249, 199, 0.05) 0%, transparent 50%)',
          }}
        ></div>
      </div>
    </>
  );
}

