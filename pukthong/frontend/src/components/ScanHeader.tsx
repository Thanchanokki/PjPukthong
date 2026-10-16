/**
 * ส่วนหัวของ flow สแกนใบเสร็จ — ปุ่มย้อนกลับ + ชื่อหน้า + แถบขั้นตอน 1 ถ่าย · 2 ครอบ · 3 ตรวจสอบ
 *
 * ใช้ร่วมกันสามหน้า (ถ่ายใบเสร็จ / ครอบและส่ง / ตรวจสอบข้อมูล) ให้ผู้ใช้รู้ตลอดว่าอยู่ขั้นไหน
 */
import { ArrowLeftIcon, CheckIcon } from "./icons";

const STEPS = ["ถ่ายใบเสร็จ", "ครอบและส่ง", "ตรวจสอบ"];

export function ScanHeader({
  title,
  step,
  onBack,
}: {
  title: string;
  /** ขั้นปัจจุบัน 1–3 */
  step: 1 | 2 | 3;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="relative flex h-12 items-center justify-center">
        <button
          type="button"
          onClick={onBack}
          aria-label="ย้อนกลับ"
          className="absolute left-0 grid h-12 w-12 place-items-center rounded-2xl border border-slate-200 bg-white text-ink shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-ink">{title}</h1>
      </div>

      {/* วงกลมกับเส้นอยู่แถวเดียวกัน ชื่อขั้นตอนลอยอยู่กึ่งกลางใต้วงกลมของตัวเอง */}
      <ol className="flex items-center px-6 pb-7" aria-label={`ขั้นที่ ${step} จาก 3`}>
        {STEPS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const done = n < step;
          const current = n === step;
          return (
            <li key={label} className={`flex items-center ${n < 3 ? "flex-1" : ""}`}>
              <span className="relative">
                <span
                  aria-current={current ? "step" : undefined}
                  className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${
                    done
                      ? "bg-pine text-white"
                      : current
                        ? "border-2 border-pine bg-white text-pine ring-4 ring-mist"
                        : "border-2 border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {done ? <CheckIcon className="h-4 w-4" /> : n}
                </span>
                <span
                  className={`absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-xs ${
                    current ? "font-bold text-ink" : done ? "text-pine" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </span>
              {n < 3 && <span className={`mx-2 h-0.5 flex-1 rounded ${done ? "bg-pine" : "bg-slate-200"}`} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
