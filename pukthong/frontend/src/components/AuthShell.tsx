/**
 * โครงหน้าจอของ "เข้าสู่ระบบ" กับ "สมัครสมาชิก" — ธีม "ม้วนใบเสร็จ" แบบเดียวกับ
 * หน้างบประมาณ/รายงาน (พื้น paper, โลโก้แทนไอคอนอีโมจิ) แทนธีมพื้นเข้มชุดก่อนหน้า
 *
 * สองหน้านั้นต่างกันแค่ช่องกรอก จึงรวมส่วนที่เหมือนกันไว้ที่นี่
 */
import { Logo } from "./Logo";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-paper px-7 py-10 text-ink">
      <div className="mx-auto w-full max-w-sm">{children}</div>
    </div>
  );
}

export function AuthBrand({ tagline }: { tagline: React.ReactNode }) {
  return (
    <div className="mb-9 flex flex-col items-center gap-3">
      <Logo variant="full" height={96} />
      <p className="text-center text-sm leading-relaxed text-ink/60">{tagline}</p>
    </div>
  );
}

export function AuthField({
  label,
  className = "",
  ...props
}: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <input
        {...props}
        className={`rounded-lg border border-kraft bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-stamp focus:outline-none focus:ring-1 focus:ring-stamp ${className}`}
      />
    </label>
  );
}

/**
 * checkbox ยอมรับข้อตกลง — ตอนนี้ validate ฝั่ง frontend อย่างเดียว (required บังคับติ๊ก
 * ก่อนส่งฟอร์มได้) ยังไม่มีการส่งค่านี้ไป backend และยังไม่มีหน้า /terms, /privacy จริง
 * จึงใส่ไว้เป็นข้อความเฉยๆ ก่อน ไม่ผูกลิงก์ กันไม่ให้กดแล้วเจอ 404
 */
export function AuthCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink/70">
      <input
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-kraft text-stamp focus:outline-none focus:ring-1 focus:ring-stamp"
      />
      <span>{children}</span>
    </label>
  );
}

/** ข้อความไทยจาก body.detail ของ backend — ไม่แปลงข้อความเองที่ฝั่งนี้ */
export function AuthError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-stamp/40 bg-stamp/5 px-3 py-2 text-xs leading-relaxed text-stamp"
    >
      {message}
    </p>
  );
}

export function AuthSubmit({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1.5 w-full rounded-lg bg-stamp py-3 text-sm font-semibold text-white transition hover:bg-stamp/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}