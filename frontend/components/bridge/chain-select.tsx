"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BridgeChain } from "@/lib/api";

const CHAIN_LABELS: Record<string, string> = {
  stellar: "Stellar",
  base: "Base",
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  polygon: "Polygon",
  avalanche: "Avalanche",
};

interface ChainSelectProps {
  chains: BridgeChain[];
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  excludeChain?: string;
}

export function ChainSelect({ chains, value, onValueChange, label, excludeChain }: ChainSelectProps) {
  const options = chains.filter((c) => c.name !== excludeChain);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger label={label}>
        <SelectValue placeholder="Select chain" />
      </SelectTrigger>
      <SelectContent>
        {options.map((chain) => (
          <SelectItem key={chain.name} value={chain.name}>
            {CHAIN_LABELS[chain.name] || chain.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
