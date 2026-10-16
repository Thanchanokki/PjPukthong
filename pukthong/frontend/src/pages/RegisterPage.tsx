import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AuthBrand,
  AuthCheckbox,
  AuthError,
  AuthField,
  AuthShell,
  AuthSubmit,
} from "../components/AuthShell";
import { TermsPrivacyModal, type TermsSection } from "../components/TermsPrivacyModal";
import { useAuth } from "../auth";

/** วว/ดด/ปปปป — ปีเป็น พ.ศ. ก็ได้ ยังไม่ validate ว่าเป็นวันที่จริง เพราะยังไม่ส่งไปไหน */
const BIRTHDATE_PATTERN = "^\\d{2}/\\d{2}/\\d{4}$";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  // "ชื่อผู้ใช้" ในดีไซน์ใหม่ ส่งไป backend เป็นช่อง name เดิม — backend ยังไม่มีคอลัมน์
  // username แยกต่างหาก เปลี่ยนแค่ label/placeholder ฝั่งนี้
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  /**
   * วันเกิด — เก็บไว้ในฟอร์มเฉยๆ ก่อน
   * ⚠️ ยังไม่ส่งไป backend: ตาราง users และ /api/auth/register ยังไม่มีคอลัมน์นี้
   * ตอนต่อจริง ต้องเพิ่ม birthdate ใน payload ของ registerAccount() ใน api.ts ด้วย
   */
  const [birthdate, setBirthdate] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  /** หัวข้อที่เปิดอ่านอยู่ — null = ปิดป๊อปอัพ */
  const [termsOpen, setTermsOpen] = useState<TermsSection | null>(null);
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
          label="ชื่อผู้ใช้"
          autoComplete="username"
          required
          maxLength={100}
          placeholder="username"
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
          label="วันเดือนปีเกิด"
          inputMode="numeric"
          required
          pattern={BIRTHDATE_PATTERN}
          title="กรอกรูปแบบ วว/ดด/ปปปป"
          placeholder="วว/ดด/ปปปป"
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
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
          placeholder="พิมพ์รหัสผ่านอีกครั้ง"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <AuthCheckbox checked={acceptedTerms} onChange={setAcceptedTerms}>
          ยอมรับ
          <TermsLink onClick={() => setTermsOpen("terms")}>ข้อตกลงการใช้งาน</TermsLink>
          และ
          <TermsLink onClick={() => setTermsOpen("privacy")}>นโยบายความเป็นส่วนตัว</TermsLink>
        </AuthCheckbox>

        {error && <AuthError message={error} />}
        <AuthSubmit pending={pending} pendingLabel="กำลังสมัคร…">
          สมัครสมาชิก
        </AuthSubmit>
      </form>

      <p className="mt-7 text-center text-xs text-ink/55">
        มีบัญชีแล้ว?{" "}
        <Link to="/login" className="font-semibold text-stamp">
          เข้าสู่ระบบ
        </Link>
      </p>

      {termsOpen && (
        <TermsPrivacyModal
          section={termsOpen}
          onClose={() => setTermsOpen(null)}
          onAccept={() => {
            setAcceptedTerms(true);
            setTermsOpen(null);
          }}
        />
      )}
    </AuthShell>
  );
}

/**
 * คำที่กดเปิดป๊อปอัพได้ในประโยค checkbox — ต้องเป็น type="button" ไม่งั้นจะ submit ฟอร์ม
 * และอยู่ใน <label> ได้โดยไม่ติ๊ก checkbox เพราะ browser ไม่ส่งคลิกปุ่มต่อให้ label
 */
function TermsLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-0.5 rounded font-medium text-stamp underline decoration-stamp/40 underline-offset-2 hover:decoration-stamp focus:outline-none focus-visible:ring-1 focus-visible:ring-stamp"
    >
      {children}
    </button>
  );
}