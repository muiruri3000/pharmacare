import * as React from "react";
import { authApi } from "@/lib/api/auth";
import { tokenStore } from "@/lib/api/client";
import type { AuthUser } from "@/lib/types";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  login: (username: string, password: string) => Promise<AuthUser | null>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isHydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const access = tokenStore.getAccess();
    if (access) {
      authApi
        .me()
        .then((u) => setUser(u))
        .catch(() => {
          tokenStore.clear();
          setUser(null);
        })
        .finally(() => setHydrated(true));
    } else {
      setHydrated(true);
    }
  }, []);

  const login = React.useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    if (res.user) {
      setUser(res.user);
      return res.user;
    }
    try {
      const me = await authApi.me();
      setUser(me);
      return me;
    } catch {
      const fallback: AuthUser = { id: 0, username };
      setUser(fallback);
      return fallback;
    }
  }, []);

  const logout = React.useCallback(() => {
    authApi.logout();
    setUser(null);
  }, []);

  const refreshUser = React.useCallback(async () => {
    const me = await authApi.me();
    setUser(me);
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: !!user, isHydrated, login, logout, refreshUser }),
    [user, isHydrated, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
