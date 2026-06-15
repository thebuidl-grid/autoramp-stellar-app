"use client";

export function GridLines() {
  // Create clean grid pattern using SVG
  const gridPattern = `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='grid' width='100' height='100' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 100 0 L 0 0 0 100' fill='none' stroke='rgba(244, 218, 58, 0.08)' stroke-width='1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23grid)'/%3E%3C/svg%3E")`;

  return (
    <>
      {/* Clean Grid Pattern Background */}
      <div 
        className="fixed inset-0 pointer-events-none z-0 opacity-40"
        style={{
          backgroundImage: gridPattern,
        }}
      />

      {/* Left Grid Line */}
      <div className="fixed left-0 top-0 w-px h-full pointer-events-none z-0">
        {/* Main glowing line */}
        <div 
          className="absolute left-0 top-0 w-full h-full"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(244, 218, 58, 0.4) 20%, rgba(244, 218, 58, 0.6) 50%, rgba(244, 218, 58, 0.4) 80%, transparent 100%)',
            boxShadow: '0 0 20px rgba(244, 218, 58, 0.5), 0 0 40px rgba(244, 218, 58, 0.3), 0 0 60px rgba(244, 218, 58, 0.1)',
          }}
        />
        
        {/* Subtle dot pattern overlay */}
        <div 
          className="absolute -left-2 top-0 w-5 h-full opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(244, 218, 58, 0.8) 1px, transparent 1px)`,
            backgroundSize: '4px 40px',
            backgroundPosition: 'center',
          }}
        />
        
        {/* Ambient glow spread */}
        <div 
          className="absolute -left-20 top-0 w-40 h-full opacity-10 blur-xl"
          style={{
            background: 'linear-gradient(90deg, rgba(244, 218, 58, 0.6), transparent)',
          }}
        />
      </div>

      {/* Right Grid Line */}
      <div className="fixed right-0 top-0 w-px h-full pointer-events-none z-0">
        {/* Main glowing line */}
        <div 
          className="absolute right-0 top-0 w-full h-full"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(244, 218, 58, 0.4) 20%, rgba(244, 218, 58, 0.6) 50%, rgba(244, 218, 58, 0.4) 80%, transparent 100%)',
            boxShadow: '0 0 20px rgba(244, 218, 58, 0.5), 0 0 40px rgba(244, 218, 58, 0.3), 0 0 60px rgba(244, 218, 58, 0.1)',
          }}
        />
        
        {/* Subtle dot pattern overlay */}
        <div 
          className="absolute -right-2 top-0 w-5 h-full opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(244, 218, 58, 0.8) 1px, transparent 1px)`,
            backgroundSize: '4px 40px',
            backgroundPosition: 'center',
          }}
        />
        
        {/* Ambient glow spread */}
        <div 
          className="absolute -right-20 top-0 w-40 h-full opacity-10 blur-xl"
          style={{
            background: 'linear-gradient(270deg, rgba(244, 218, 58, 0.6), transparent)',
          }}
        />
      </div>
    </>
  );
}
