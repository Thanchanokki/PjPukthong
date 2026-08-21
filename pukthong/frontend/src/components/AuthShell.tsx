/**
 * โครงหน้าจอของ "เข้าสู่ระบบ" กับ "สมัครสมาชิก" — แปลงมาจาก SCREEN 0 ของ
 * docs/pukthong-uxui-mockup.html (ธีมม้วนใบเสร็จ พื้นเข้ม + ปุ่มสี stamp)
 *
 * สองหน้านั้นต่างกันแค่ช่องกรอก จึงรวมส่วนที่เหมือนกันไว้ที่นี่
 */

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-ink px-7 py-10 text-paper">
      {/* วงแสงสี stamp มุมขวาบน ตามที่ mockup วาดไว้ด้วย ::before */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(189,74,60,.25), transparent 70%)",
        }}
      />
      <div className="relative z-10 mx-auto w-full max-w-sm">{children}</div>
    </div>
  );
}

export function AuthBrand({ tagline }: { tagline: React.ReactNode }) {
  return (
    <div className="mb-9 flex flex-col items-center gap-2.5">
      <div className="flex h-14 w-14 -rotate-[4deg] items-center justify-center rounded-sm bg-stamp text-[26px] shadow-[0_10px_20px_-8px_rgba(189,74,60,.6)]">
        🧾
      </div>
      <h1 className="text-lg font-bold tracking-wide">Pukthong</h1>
      <p className="text-center font-mono text-[11px] leading-relaxed text-[#a89f8d]">
        {tagline}
      </p>
    </div>
  );
}

export function AuthField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-[#a89f8d]">
        {label}
      </span>
      <input
        {...props}
        className="rounded-sm border border-white/20 bg-white/5 px-3 py-3 text-sm text-paper placeholder:text-[#6b6355] focus:border-stamp focus:outline-none"
      />
    </label>
  );
}

/** ข้อความไทยจาก body.detail ของ backend — ไม่แปลงข้อความเองที่ฝั่งนี้ */
export function AuthError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-sm border border-stamp/60 bg-stamp/15 px-3 py-2 text-xs leading-relaxed text-[#f0c9c3]"
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
      className="mt-1.5 w-full rounded-sm bg-stamp py-3.5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
