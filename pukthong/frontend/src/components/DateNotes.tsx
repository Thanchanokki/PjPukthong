import { useNavigate } from "react-router-dom";

import { monthName, shortDate, suspiciousDate } from "../dates";
import { WarningIcon } from "./icons";

/**
 * เตือนใต้ช่อง "วันที่ซื้อ" เมื่อวันที่อยู่ในอนาคตหรือห่างจากวันนี้เกิน 60 วัน
 * มักเกิดจาก AI สลับ พ.ศ./ค.ศ. — มีปุ่มแก้เป็นปีที่น่าจะถูกให้กดทีเดียว
 */
export function DateSanityNote({ date, onFix }: { date: string; onFix: (date: string) => void }) {
  const s = suspiciousDate(date);
  if (!s) return null;
  const text =
    s.days > 0
      ? `วันที่นี้อยู่ในอนาคตอีก ${s.days.toLocaleString("th-TH")} วัน`
      : `วันที่นี้ห่างจากวันนี้ ${(-s.days).toLocaleString("th-TH")} วัน`;
  return (
    <div role="status" className="mt-2 flex gap-2.5 rounded-lg bg-brass/20 px-3 py-2.5 text-sm text-ink">
      <WarningIcon className="mt-0.5 h-4 w-4 flex-none text-brass" aria-hidden="true" />
      <div className="space-y-1.5">
        <p>
          {text} — AI อาจอ่านปีผิด ตรวจปีบนใบเสร็จอีกครั้ง
        </p>
        {s.suggestion && (
          <button
            type="button"
            onClick={() => onFix(s.suggestion!)}
            className="min-h-[36px] rounded-md border border-brass bg-white px-3 text-sm font-semibold"
          >
            เปลี่ยนเป็น {shortDate(s.suggestion)}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * แจ้งหลังบันทึกเมื่อวันที่ซื้ออยู่คนละเดือนกับเดือนปัจจุบัน — ไม่งั้นผู้ใช้เปิดเดือนนี้แล้ว
 * ไม่เจอรายการที่เพิ่งสแกน และคิดว่าข้อมูลหาย
 */
export function SavedOtherMonthDialog({
  purchasedAt,
  merchant,
  total,
}: {
  purchasedAt: string;
  merchant: string | null;
  total: string;
}) {
  const navigate = useNavigate();
  const month = purchasedAt.slice(0, 7);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-other-month-title"
        className="w-full max-w-md space-y-4 rounded-t-2xl bg-paper px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7 text-center text-ink sm:rounded-2xl"
      >
        <h2 id="saved-other-month-title" className="text-lg font-bold">
          บันทึกลงเดือน{monthName(month)}แล้ว
        </h2>
        <p className="text-sm leading-relaxed text-ink/70">
          ระบบนับยอดตาม<strong className="text-ink">วันที่บนใบเสร็จ</strong> ({shortDate(purchasedAt)})
          <br />
          รายการนี้จึงไม่อยู่ในยอดของเดือนนี้
        </p>
        <div className="flex items-center justify-between rounded-xl border border-kraft bg-white px-4 py-3 text-left">
          <div className="min-w-0">
            <p className="truncate font-semibold">{merchant ?? "(ไม่ระบุร้าน)"}</p>
            <p className="text-xs text-ink/65">ซื้อ {shortDate(purchasedAt)}</p>
          </div>
          <span className="font-mono font-bold tabular-nums text-stamp">−฿{Number(total).toLocaleString("th-TH")}</span>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/monthly?month=${month}`)}
          className="min-h-[48px] w-full rounded-xl bg-pine font-semibold text-white hover:bg-pine-dark"
        >
          ไปดูเดือน{monthName(month).split(" ")[0]}
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="min-h-[48px] w-full rounded-xl border border-kraft bg-white font-medium"
        >
          กลับหน้าแรก
        </button>
      </div>
    </div>
  );
}
