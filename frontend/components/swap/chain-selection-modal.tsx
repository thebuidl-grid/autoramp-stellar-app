"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Image from "next/image";
import { getChainMetadata } from "@/lib/constants/networks";

interface ChainSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedChain: string;
  onSelect: (chain: string) => void;
  chains: string[];
}

export function ChainSelectionModal({
  open,
  onOpenChange,
  selectedChain,
  onSelect,
  chains,
}: ChainSelectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/30 backdrop-blur-xl rounded-xl border-white/10 text-white w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Select Network</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-4">
          {chains.map((chain) => {
            const metadata = getChainMetadata(chain);
            const logo = metadata?.logo;

            return (
              <button
                key={chain}
                type="button"
                onClick={() => onSelect(chain)}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-white/10 relative hover:bg-white/5 transition-all hover:scale-[1.02] active:scale-[0.98] group"
              >
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center overflow-hidden p-2 border border-white/10 relative">
                  {logo ? (
                    <Image
                      src={logo}
                      alt={chain}
                      fill
                      className="object-contain p-2.5 transition-transform group-hover:scale-110"
                    />
                  ) : (
                    <div className="text-xs font-bold text-white/40 uppercase bg-gradient-to-br from-white/10 to-white/5 w-full h-full flex items-center justify-center">
                      {chain.substring(0, 2)}
                    </div>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-lg font-medium text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">
                    {metadata?.name || chain}
                  </div>
                  <div className="text-[10px] text-white/30 uppercase tracking-widest font-bold">
                    Select Network
                  </div>
                </div>
                {selectedChain === chain && (
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
