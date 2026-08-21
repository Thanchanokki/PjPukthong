import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AuthBrand,
  AuthError,
  AuthField,
  AuthShell,
  AuthSubmit,
} from "../components/AuthShell";
import { useAuth } from "../auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // เช็คตรงนี้เพราะ backend ไม่รู้จักช่อง "ยืนยันรหัสผ่าน" (เป็นเรื่องของฟอร์มล้วนๆ)
    if (password !== confirm) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setError("");
    setPending(true);
    try {
      // สมัครแล้วได้ token มาเลย ไม่ต้องให้กรอกซ้ำเพื่อเข้าสู่ระบบ
      await register(name, email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <AuthShell>
      <AuthBrand tagline="สร้างบัญชีเพื่อเก็บใบเสร็จของคุณไว้ที่เดียว" />

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <AuthField
          label="ชื่อ"
          autoComplete="name"
          required
          maxLength={100}
          placeholder="ชื่อที่ใช้แสดงในแอป"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="อย่างน้อย 8 ตัวอักษร"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthField
          label="ยืนยันรหัสผ่าน"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <AuthError message={error} />}
        <AuthSubmit pending={pending} pendingLabel="กำลังสมัคร…">
          สมัครสมาชิก
        </AuthSubmit>
      </form>

      <p className="mt-7 text-center text-xs text-[#a89f8d]">
        มีบัญชีแล้ว?{" "}
        <Link to="/login" className="font-semibold text-stamp">
          เข้าสู่ระบบ
        </Link>
      </p>
    </AuthShell>
  );
}
