/**
 * เงินทั้งหมดเดินทางเป็น "string" ตลอดเส้นทาง (frontend -> API -> NUMERIC -> API)
 * และคำนวณผ่าน Decimal เท่านั้น
 *
 * ห้ามใช้ Number() กับค่าเงินเด็ดขาด — JS number เป็น float 64 บิต
 * 0.1 + 0.2 = 0.30000000000000004 ซึ่งทำให้ยอดเงินเพี้ยนแบบเงียบๆ
 * MongoDB เก็บตัวเลขเป็น BSON double (float 64 บิต) จึงต้องเก็บเงินเป็น string เท่านั้น
 */
import { Decimal } from "decimal.js";

export { Decimal };

export const ZERO = new Decimal(0);

/** รับได้ทั้ง '1,234.50', '฿1234', 1234.5, null -> string ตัวเลข | null (ไม่ throw) */
export function toDecimalString(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    return Number.isFinite(v) ? new Decimal(v).toString() : null;
  }
  if (typeof v === "string") {
    // ตัดสัญลักษณ์สกุลเงิน ช่องว่าง และ comma คั่นหลักพันออก เหลือแค่ตัวเลข
    const cleaned = v.replace(/,/g, "").replace(/[^\d.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    try {
      return new Decimal(cleaned).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export function dec(v: string | null | undefined): Decimal | null {
  if (v === null || v === undefined || v === "") return null;
  try {
    return new Decimal(v);
  } catch {
    return null;
  }
}

/** บวกค่าเงินหลายตัวแบบไม่เสียความแม่นยำ */
export function sum(values: (string | null | undefined)[]): Decimal {
  return values.reduce<Decimal>((acc, v) => {
    const d = dec(v);
    return d ? acc.plus(d) : acc;
  }, new Decimal(0));
}

/**
 * จัดรูปยอดรวมให้ตรงกับที่ API เคยคืนมาตั้งแต่ตอนใช้ SQL
 *
 * ยอดเงินถูก quantize เป็นทศนิยม 2 ตำแหน่งเสมอ และผลบวกก็คงสเกลนั้นไว้
 * แต่ผลบวกของ "ชุดว่าง" คือเลข 0 เปล่าๆ ที่ไม่มีทศนิยม — ต้องแยกสองกรณีนี้
 * ไม่งั้นยอด 210.00 จะกลายเป็น 210 ซึ่งไม่ตรงกับของเดิม
 */
export function moneyOut(value: Decimal, hasContributions: boolean): string {
  return hasContributions ? value.toFixed(2) : value.toString();
}

/**
 * ปัดเก็บให้เหลือทศนิยมคงที่ก่อนเขียนลง MongoDB
 *
 * เดิมคอลัมน์เป็น NUMERIC(14,2) ฐานข้อมูลจึงปัดสเกลให้เองทุกครั้ง แต่ Mongo
 * เก็บ string ตามที่ส่งไปเป๊ะๆ — ถ้าไม่ปัดตรงนี้ ยอด '1234.5' กับ '1234.50'
 * จะปนกันในฐานข้อมูล และหน้าเว็บจะแสดงไม่เหมือนเดิม
 */
export function quantize(v: string | null | undefined, dp = 2): string | null {
  const d = dec(v);
  return d === null ? null : d.toFixed(dp);
}
