"use client";

import * as React from "react";
import { Building2, Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

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

  // Close dropdown on Escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        setSearchQuery("");
      }
    };

    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          "w-full h-14 rounded-xl bg-white/5 border border-white/10 text-white",
          "focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent",
          "transition-all flex items-center justify-between px-4",
          disabled && "opacity-50 cursor-not-allowed",
          !selectedBank && "text-white/50"
        )}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Building2 size={16} className="text-white/70 flex-shrink-0" />
          <span className="truncate">
            {selectedBank ? selectedBank.institutionName : placeholder}
          </span>
        </div>
        <ChevronsUpDown size={16} className="text-white/50 flex-shrink-0 ml-2" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setSearchQuery("");
            }}
          />
          
          {/* Dropdown */}
          <div className="absolute z-50 w-full mt-2 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-lg max-h-[300px] flex flex-col overflow-hidden">
            {/* Search Input */}
            <div className="p-2 border-b border-white/10 sticky top-0 bg-[#1a1a1a]">
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
            <div className="overflow-y-auto max-h-[240px]">
              {filteredBanks.length === 0 ? (
                <div className="px-4 py-8 text-center text-white/50 text-sm">
                  No banks found
                </div>
              ) : (
                filteredBanks.map((bank) => {
                  const isSelected = bank.institutionCode === value;
                  return (
                    <button
                      key={bank.institutionCode}
                      type="button"
                      onClick={() => {
                        onValueChange(bank.institutionCode);
                        setOpen(false);
                        setSearchQuery("");
                      }}
                      className={cn(
                        "w-full px-4 py-3 text-left flex items-center justify-between",
                        "hover:bg-white/10 transition-colors",
                        isSelected && "bg-white/10"
                      )}
                    >
                      <span className="text-white">{bank.institutionName}</span>
                      {isSelected && (
                        <Check size={16} className="text-white flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

