"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, label, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === "password";

    return (
      <div className="w-full space-y-2">
        {label && (
          <label className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            type={isPassword && showPassword ? "text" : type}
            className={cn(
              "flex h-12 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-all duration-200",
              "file:border-0 file:bg-transparent file:text-sm file:font-medium",
              "placeholder:text-white/30",
              "focus:ring-0 focus:outline-0 focus:border-2 focus:border-secondary",
              "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-0 focus-visible:border-2 focus-visible:border-secondary",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-destructive focus:border-destructive focus-visible:border-destructive",
              isPassword && "pr-11",
              className
            )}
            ref={ref}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
        {error && (
          <p className="text-sm text-destructive animate-fade-in">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };

