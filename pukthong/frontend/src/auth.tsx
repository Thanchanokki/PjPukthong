/**
 * สถานะการล็อกอินของทั้งแอป — token อยู่ใน localStorage ส่วนข้อมูลผู้ใช้ยืนยันกับ
 * backend ทุกครั้งที่เปิดแอปผ่าน /api/auth/me (token อาจหมดอายุไปแล้วระหว่างปิดแท็บ)
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo } from "react";

import {
  type AuthResult,
  type AuthUser,
  clearToken,
  fetchMe,
  getToken,
  loginAccount,
  registerAccount,
  setToken,
} from "./api";

type AuthValue = {
  user: AuthUser | null;
  /** true = ยังเช็ค token เดิมไม่เสร็จ ห้ามเพิ่งเด้งไปหน้า login */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    // ไม่มี token ก็ไม่ต้องยิงให้เสียเที่ยว
    enabled: Boolean(getToken()),
    retry: false,
    staleTime: Infinity,
  });

  const apply = useCallback(
    (result: AuthResult) => {
      setToken(result.token);
      // เขียนลง cache เลย เพื่อไม่ต้องรอ /me อีกรอบก่อนเข้าหน้าแรก
      qc.setQueryData(["me"], result.user);
    },
    [qc],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user: data ?? null,
      // token ถูกทิ้งไปแล้ว (เช่นโดน 401) ก็ไม่ต้องรออะไรอีก
      isLoading: isLoading && Boolean(getToken()),
      login: async (email, password) => apply(await loginAccount(email, password)),
      register: async (name, email, password) =>
        apply(await registerAccount(name, email, password)),
      logout: () => {
        clearToken();
        // ต้องล้าง cache ทั้งก้อน ไม่งั้นรายการของคนก่อนหน้าค้างให้คนถัดไปเห็น
        qc.clear();
      },
    }),
    [apply, data, isLoading, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth ต้องอยู่ภายใน <AuthProvider>");
  return ctx;
}
