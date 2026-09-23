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
    }
  )
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
 * Stellar Wallet State Management
 *
 * Global state for the connected Stellar wallet (address + which wallet
 * module the user picked). No context provider needed — zustand stores
 * are globally shared without one, unlike wagmi's WagmiProvider.
 */

interface StellarWalletState {
  address: string | null;
  walletId: string | null;
  _hasHydrated: boolean;

  setWallet: (address: string, walletId: string) => void;
  clearWallet: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useStellarWalletStore = create<StellarWalletState>()(
  persist(
    (set) => ({
      address: null,
      walletId: null,
      _hasHydrated: false,

      setWallet: (address, walletId) => set({ address, walletId }),
      clearWallet: () => set({ address: null, walletId: null }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "stellar-wallet-storage",
      partialize: (state) => ({ address: state.address, walletId: state.walletId }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/**
 * EVM Wallet State Management (bridge tab only)
 *
 * Deliberately read-mostly: address + chainName for display/balance
 * lookups, not a full wagmi-style connector — the bridge's EVM leg is
 * custodial (see BridgeService), the connected wallet is only used to
 * read the user's own address/chain/balance and, for Send, to trigger an
 * eth_sendTransaction the wallet itself prompts the user to approve. We
 * never hold or touch their private key.
 */
interface EvmWalletState {
  address: string | null;
  chainName: string | null;
  setWallet: (address: string, chainName: string | null) => void;
  clearWallet: () => void;
}

export const useEvmWalletStore = create<EvmWalletState>()((set) => ({
  address: null,
  chainName: null,
  setWallet: (address, chainName) => set({ address, chainName }),
  clearWallet: () => set({ address: null, chainName: null }),
}));

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

export type TabType = "buy" | "sell" | "swap";
// A corridor's stablecoin code (e.g. "CNGN", "CGHS") or "USDC" — driven by
// the active corridor registry (see useCorridors), not a fixed set.
export type CryptoType = string;
export type StepType = "form" | "pending" | "completed" | "execute";

interface TransactionFormState {
  // Tab and crypto selection
  activeTab: TabType;
  cryptoType: CryptoType;
  // Which stablecoin the Buy tab delivers — a corridor code (Stellar) or a
  // ChainToken code (buyPayoutChain is an EVM chain), scoped by
  // buyPayoutChain below. Separate from `cryptoType` (Sell/Swap).
  buyCryptoType: CryptoType;
  // Which chain Buy delivers on — defaults to 'stellar' (today's only
  // behavior). Any other registered chain routes through the
  // custodial swap+bridge delivery path server-side.
  buyPayoutChain: string;
  // Fiat currency Buy pays with — independent of buyCryptoType/buyPayoutChain
  // now that the target stablecoin isn't always the paying corridor's own
  // (e.g. paying NGN to receive BRZ on Polygon has no shared corridor).
  buyFiatCurrency: string;
  // Which corridor's fiat the Sell tab pays out to — separate from
  // `cryptoType` (what's being sold), since Sell can now sell any
  // tradeable asset while still choosing its own local fiat destination.
  sellPayoutCryptoType: CryptoType;
  // Which chain Sell sells FROM — defaults to 'stellar' (today's only
  // behavior, using the existing Stellar swap/offramp path). Any other
  // registered chain routes through the self-custodial bridge + fiat-payout
  // path (payoutFiat on BridgeTransfer).
  sellSourceChain: string;
  // Which chain the same-chain Swap tab trades on — defaults to 'stellar'
  // (today's only behavior, PathPaymentStrictSend via the connected
  // Stellar wallet). Any other registered EVM chain instead does a plain
  // self-custodial 0x swap on that chain, no bridging involved at all.
  swapChain: string;
  fromCryptoType: CryptoType;
  toCryptoType: CryptoType;

  // Form fields
  sellAmount: string;
  buyAmount: string;
  bankCode: string;
  accountNumber: string;
  walletAddress: string;

  // Transaction state
  step: StepType;
  transactionData: any;
  swapData: any;

  // Modal states
  isCryptoModalOpen: boolean;
  isSellPayoutCryptoModalOpen: boolean;
  isFromCryptoModalOpen: boolean;
  isToCryptoModalOpen: boolean;
  isBuyFiatCurrencyModalOpen: boolean;
  isAuthModalOpen: boolean;

  // Actions
  setActiveTab: (tab: TabType) => void;
  setCryptoType: (type: CryptoType) => void;
  setBuyCryptoType: (type: CryptoType) => void;
  setBuyPayoutChain: (chain: string) => void;
  setBuyFiatCurrency: (currency: string) => void;
  setSellPayoutCryptoType: (type: CryptoType) => void;
  setSellSourceChain: (chain: string) => void;
  setSwapChain: (chain: string) => void;
  setFromCryptoType: (type: CryptoType) => void;
  setToCryptoType: (type: CryptoType) => void;
  setSellAmount: (amount: string) => void;
  setBuyAmount: (amount: string) => void;
  setBankCode: (code: string) => void;
  setAccountNumber: (number: string) => void;
  setWalletAddress: (address: string) => void;
  setStep: (step: StepType) => void;
  setTransactionData: (data: any) => void;
  setSwapData: (data: any) => void;
  setIsCryptoModalOpen: (open: boolean) => void;
  setIsSellPayoutCryptoModalOpen: (open: boolean) => void;
  setIsFromCryptoModalOpen: (open: boolean) => void;
  setIsToCryptoModalOpen: (open: boolean) => void;
  setIsBuyFiatCurrencyModalOpen: (open: boolean) => void;
  setIsAuthModalOpen: (open: boolean) => void;
  resetForm: () => void;
}

export const useTransactionStore = create<TransactionFormState>((set) => ({
  // Initial state
  activeTab: "buy",
  cryptoType: "CNGN",
  buyCryptoType: "CNGN",
  buyPayoutChain: "stellar",
  buyFiatCurrency: "NGN",
  sellPayoutCryptoType: "CNGN",
  sellSourceChain: "stellar",
  swapChain: "stellar",
  fromCryptoType: "USDC",
  toCryptoType: "CNGN",
  sellAmount: "",
  buyAmount: "",
  bankCode: "",
  accountNumber: "",
  walletAddress: "",
  step: "form",
  transactionData: null,
  swapData: null,
  isCryptoModalOpen: false,
  isSellPayoutCryptoModalOpen: false,
  isFromCryptoModalOpen: false,
  isToCryptoModalOpen: false,
  isBuyFiatCurrencyModalOpen: false,
  isAuthModalOpen: false,

  // Actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCryptoType: (type) => set({ cryptoType: type }),
  setBuyCryptoType: (type) => set({ buyCryptoType: type }),
  setBuyPayoutChain: (chain) => set({ buyPayoutChain: chain }),
  setBuyFiatCurrency: (currency) => set({ buyFiatCurrency: currency }),
  setSellPayoutCryptoType: (type) => set({ sellPayoutCryptoType: type }),
  setSellSourceChain: (chain) => set({ sellSourceChain: chain }),
  setSwapChain: (chain) => set({ swapChain: chain }),
  setFromCryptoType: (type) => set({ fromCryptoType: type }),
  setToCryptoType: (type) => set({ toCryptoType: type }),
  setSellAmount: (amount) => set({ sellAmount: amount }),
  setBuyAmount: (amount) => set({ buyAmount: amount }),
  setBankCode: (code) => set({ bankCode: code }),
  setAccountNumber: (number) => set({ accountNumber: number }),
  setWalletAddress: (address) => set({ walletAddress: address }),
  setStep: (step) => set({ step }),
  setTransactionData: (data) => set({ transactionData: data }),
  setSwapData: (data) => set({ swapData: data }),
  setIsCryptoModalOpen: (open) => set({ isCryptoModalOpen: open }),
  setIsSellPayoutCryptoModalOpen: (open) => set({ isSellPayoutCryptoModalOpen: open }),
  setIsFromCryptoModalOpen: (open) => set({ isFromCryptoModalOpen: open }),
  setIsToCryptoModalOpen: (open) => set({ isToCryptoModalOpen: open }),
  setIsBuyFiatCurrencyModalOpen: (open) => set({ isBuyFiatCurrencyModalOpen: open }),
  setIsAuthModalOpen: (open) => set({ isAuthModalOpen: open }),
  resetForm: () => set({
    step: "form",
    transactionData: null,
    swapData: null,
    sellAmount: "",
    buyAmount: "",
    bankCode: "",
    accountNumber: "",
    walletAddress: "",
  }),
}));
