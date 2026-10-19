/**
 * การ์ดผลการอ่านใบเสร็จ บนสุดของหน้า "ตรวจสอบข้อมูล"
 *
 * ให้เห็นในแวบเดียวว่าผลสแกนเชื่อได้แค่ไหน: วงแหวนเปอร์เซ็นต์ + แถบช่องละหนึ่งข้อที่ตรวจได้
 * + ป้ายนับ ผ่าน/ไม่ผ่าน ข้อที่ไม่ผ่านขึ้นเป็นกล่องเตือนพร้อมปุ่มพาไปช่องที่ต้องแก้
 * ส่วนวิธีคิดคะแนนทั้งหมดอยู่ในแผ่นล่างจอ (ConfidenceSheet) — ตัวเลขลอยๆ ที่อธิบายที่มาไม่ได้
 * จะถูกเชื่อทั้งที่ไม่ควรเชื่อ หรือถูกเมินทั้งที่ควรฟัง
 */
import { useEffect } from "react";

import type { ScanCheck, ScanConfidence } from "../api";
import { ChevronRightIcon, XIcon } from "./icons";

/** id ของกล่องในหน้าตรวจสอบ — ปุ่ม "ไปตรวจ" เลื่อนไปที่นี่ (ดู Section ใน ReviewSections) */
export type ReviewTarget = "sec-store" | "sec-items" | "sec-payment" | "sec-summary" | "image";

/** ข้อความเตือนของเช็คที่ไม่ผ่าน — เขียนเป็นสิ่งที่ผู้ใช้ทำได้ ไม่ใช่ชื่อเช็คเฉยๆ */
const FAIL_HINT: Record<string, { title: string; hint: string; target: ReviewTarget }> = {
  total_grounded: {
    title: "ยอดรวมไม่ตรงกับตัวเลขบนใบ",
    hint: "ลองเทียบยอดรวมกับรูปใบเสร็จอีกครั้ง",
    target: "sec-summary",
  },
  items_grounded: {
    title: "ราคาสินค้าบางรายการไม่พบบนใบ",
    hint: "ลองเทียบราคาสินค้าแต่ละรายการกับรูปใบเสร็จ",
    target: "sec-items",
  },
  arithmetic: {
    title: "ตัวเลขบนใบบวกกันไม่ลงตัว",
    hint: "ลองตรวจยอดรวมและราคาสินค้าอีกครั้ง",
    target: "sec-items",
  },
  date_grounded: {
    title: "วันที่ไม่ตรงกับที่พิมพ์บนใบ",
    hint: "ลองตรวจวัน เดือน และปี (พ.ศ./ค.ศ.) อีกครั้ง",
    target: "sec-payment",
  },
  ocr_quality: {
    title: "ตัวอักษรบนรูปไม่คมชัด",
    hint: "ถ้าตัวเลขดูแปลก ลองดูรูปเทียบ หรือถ่ายใหม่ในที่สว่าง",
    target: "image",
  },
};

const failHint = (c: ScanCheck) => FAIL_HINT[c.key] ?? { title: c.label, hint: c.detail, target: "image" as const };

const TONE = {
  high: { stroke: "#16a34a", text: "text-green-600" },
  medium: { stroke: "#c2410c", text: "text-orange-700" },
  low: { stroke: "#dc2626", text: "text-red-600" },
  unknown: { stroke: "#94a3b8", text: "text-slate-500" },
} as const;


export function ScanResultCard({
  thumbSrc,
  onOpenImage,
  reading,
  error,
  onRead,
  read,
  title,
  conf,
  onHow,
  onGoTo,
}: {
  thumbSrc: string;
  onOpenImage: () => void;
  reading: boolean;
  error: Error | null;
  onRead: () => void;
  /** อ่านเสร็จแล้ว (มีผล) */
  read: boolean;
  /** หัวข้อที่หน้าเลือกให้ — ใบไม่รองรับ / ใบซ้ำ มีหัวข้อของตัวเอง ไม่ใช่ "สำเร็จ" */
  title?: string;
  conf?: ScanConfidence;
  onHow: () => void;
  onGoTo: (target: ReviewTarget) => void;
}) {
  const scored = read && !reading && !error && conf?.score != null;
  const level = conf?.level ?? "unknown";
  const fails = conf?.checks.filter((c) => c.status === "fail") ?? [];
  const passes = conf?.checks.filter((c) => c.status === "pass").length ?? 0;

  let heading: string;
  let sub: string;
  if (reading) [heading, sub] = ["กำลังอ่านใบเสร็จ…", "ใช้เวลาสักครู่"];
  else if (error) [heading, sub] = ["อ่านใบเสร็จไม่สำเร็จ", error.message];
  else if (!read) [heading, sub] = ["ยังไม่ได้อ่านใบเสร็จนี้", "ให้ระบบอ่าน หรือกรอกเองด้านล่าง"];
  else if (!scored) [heading, sub] = [title ?? "อ่านแล้ว", "ตรวจข้อมูลด้านล่างก่อนบันทึก"];
  else {
    heading =
      title ?? (level === "high" ? "อ่านใบเสร็จสำเร็จ" : level === "medium" ? "อ่านแล้ว · ควรตรวจอีกนิด" : "อ่านแล้ว · ตรวจให้ละเอียด");
    sub =
      fails.length === 0
        ? `ผ่านครบ ${passes} จาก ${passes} ข้อที่ตรวจได้`
        : `มี ${fails.length} ข้อที่ไม่ผ่าน ลองตรวจตัวเลขก่อนบันทึก`;
  }

  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onOpenImage}
          aria-label="ดูรูปใบเสร็จ"
          className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200"
        >
          <img src={thumbSrc} alt="" className="h-full w-full object-cover object-top" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">{heading}</p>
          <p className={`mt-0.5 text-sm text-ink/60 ${error ? "truncate" : ""}`}>{sub}</p>
        </div>

        {reading ? (
          <span className="h-10 w-10 shrink-0 animate-spin rounded-full border-4 border-slate-200 border-t-pine" aria-hidden="true" />
        ) : scored ? (
          <ScoreRing score={conf!.score!} level={level} />
        ) : !read || error ? (
          <button type="button" onClick={onRead} className="btn shrink-0 bg-pine text-white hover:bg-pine-dark">
            {error ? "ลองอีกครั้ง" : "ให้ระบบอ่าน"}
          </button>
        ) : null}
      </div>

      {scored && (
        <>
          {/* แถบแบ่งช่อง — ช่องละหนึ่งข้อที่ตรวจได้ กว้างเท่ากัน (ข้อที่ตรวจไม่ได้ไม่แสดง) */}
          <div className="mt-4 flex gap-1" aria-hidden="true">
            {conf!.checks
              .filter((c) => c.status !== "unknown")
              .map((c) => (
                <span key={c.key} className={`h-2 flex-1 rounded-full ${c.status === "pass" ? "bg-green-600" : "bg-red-600"}`} />
              ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-green-50 px-3 py-1 font-medium text-green-700">✓ ผ่าน {passes}</span>
            {fails.length > 0 && (
              <span className="rounded-full bg-red-50 px-3 py-1 font-medium text-red-600">✕ ไม่ผ่าน {fails.length}</span>
            )}
            <button type="button" onClick={onHow} className="ml-auto flex items-center gap-0.5 font-bold text-pine">
              วิธีคิด <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {fails.map((c) => {
            const f = failHint(c);
            return (
              <div key={c.key} className="mt-3 flex items-start gap-3 rounded-2xl bg-amber-50 p-3">
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-orange-700 text-xs font-bold text-orange-700"
                  aria-hidden="true"
                >
                  !
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-orange-800">{f.title}</p>
                  <p className="text-sm text-orange-800/80">{f.hint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onGoTo(f.target)}
                  className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-orange-800 shadow-sm"
                >
                  {f.target === "image" ? "ดูรูป" : "ไปตรวจ"}
                </button>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

function ScoreRing({ score, level }: { score: number; level: ScanConfidence["level"] }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const tone = TONE[level];
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`ความน่าเชื่อถือ ${score}%`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={tone.stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span className={`absolute inset-0 grid place-items-center text-sm font-bold tabular-nums ${tone.text}`}>{score}%</span>
    </div>
  );
}

/** แผ่นล่างจอ "วิธีคิด" — รายละเอียดทุกเช็คกับสูตรคะแนนของใบนี้ */
export function ConfidenceSheet({ conf, onClose }: { conf: ScanConfidence; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const usable = conf.checks.filter((c) => c.status !== "unknown");
  const total = usable.reduce((n, c) => n + c.weight, 0);
  const earned = usable.filter((c) => c.status === "pass").reduce((n, c) => n + c.weight, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose} role="dialog" aria-label="วิธีคิดคะแนน">
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">คะแนนนี้คิดมายังไง</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-ink">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-ink/70">
          ระบบเทียบผลที่ AI ตีความ กับ <b>ข้อความที่ OCR อ่านได้จากรูปโดยตรง</b> และตรวจการบวกเลขบนใบ
          แต่ละข้อมีน้ำหนักต่างกัน
        </p>

        <ul className="mt-4 space-y-3">
          {conf.checks.map((c) => (
            <li key={c.key} className="flex gap-3 text-sm">
              <span className="shrink-0">{c.status === "pass" ? "✅" : c.status === "fail" ? "❌" : "➖"}</span>
              <span className="min-w-0">
                <span className="font-medium text-ink">{c.label}</span>
                <span className="ml-1 text-ink/45">
                  (น้ำหนัก {c.weight}
                  {c.status === "unknown" && " · ไม่นับ"})
                </span>
                <br />
                <span className="text-ink/60">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm tabular-nums text-ink">
          น้ำหนักที่ผ่าน {earned} ÷ น้ำหนักที่ตรวจได้ {total} = <b>{conf.score}%</b>
        </p>

        <p className="mt-3 text-xs text-ink/55">
          ➖ คือข้อที่ <b>ตรวจไม่ได้</b> กับใบนี้ (เช่นใบไม่มีรายการย่อย) — ถูกตัดออกจากการคิดคะแนน
          ไม่ได้นับเป็นศูนย์
        </p>
        <p className="mt-1 text-xs text-ink/45">
          หมายเหตุ: นี่คือความ <b>น่าเชื่อถือ</b> ไม่ใช่ความแม่นยำ — ระบบไม่มีเฉลยว่าบนใบเขียนอะไรจริงๆ
          จึงบอกได้แค่ว่าผลที่ได้สอดคล้องกับหลักฐานบนรูปแค่ไหน
        </p>
      </div>
    </div>
  );
}
