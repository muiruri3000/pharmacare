import { apiFetch, tokenStore } from "./client";
import type { AuthUser } from "../types";

export interface LoginResponse {
  access: string;
  refresh: string;
  user?: AuthUser;
}

export const authApi = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const data = await apiFetch<LoginResponse>("/auth/login/", {
      method: "POST",
      body: { username, password },
      skipAuth: true,
    });
    if (data.access) tokenStore.set(data.access, data.refresh);
    return data;
  },
  async me(): Promise<AuthUser> {
    return apiFetch<AuthUser>("/auth/me/");
  },
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await apiFetch<void>("/auth/change-password/", {
      method: "POST",
      body: { old_password: oldPassword, new_password: newPassword },
    });
  },
  logout() {
    tokenStore.clear();
  },
};
