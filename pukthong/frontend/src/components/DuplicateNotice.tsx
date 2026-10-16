/**
 * แจ้งว่าใบเสร็จนี้เคยบันทึกแล้ว — ใช้ทั้งหลังอัปโหลด (รูปเดิม) และหลังอ่าน (ถ่ายใบเดิมใหม่)
 *
 * ไม่มีปุ่ม "บันทึกต่อ" โดยตั้งใจ: ใบเดียวกันบันทึกซ้ำ = รายจ่ายถูกนับสองครั้งในรายงานและงบ
 * backend ก็ปฏิเสธการบันทึกซ้ำ (409) อยู่แล้ว ปุ่มนี้แค่บอกผู้ใช้ให้รู้ก่อนเสียเวลากรอก
 */
import type { DuplicateInfo } from "../api";
import { fmt, money } from "./FormFields";

const thaiDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

export function DuplicateNotice({
  dup,
  onScanOther,
  onOpenExisting,
}: {
  dup: DuplicateInfo;
  onScanOther: () => void;
  onOpenExisting: () => void;
}) {
  return (
    <div role="alert" className="space-y-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-red-900">
      <div>
        <p className="font-bold">ใบเสร็จนี้เคยสแกนและบันทึกแล้ว</p>
        <p className="mt-0.5 text-sm text-red-800/80">ระบบไม่ให้บันทึกซ้ำ เพื่อไม่ให้รายจ่ายถูกนับสองครั้ง</p>
      </div>
      <div className="rounded-2xl bg-white px-4 py-3 text-sm text-ink">
        <div className="flex justify-between gap-3">
          <span className="min-w-0 truncate font-medium">{dup.merchant_name ?? "(ไม่ระบุร้าน)"}</span>
          <span className="shrink-0 font-bold tabular-nums">฿{fmt(money(dup.total) ?? 0)}</span>
        </div>
        <p className="mt-0.5 text-xs text-ink/55">บันทึกไว้เป็นรายการวันที่ {thaiDate(dup.purchased_at)}</p>
        <p className="mt-1 text-xs text-ink/45">เหตุผล: {dup.reason}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onOpenExisting} className="btn-ghost flex-1">
          ดูรายการเดิม
        </button>
        <button type="button" onClick={onScanOther} className="btn flex-1 bg-pine text-white hover:bg-pine-dark">
          สแกนใบอื่น
        </button>
      </div>
    </div>
  );
}
