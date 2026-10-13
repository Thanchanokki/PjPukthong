import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth";
import { ArrowLeftIcon, DoorIcon, PersonIcon } from "../components/icons";

/**
 * หน้าตั้งค่า — เปิดจากไอคอนเฟืองที่หน้าหลัก
 *
 * ตอนนี้มี: ข้อมูลบัญชี (อ่านอย่างเดียว ยังไม่มีหน้าแก้ไขโปรไฟล์จริง), ทางลัดไปหน้า
 * "หมวดหมู่" (ย้ายมาจากแถบบนเดิมที่ถูกลบไป), กับปุ่มออกจากระบบ (ย้ายมาจากหน้าหลัก)
 *
 * ของที่ยังไม่ได้ทำ แต่เป็นที่ๆ ควรใส่ทีหลัง: แก้ชื่อ/อีเมล, เปลี่ยนรหัสผ่าน, ตั้งสกุลเงิน,
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

      {/* ข้อมูลบัญชี — อ่านอย่างเดียวตอนนี้ ยังไม่มีฟอร์มแก้ไขจริง */}
      <section className="flex items-center gap-3 rounded-xl border border-kraft bg-white p-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink/10 text-ink/50">
          <PersonIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{user?.name ?? "ผู้ใช้"}</p>
          <p className="truncate text-sm text-ink/55">{user?.email ?? "-"}</p>
        </div>
      </section>

      {/* ทางลัดไปหน้าอื่นที่ไม่ได้อยู่ใน bottom nav */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-ink/60">จัดการ</h2>
        <ul className="divide-y divide-kraft overflow-hidden rounded-xl border border-kraft bg-white">
          <SettingsRow label="หมวดหมู่" hint="จัดการหมวดรายจ่าย" onClick={() => navigate("/categories")} />
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