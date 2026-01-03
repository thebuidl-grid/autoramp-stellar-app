"use client";

import * as React from "react";
import { Building2, Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Bank {
  institutionCode: string;
  institutionName: string;
}

interface SearchableBankSelectProps {
  banks: Bank[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export function SearchableBankSelect({
  banks,
  value,
  onValueChange,
  placeholder = "Select a bank",
  required = false,
  disabled = false,
}: SearchableBankSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Filter banks based on search query
  const filteredBanks = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return banks;
    }
    const query = searchQuery.toLowerCase();
    return banks.filter(
      (bank) =>
        bank.institutionName.toLowerCase().includes(query) ||
        bank.institutionCode.toLowerCase().includes(query)
    );
  }, [banks, searchQuery]);

  // Get selected bank name
  const selectedBank = banks.find((bank) => bank.institutionCode === value);

  const handleSelect = (bankCode: string) => {
    onValueChange(bankCode);
    setOpen(false);
    setSearchQuery("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={cn(
          "w-full h-14 rounded-lg bg-white/5 border border-white/10 text-white",
          "focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent",
          "transition-all flex items-center justify-between px-4",
          disabled && "opacity-50 cursor-not-allowed",
          !selectedBank && "text-white/50"
        )}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Building2 size={16} className="text-white/70 shrink-0" />
          <span className="truncate text-sm">
            {selectedBank ? selectedBank.institutionName : placeholder}
          </span>
        </div>
        <ChevronsUpDown size={16} className="text-white/50 shrink-0 ml-2" />
      </button>

      <Dialog open={open} onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (!newOpen) {
          setSearchQuery("");
        }
      }}>
        <DialogContent className="bg-black/30 backdrop-blur-xl border-white/10 text-white max-w-md data-[state=open]:animate-modal-open data-[state=closed]:animate-modal-close">
          <DialogHeader>
            <DialogTitle className="text-white">Select Bank</DialogTitle>
          </DialogHeader>
          
          {/* Search Input */}
          <div className="pt-4">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
              />
              <input
                type="text"
                placeholder="Search banks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm"
                autoFocus
              />
            </div>
          </div>

          {/* Bank List */}
          <div className="mt-4 max-h-[400px] overflow-y-auto">
            {filteredBanks.length === 0 ? (
              <div className="px-4 py-8 text-center text-white/50 text-sm">
                No banks found
              </div>
            ) : (
              <div className="space-y-1">
                {filteredBanks.map((bank) => {
                  const isSelected = bank.institutionCode === value;
                  return (
                    <button
                      key={bank.institutionCode}
                      type="button"
                      onClick={() => handleSelect(bank.institutionCode)}
                      className={cn(
                        "w-full px-4 py-3 text-sm text-left flex items-center justify-between rounded-xl",
                        "hover:bg-white/10 transition-colors",
                        isSelected && "bg-white/10"
                      )}
                    >
                      <span className="text-white">{bank.institutionName}</span>
                      {isSelected && (
                        <Check size={16} className="text-white shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
