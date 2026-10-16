import { useEffect, useRef } from "react";

import type { Unsupported } from "../api";

const ICON: Record<Unsupported["kind"], string> = {
  transfer_slip: "🏦",
  handwritten: "✍️",
  not_receipt: "🖼️",
  no_items: "🧾",
};

/**
 * ป๊อปอัพเตือนเมื่อสแกนเอกสารที่ระบบไม่รองรับ (สลิปโอนเงิน บิลเขียนมือ รูปที่ไม่ใช่ใบเสร็จ)
 *
 * ไม่บล็อกการบันทึก — ปุ่มรองให้ปิดแล้วกรอกต่อเองได้ เพราะบางครั้งผู้ใช้ไม่มีใบเสร็จอื่นจริงๆ
 */
export function UnsupportedDialog({
  info,
  onRescan,
  onContinue,
}: {
  info: Unsupported;
  onRescan: () => void;
  onContinue: () => void;
}) {
  const primary = useRef<HTMLButtonElement>(null);

  // โฟกัสปุ่มหลักทันทีให้คนใช้คีย์บอร์ด/screen reader รู้ว่ามีป๊อปอัพขึ้นมา และกด Esc ปิดได้
  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onContinue();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContinue]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onContinue}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsupported-title"
        aria-describedby="unsupported-message"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-4xl" aria-hidden="true">
          {ICON[info.kind]}
        </div>
        <h2 id="unsupported-title" className="text-lg font-semibold text-ink">
          {info.title}
        </h2>
        <p id="unsupported-message" className="mt-2 text-sm leading-relaxed text-ink/70">
          {info.message}
        </p>
        <div className="mt-5 space-y-2">
          <button ref={primary} onClick={onRescan} className="btn-primary w-full">
            สแกนใบเสร็จใหม่
          </button>
          {/* รูปที่ไม่ใช่ใบเสร็จไม่มีอะไรให้กรอกต่อ แต่ยังปิดดูรูปได้ */}
          <button onClick={onContinue} className="btn-ghost w-full">
            {info.kind === "not_receipt" ? "ปิด" : info.kind === "no_items" ? "เพิ่มรายการเอง" : "กรอกเองต่อ"}
          </button>
        </div>
      </div>
    </div>
  );
}
