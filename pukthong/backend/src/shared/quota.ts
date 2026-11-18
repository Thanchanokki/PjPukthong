/**
 * โควตาต่อผู้ใช้ต่อวัน — คุมค่าเรียก Typhoon OCR และ AI ไม่ให้ผู้ใช้คนเดียวใช้โควตาของทั้งระบบหมด
 *
 * - scan = อัปโหลดรูปใหม่ (เรียก OCR ทุกครั้ง) — รูปซ้ำไม่นับ เพราะใช้ผล OCR เดิม
 * - ai   = กดให้ AI อ่าน (รวมการกดอ่านซ้ำ) — นับทุกครั้งที่เรียก เพราะเสียค่า API แม้ผลจะไม่ดี
 *
 * นับไว้ในหน่วยความจำของ process: รีสตาร์ตเซิร์ฟเวอร์แล้วเริ่มนับใหม่ และใช้ได้กับเซิร์ฟเวอร์เครื่องเดียว
 * พอสำหรับระบบที่รันใน container ตัวเดียว — ถ้าขยายเป็นหลายเครื่องต้องย้ายตัวนับไปเก็บใน DB
 */
import { httpError } from "./errors.js";

export type QuotaKind = "scan" | "ai";

const MESSAGES: Record<QuotaKind, string> = {
  scan: "วันนี้สแกนใบเสร็จครบ {n} ใบแล้ว สแกนต่อได้พรุ่งนี้ หรือกรอกรายการเองระหว่างนี้",
  ai: "วันนี้ให้ AI อ่านใบเสร็จครบ {n} ครั้งแล้ว ใช้ต่อได้พรุ่งนี้ หรือกรอกข้อมูลเองต่อจากหน้านี้",
};

const counts = new Map<string, number>();
let countedDay = "";

/** วันที่ตามเวลาไทย — ตัดรอบตอนเที่ยงคืนของผู้ใช้ ไม่ใช่เที่ยงคืน UTC (= 7 โมงเช้าเวลาไทย) */
const thaiDate = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

/** ตัวนับของวันนี้ — ข้ามวันแล้วล้างของเมื่อวานทิ้งทั้งหมด */
function todayCounts(): Map<string, number> {
  const day = thaiDate();
  if (day !== countedDay) {
    counts.clear();
    countedDay = day;
  }
  return counts;
}

/** โยน 429 ถ้าผู้ใช้ใช้ครบโควตาของวันแล้ว (limit <= 0 = ไม่จำกัด) */
export function assertQuota(userId: string, kind: QuotaKind, limit: number): void {
  if (limit <= 0) return;
  if ((todayCounts().get(`${kind}:${userId}`) ?? 0) >= limit) {
    throw httpError(429, MESSAGES[kind].replace("{n}", String(limit)));
  }
}

export function useQuota(userId: string, kind: QuotaKind): void {
  const m = todayCounts();
  const key = `${kind}:${userId}`;
  m.set(key, (m.get(key) ?? 0) + 1);
}
