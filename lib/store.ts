import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * User State Management
 *
 * Global state for user authentication and profile data.
 */

export interface User {
  id: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  walletAddress?: string;
  isMerchant?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  _hasHydrated: boolean;

  // Actions
  setAuth: (user: User, token: string) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      _hasHydrated: false,

      setAuth: (user, token) => {
        set({
          user,
          token,
        });
        // Also store in localStorage for API interceptor
        if (typeof window !== "undefined") {
          localStorage.setItem("token", token);
        }
      },

      updateUser: (updates) => {
        const currentUser = get().user;
        if (currentUser) {
          const updatedUser = { ...currentUser, ...updates };
          set({
            user: updatedUser,
          });
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
        });
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          localStorage.removeItem("auth-storage");
        }
      },

      setHasHydrated: (state) => {
        set({
          _hasHydrated: state,
        });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        // Sync token to localStorage if it exists in store
        if (state?.token && typeof window !== "undefined") {
          localStorage.setItem("token", state.token);
        }
      },
    },
  ),
);

/**
 * Selector functions for computed values
 * These should be used instead of directly accessing isAuthenticated/isAdmin
 */
export const useIsAuthenticated = () => {
  return useAuthStore((state) => !!(state.user && state.token));
};

export const useIsAdmin = () => {
  return useAuthStore((state) => state.user?.role === "ADMIN");
};

/**
 * UI State Management
 *
 * Global state for UI elements like toasts, modals, etc.
 */

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
}

interface UIState {
  toasts: Toast[];
  isSidebarOpen: boolean;

  // Actions
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  toasts: [],
  isSidebarOpen: true,

  addToast: (toast) => {
    const id = Math.random().toString(36).substring(7);
    set({ toasts: [...get().toasts, { ...toast, id }] });
    // Auto-remove after 5 seconds
    setTimeout(() => {
      get().removeToast(id);
    }, 5000);
  },

  removeToast: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  toggleSidebar: () => {
    set({ isSidebarOpen: !get().isSidebarOpen });
  },

  setSidebarOpen: (open) => {
    set({ isSidebarOpen: open });
  },
}));

/**
 * Transaction Form State Management
 *
 * Global state for transaction form (buy, sell, swap)
 */

export type TabType = "buy" | "sell" | "swap" | "bridge" | "otc";
export type CryptoType = "CNGN" | "USDC" | "USDT";
export type StepType = "form" | "pending" | "completed" | "execute";

interface TransactionFormState {
  // Tab and crypto selection
  activeTab: TabType;
  cryptoType: CryptoType;
  fromCryptoType: CryptoType;
  toCryptoType: CryptoType;

  // Form fields
  sellAmount: string;
  buyAmount: string;
  bankCode: string;
  accountNumber: string;
  walletAddress: string;
  fromChain: string;
  toChain: string;

  // Transaction state
  step: StepType;
  transactionData: any;
  swapData: any;

  // Modal states
  isCryptoModalOpen: boolean;
  isFromCryptoModalOpen: boolean;
  isToCryptoModalOpen: boolean;
  isAuthModalOpen: boolean;

  // Actions
  setActiveTab: (tab: TabType) => void;
  setCryptoType: (type: CryptoType) => void;
  setFromCryptoType: (type: CryptoType) => void;
  setToCryptoType: (type: CryptoType) => void;
  setSellAmount: (amount: string) => void;
  setBuyAmount: (amount: string) => void;
  setBankCode: (code: string) => void;
  setAccountNumber: (number: string) => void;
  setWalletAddress: (address: string) => void;
  setFromChain: (chain: string) => void;
  setToChain: (chain: string) => void;
  setStep: (step: StepType) => void;
  setTransactionData: (data: any) => void;
  setSwapData: (data: any) => void;
  setIsCryptoModalOpen: (open: boolean) => void;
  setIsFromCryptoModalOpen: (open: boolean) => void;
  setIsToCryptoModalOpen: (open: boolean) => void;
  setIsAuthModalOpen: (open: boolean) => void;
  resetForm: () => void;
}

export const useTransactionStore = create<TransactionFormState>((set) => ({
  // Initial state
  activeTab: "buy",
  cryptoType: "CNGN",
  fromCryptoType: "USDC",
  toCryptoType: "CNGN",
  sellAmount: "",
  buyAmount: "",
  bankCode: "",
  accountNumber: "",
  walletAddress: "",
  fromChain: "Ethereum",
  toChain: "Base",
  step: "form",
  transactionData: null,
  swapData: null,
  isCryptoModalOpen: false,
  isFromCryptoModalOpen: false,
  isToCryptoModalOpen: false,
  isAuthModalOpen: false,

  // Actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCryptoType: (type) => set({ cryptoType: type }),
  setFromCryptoType: (type) => set({ fromCryptoType: type }),
  setToCryptoType: (type) => set({ toCryptoType: type }),
  setSellAmount: (amount) => set({ sellAmount: amount }),
  setBuyAmount: (amount) => set({ buyAmount: amount }),
  setBankCode: (code) => set({ bankCode: code }),
  setAccountNumber: (number) => set({ accountNumber: number }),
  setWalletAddress: (address) => set({ walletAddress: address }),
  setFromChain: (chain) => set({ fromChain: chain }),
  setToChain: (chain) => set({ toChain: chain }),
  setStep: (step) => set({ step }),
  setTransactionData: (data) => set({ transactionData: data }),
  setSwapData: (data) => set({ swapData: data }),
  setIsCryptoModalOpen: (open) => set({ isCryptoModalOpen: open }),
  setIsFromCryptoModalOpen: (open) => set({ isFromCryptoModalOpen: open }),
  setIsToCryptoModalOpen: (open) => set({ isToCryptoModalOpen: open }),
  setIsAuthModalOpen: (open) => set({ isAuthModalOpen: open }),
  resetForm: () =>
    set({
      step: "form",
      transactionData: null,
      swapData: null,
      sellAmount: "",
      buyAmount: "",
      bankCode: "",
      accountNumber: "",
      walletAddress: "",
      fromChain: "Ethereum",
      toChain: "Base",
    }),
}));
