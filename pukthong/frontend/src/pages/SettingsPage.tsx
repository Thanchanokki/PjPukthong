import { type FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth";
import {
  ArrowLeftIcon,
  CameraIcon,
  DoorIcon,
  PencilIcon,
  PersonIcon,
} from "../components/icons";

/**
 * หน้าตั้งค่า — เปิดจากไอคอนเฟืองที่หน้าหลัก
 *
 * ตอนนี้มี: ข้อมูลบัญชี (แก้ชื่อ/อีเมล/รูปโปรไฟล์ — เชื่อมกับ backend จริงแล้ว ผ่าน
 * useAuth().updateProfile/uploadAvatar ดูคอมเมนต์ที่ ProfileCard), ทางลัดไปหน้า
 * "หมวดหมู่" (ย้ายมาจากแถบบนเดิมที่ถูกลบไป), กับปุ่มออกจากระบบ (ย้ายมาจากหน้าหลัก)
 *
 * ของที่ยังไม่ได้ทำ แต่เป็นที่ๆ ควรใส่ทีหลัง: เปลี่ยนรหัสผ่าน, ตั้งสกุลเงิน,
 * การแจ้งเตือน (เช่น เตือนใกล้ครบงบ) — วางโครงหน้าไว้ให้แล้ว เพิ่มทีละ section ได้เลย
 */

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-4 text-ink">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="กลับหน้าหลัก"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/60 hover:bg-ink/5"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold">ตั้งค่า</h1>
      </header>

      <ProfileCard />

      {/* ทางลัดไปหน้าอื่นที่ไม่ได้อยู่ใน bottom nav */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-ink/60">จัดการ</h2>
        <ul className="divide-y divide-kraft overflow-hidden rounded-xl border border-kraft bg-white">
          <SettingsRow label="หมวดหมู่" hint="จัดการหมวดรายจ่าย" onClick={() => navigate("/categories")} />
          <SettingsRow label="ลดหย่อนภาษี" hint="สรุปเบี้ยประกันรายปี" onClick={() => navigate("/tax")} />
          <SettingsRow label="สกุลเงิน" hint={user?.currency ?? "THB"} disabled />
        </ul>
      </section>

      {/* ออกจากระบบ — แยกการ์ดต่างหากให้ดูต่างจากเมนูทั่วไป กันกดพลาด */}
      <section>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl border border-stamp/30 bg-stamp/5 px-4 py-3.5 text-left text-stamp hover:bg-stamp/10"
        >
          <DoorIcon className="h-5 w-5 shrink-0" />
          <span className="font-medium">ออกจากระบบ</span>
        </button>
      </section>

      <p className="pt-2 text-center text-xs text-ink/35">ปุ๊กทอง (Pukthong) · v0.1.0</p>
    </div>
  );
}

/** วงกลมรูปโปรไฟล์ — โชว์รูปที่เลือกไว้ (ถ้ามี) ไม่งั้น fallback เป็นไอคอนคน */
function Avatar({ src, size = "h-12 w-12" }: { src: string | null | undefined; size?: string }) {
  if (src) {
    return <img src={src} alt="" className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-ink/10 text-ink/50`}>
      <PersonIcon className="h-6 w-6" />
    </span>
  );
}

/**
 * การ์ดข้อมูลบัญชี — แก้ชื่อ/อีเมล/รูปโปรไฟล์ เชื่อมกับ backend จริงแล้ว ผ่าน
 * useAuth().updateProfile (PATCH /api/auth/me) และ useAuth().uploadAvatar
 * (POST /api/auth/me/avatar) — error จาก backend (เช่น 409 อีเมลซ้ำ) โชว์เป็น
 * ข้อความใต้ฟอร์ม
 *
 * รูปที่เลือกจะแสดงพรีวิวจาก user.avatar_url ที่ backend ตอบกลับมาหลังอัปโหลดสำเร็จ
 * (ไม่ใช่ object URL ในเครื่องแบบเดิมอีกต่อไป เพราะตอนนี้อัปโหลดขึ้นจริงแล้ว)
 */
function ProfileCard() {
  const { user, updateProfile, uploadAvatar } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setError(null);
    setEditing(true);
  };

  const pickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      await uploadAvatar(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const avatarPicker = (
    <div className="relative shrink-0">
      <Avatar src={user?.avatar_url} />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        aria-label="เปลี่ยนรูปโปรไฟล์"
        disabled={uploadingAvatar}
        className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-stamp text-white ring-2 ring-white hover:bg-stamp/90 disabled:opacity-60"
      >
        <CameraIcon className="h-3 w-3" />
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        onChange={pickAvatar}
        className="hidden"
      />
    </div>
  );

  if (editing) {
    return (
      <section className="rounded-xl border border-kraft bg-white p-4">
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-3">
            {avatarPicker}
            <p className="text-xs text-ink/45">
              {uploadingAvatar ? "กำลังอัปโหลดรูป…" : "แตะไอคอนกล้องเพื่อเปลี่ยนรูป"}
            </p>
          </div>
          <Field label="ชื่อ" value={name} onChange={setName} />
          <Field label="อีเมล" value={email} onChange={setEmail} type="email" />
          {error && <p className="text-xs text-stamp">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-stamp px-4 py-2 text-sm font-medium text-white hover:bg-stamp/90 disabled:opacity-60"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-lg px-3 py-2 text-sm text-ink/60 hover:bg-ink/5"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-kraft bg-white p-4">
      <div className="flex items-center gap-3">
        {avatarPicker}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{user?.name ?? "ผู้ใช้"}</p>
          <p className="truncate text-sm text-ink/55">{user?.email ?? "-"}</p>
        </div>
        <button
          type="button"
          onClick={startEdit}
          aria-label="แก้ไขข้อมูลบัญชี"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/40 hover:bg-ink/5"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-stamp">{error}</p>}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink/55">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoFocus={label === "ชื่อ"}
        className="w-full rounded-lg border border-kraft bg-white px-3 py-2 text-sm focus:border-stamp focus:outline-none focus:ring-1 focus:ring-stamp"
      />
    </label>
  );
}

function SettingsRow({
  label,
  hint,
  onClick,
  disabled,
}: {
  label: string;
  hint?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left disabled:cursor-default"
      >
        <span className="font-medium">{label}</span>
        <span className="flex items-center gap-1 text-sm text-ink/45">
          {hint}
          {!disabled && <span aria-hidden>›</span>}
        </span>
      </button>
    </li>
  );
}