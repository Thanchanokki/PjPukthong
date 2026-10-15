/**
 * ส่วนลดท้ายบิล — แยกเป็นก้อนตามชนิด แทนตัวเลขก้อนเดียว ให้ผู้ใช้เห็นว่าลดจากอะไร
 *
 * ส่วนลดรายสินค้าไม่อยู่ที่นี่ (ผูกกับสินค้าแต่ละชิ้นผ่าน discount / discount_label)
 * ที่นี่คือส่วนลดที่ไม่ได้ผูกกับสินค้าชิ้นใด: ส่วนลดท้ายบิล ส่วนลดสมาชิก คูปอง การใช้คะแนนแลกส่วนลด
 */

export const DISCOUNT_KINDS = ["discount", "member", "coupon", "points"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export interface BillDiscount {
  /** ข้อความตามที่พิมพ์บนใบ เช่น "Customer Discount", "The 1 Redeem", "M-Stamp" */
  label: string | null;
  kind: DiscountKind;
  /** จำนวนเงินที่ลด (บวกเสมอ) */
  amount: string | null;
  /** จำนวนคะแนนที่ใช้แลก — มีเฉพาะ kind = points */
  pointsUsed: string | null;
}

/** คำที่บอกว่าบรรทัดนี้คือการใช้คะแนน/แต้ม แลกส่วนลด */
const POINTS = /point|คะแนน|แต้ม|stamp|แสตมป์|the\s*1|the1|redeem|แลก|big\s*point|all\s*member|m-?stamp/i;
const COUPON = /coupon|คูปอง|voucher|วอเชอร์|code|โค้ด|e-?coupon/i;
const MEMBER = /member|สมาชิก|card\s*disc/i;
const DISCOUNT = /discount|disc\.?|ส่วนลด|ลดราคา|โปร|promo|off\b|%/i;

/** เดาชนิดของส่วนลดจากข้อความ — ใช้เมื่อ AI ไม่ได้ระบุ หรือตอนย้ายบรรทัดส่วนลดออกจากรายการสินค้า */
export function kindOf(label: string | null | undefined, fallback: DiscountKind = "discount"): DiscountKind {
  const s = label ?? "";
  if (POINTS.test(s)) return "points";
  if (COUPON.test(s)) return "coupon";
  if (MEMBER.test(s)) return "member";
  return fallback;
}

/** ชื่อบรรทัดที่บอกว่าเป็นส่วนลด/คูปอง/การใช้คะแนน ไม่ใช่สินค้า */
export function looksLikeDiscount(name: string | null | undefined): boolean {
  const s = name ?? "";
  return POINTS.test(s) || COUPON.test(s) || DISCOUNT.test(s);
}

export const normalizeKind = (v: unknown): DiscountKind =>
  typeof v === "string" && (DISCOUNT_KINDS as readonly string[]).includes(v.trim().toLowerCase())
    ? (v.trim().toLowerCase() as DiscountKind)
    : "discount";
