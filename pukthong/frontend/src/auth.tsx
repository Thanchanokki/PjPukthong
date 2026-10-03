/**
 * สถานะการล็อกอินของทั้งแอป — token อยู่ใน localStorage ส่วนข้อมูลผู้ใช้ยืนยันกับ
 * backend ทุกครั้งที่เปิดแอปผ่าน /api/auth/me (token อาจหมดอายุไปแล้วระหว่างปิดแท็บ)
 *
 * ⚠️ token ต้องเป็น React state ไม่ใช่การอ่าน localStorage ตอน render
 *
 * เดิมโค้ดเรียก getToken() ตรงๆ ใน render ซึ่ง React ไม่มีทางรู้ว่าค่าใน localStorage
 * เปลี่ยน — กด "ออกจากระบบ" แล้ว clearToken() ทำงานจริงแต่หน้าจอไม่ re-render
 * ผู้ใช้จึงยังเห็นตัวเองล็อกอินอยู่เหมือนปุ่มเสีย เก็บเป็น state ทำให้ทุกการเปลี่ยน
 * token ดันหน้าจอให้อัปเดตแน่นอน
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type AuthResult,
  type AuthUser,
  TOKEN_KEY,
  UNAUTHORIZED_EVENT,
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
  const [token, setTokenState] = useState<string | null>(() => getToken());

  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    // ไม่มี token ก็ไม่ต้องยิงให้เสียเที่ยว — อิง state จึงตอบสนองตอน logout ทันที
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
  });

  const signOut = useCallback(() => {
    clearToken();
    // ลำดับสำคัญ: ล้าง state ก่อน แล้วค่อยล้าง cache
    // ไม่งั้น query ["me"] อาจถูกยิงซ้ำด้วย token ที่เพิ่งถูกลบไป
    setTokenState(null);
    // ต้องล้าง cache ทั้งก้อน ไม่งั้นรายการของคนก่อนหน้าค้างให้คนถัดไปเห็น
    qc.clear();
  }, [qc]);

  const apply = useCallback(
    (result: AuthResult) => {
      setToken(result.token);
      setTokenState(result.token);
      // เขียนลง cache เลย เพื่อไม่ต้องรอ /me อีกรอบก่อนเข้าหน้าแรก
      qc.setQueryData(["me"], result.user);
    },
    [qc],
  );

  /**
   * token หมดอายุระหว่างใช้งาน (backend ตอบ 401) ต้องเด้งออกให้เอง
   *
   * api.ts ทิ้ง token ไปแล้วตอนเจอ 401 แต่ถ้าไม่บอก React ผู้ใช้จะค้างอยู่หน้าเดิม
   * แล้วเจอ error รัวๆ ทุกปุ่มที่กด โดยไม่รู้ว่าต้องล็อกอินใหม่
   */
  useEffect(() => {
    const onUnauthorized = () => signOut();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [signOut]);

  /**
   * ออกจากระบบในแท็บหนึ่ง ต้องออกทุกแท็บ
   *
   * event 'storage' ยิงเฉพาะแท็บอื่น (ไม่ยิงแท็บที่เป็นคนแก้เอง) จึงใช้ซิงก์ได้ตรงๆ
   */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TOKEN_KEY) return;
      if (e.newValue) setTokenState(e.newValue);
      else signOut();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [signOut]);

  const value = useMemo<AuthValue>(
    () => ({
      /**
       * ไม่มี token = ไม่มีผู้ใช้ ไม่ว่าใน cache จะเหลืออะไรอยู่
       * กันไม่ให้ข้อมูลค้างใน cache ทำให้ดูเหมือนยังล็อกอินอยู่หลังกดออกจากระบบ
       */
      user: token ? (data ?? null) : null,
      // token ถูกทิ้งไปแล้ว (เช่นโดน 401) ก็ไม่ต้องรออะไรอีก
      isLoading: isLoading && Boolean(token),
      login: async (email, password) => apply(await loginAccount(email, password)),
      register: async (name, email, password) =>
        apply(await registerAccount(name, email, password)),
      logout: signOut,
    }),
    [apply, data, isLoading, signOut, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth ต้องอยู่ภายใน <AuthProvider>");
  return ctx;
}
