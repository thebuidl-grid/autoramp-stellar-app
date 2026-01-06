"use client";

import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompletedStepProps {
  reference?: string;
  onReset: () => void;
}

export function CompletedStep({ reference, onReset }: CompletedStepProps) {
  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-6 space-y-4">
      <div className="text-center mb-6">
        <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Transaction Completed</h2>
        <p className="text-white/50">Your transaction has been completed successfully</p>
      </div>

      {reference && (
        <div className="p-4 bg-black/50 rounded-xl">
          <p className="text-white/70 mb-2">Reference</p>
          <code className="text-sm text-white font-mono">{reference}</code>
        </div>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={onReset}>
          New Transaction
        </Button>
      </div>
    </div>
  );
}

