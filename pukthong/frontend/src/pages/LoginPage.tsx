import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  AuthBrand,
  AuthError,
  AuthField,
  AuthShell,
  AuthSubmit,
} from "../components/AuthShell";
import { useAuth } from "../auth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // ถูกเด้งมาจากหน้าที่ต้องล็อกอิน — ล็อกอินเสร็จพากลับไปหน้าเดิม
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <AuthShell>
      <AuthBrand
        tagline={
          <>
            สแกนใบเสร็จ บันทึกรายรับ-รายจ่าย
            <br />
            ง่ายในไม่กี่วินาที
          </>
        }
      />

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <AuthField
          label="อีเมล"
          type="email"
          autoComplete="email"
          required
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          label="รหัสผ่าน"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <AuthError message={error} />}
        <AuthSubmit pending={pending} pendingLabel="กำลังเข้าสู่ระบบ…">
          เข้าสู่ระบบ
        </AuthSubmit>
      </form>

      <p className="mt-7 text-center text-xs text-[#a89f8d]">
        ยังไม่มีบัญชี?{" "}
        <Link to="/register" className="font-semibold text-stamp">
          สมัครสมาชิก
        </Link>
      </p>
    </AuthShell>
  );
}
