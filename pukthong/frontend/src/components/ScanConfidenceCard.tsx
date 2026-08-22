import { useState } from "react";

import type { ScanConfidence } from "../api";

/**
 * แสดงคะแนนความน่าเชื่อถือของผลสแกน พร้อมกางให้ดูว่าคิดมาจากอะไร
 *
 * การกางรายละเอียดได้เป็นส่วนสำคัญไม่แพ้ตัวเลข — ตัวเลขลอยๆ ที่อธิบายที่มาไม่ได้
 * จะถูกเชื่อทั้งที่ไม่ควรเชื่อ หรือถูกเมินทั้งที่ควรฟัง ผู้ใช้ต้องเห็นได้ว่า 78%
 * มาจาก "ยอดรวมตรงกับบนใบแต่วันที่ไม่ตรง" ไม่ใช่เลขที่โผล่มาเฉยๆ
 */
export function ScanConfidenceCard({ conf }: { conf: ScanConfidence }) {
  const [open, setOpen] = useState(false);

  if (conf.score === null) return null;

  const tone =
    conf.level === "high"
      ? { bar: "bg-teal-600", text: "text-teal-800", ring: "border-teal-300 bg-teal-50" }
      : conf.level === "medium"
        ? { bar: "bg-amber-500", text: "text-amber-900", ring: "border-amber-300 bg-amber-50" }
        : { bar: "bg-rose-500", text: "text-rose-900", ring: "border-rose-300 bg-rose-50" };

  const headline =
    conf.level === "high"
      ? "ผลสแกนน่าเชื่อถือ ตรวจผ่านทุกข้อที่ตรวจได้"
      : conf.level === "medium"
        ? "ผลสแกนใช้ได้ แต่มีบางข้อไม่ผ่าน — ควรไล่ดูก่อนบันทึก"
        : "ผลสแกนน่าสงสัย — ตรวจตัวเลขให้ละเอียดก่อนบันทึก";

  return (
    <div className={`rounded-lg border p-3 ${tone.ring}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-sm font-medium ${tone.text}`}>ความน่าเชื่อถือของผลสแกน</span>
        <span className={`text-2xl font-semibold tabular-nums ${tone.text}`}>
          {conf.score}%
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full rounded bg-white/70">
        <div className={`h-1.5 rounded ${tone.bar}`} style={{ width: `${conf.score}%` }} />
      </div>

      <p className={`mt-2 text-xs ${tone.text}`}>{headline}</p>

      <button
        onClick={() => setOpen((v) => !v)}
        className={`mt-1 text-xs underline ${tone.text}`}
      >
        {open ? "ซ่อนวิธีคิด" : "คิดมายังไง?"}
      </button>

      {open && (
        <div className="mt-2 space-y-2 border-t border-white/60 pt-2">
          <p className="text-xs text-slate-600">
            ระบบเทียบผลที่ AI ตีความ กับ <b>ข้อความที่ OCR อ่านได้จากรูปโดยตรง</b> และ
            ตรวจการบวกเลขบนใบ แต่ละข้อมีน้ำหนักต่างกัน
            คะแนน = น้ำหนักที่ผ่าน ÷ น้ำหนักที่ตรวจได้ทั้งหมด
          </p>

          <ul className="space-y-1.5">
            {conf.checks.map((c) => (
              <li key={c.key} className="flex gap-2 text-xs">
                <span className="shrink-0">
                  {c.status === "pass" ? "✅" : c.status === "fail" ? "❌" : "➖"}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-slate-700">{c.label}</span>
                  <span className="ml-1 text-slate-400">
                    (น้ำหนัก {c.weight}
                    {c.status === "unknown" && " · ไม่นับ"})
                  </span>
                  <br />
                  <span className="text-slate-500">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-slate-500">
            ➖ คือข้อที่ <b>ตรวจไม่ได้</b> กับใบนี้ (เช่นใบไม่มีรายการย่อย) —
            ถูกตัดออกจากการคิดคะแนนแล้วเกลี่ยน้ำหนักให้ข้ออื่น ไม่ได้นับเป็นศูนย์
          </p>
          <p className="text-xs text-slate-400">
            หมายเหตุ: นี่คือความ <b>น่าเชื่อถือ</b> ไม่ใช่ความแม่นยำ — ระบบไม่มีเฉลยว่าบนใบ
            เขียนอะไรจริงๆ จึงบอกได้แค่ว่าผลที่ได้สอดคล้องกับหลักฐานบนรูปแค่ไหน
          </p>
        </div>
      )}
    </div>
  );
}
