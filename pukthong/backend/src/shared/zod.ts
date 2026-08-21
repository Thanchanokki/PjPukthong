/**
 * ตัวช่วย zod ที่ทุก module ใช้ร่วมกัน — การแปลงค่าดิบ (จาก AI หรือจากฟอร์ม)
 * ให้เป็นชนิดที่ระบบใช้ได้ รวมไว้ที่เดียวเพื่อให้กฎการแปลงเหมือนกันหมดทั้งระบบ
 *
 * ทุกตัวในไฟล์นี้ "ไม่ throw" — คืน null เมื่อแปลงไม่ได้ แล้วให้ schema ปลายทาง
 * เป็นคนตัดสินว่าฟิลด์นั้นบังคับหรือไม่
 */
import { z } from "zod";

import { toDecimalString } from "./money.js";

export const asString = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
};

/** ปี พ.ศ. (> 2400) -> ค.ศ. เผื่อกรณี AI ไม่แปลงให้ แม้ prompt จะสั่งไว้ */
function fixBuddhistYear(y: number, m: number, d: number): string | null {
  const year = y > 2400 ? y - 543 : y;
  const dt = new Date(Date.UTC(year, m - 1, d));
  // ปฏิเสธวันที่ไม่มีจริง เช่น 31/02 (Date จะเลื่อนไปเดือนถัดไปเงียบๆ)
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(year, 4)}-${p(m)}-${p(d)}`;
}

/** รับ 'YYYY-MM-DD' เป็นหลัก แต่เผื่อรูปแบบไทยที่ AI ชอบส่งมา -> 'YYYY-MM-DD' | null */
export function toDateString(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return fixBuddhistYear(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v !== "string") return null;
  const s = v.trim();

  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s); // YYYY-MM-DD, YYYY/MM/DD
  if (m) return fixBuddhistYear(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s); // DD/MM/YYYY, DD-MM-YYYY
  if (m) return fixBuddhistYear(+m[3], +m[2], +m[1]);

  return null;
}

/** 'HH:MM' หรือ 'HH:MM:SS' -> 'HH:MM:SS' | null (รูปแบบเดียวกับที่เก็บลงฐานข้อมูล) */
export function toTimeString(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());
  if (!m) return null;
  const [h, min, sec] = [+m[1], +m[2], m[3] ? +m[3] : 0];
  if (h > 23 || min > 59 || sec > 59) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(min)}:${p(sec)}`;
}

export function toStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x !== null && x !== undefined).map((x) => String(x));
}

/** ตัวเลขจำนวนเต็ม (line_no, item_count_printed) — ค่าที่แปลงไม่ได้กลายเป็น null */
export const toIntOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n)
    ? null
    : Math.trunc(n);
};

// ---------------------------------------------------------------- field ที่ใช้ซ้ำ

/** ค่าเงิน — เก็บเป็น string เสมอตามกติกาใน shared/money.ts */
export const decField = z.preprocess(toDecimalString, z.string().nullable());

export const strField = z.preprocess(asString, z.string().nullable());

export const intField = z.preprocess(toIntOrNull, z.number().nullable());

/** ว่างไว้ = THB และตัดให้เหลือ 3 ตัวอักษรตามมาตรฐาน ISO 4217 */
export const currencyField = z.preprocess(
  (v) => (v ? String(v).toUpperCase().slice(0, 3) : "THB"),
  z.string(),
);

/** normalize อีเมลตรงนี้ที่เดียว เพื่อให้ค่าที่เขียนลง DB ตรงกับที่ใช้ค้นตอนล็อกอินเสมอ */
export const emailField = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.string({ required_error: "ต้องระบุอีเมล" }).email("รูปแบบอีเมลไม่ถูกต้อง"),
);

/** รวม error ของ zod เป็นข้อความไทยบรรทัดเดียว ให้ frontend อ่าน body.detail ได้เหมือนเดิม */
export function zodMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join(", ");
}
