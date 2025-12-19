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
  isAuthenticated: boolean;
  isAdmin: boolean;
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
      isAuthenticated: false,
      isAdmin: false,
      _hasHydrated: false,
      
      setAuth: (user, token) => {
        set({
          user,
          token,
          isAuthenticated: true,
          isAdmin: user.role === "ADMIN",
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
          isAuthenticated: false,
          isAdmin: false,
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
        isAuthenticated: state.isAuthenticated,
        isAdmin: state.isAdmin,
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

