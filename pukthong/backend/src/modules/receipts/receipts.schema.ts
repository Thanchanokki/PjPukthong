/**
 * ชั้น draft (ผลจาก AI) ทุกฟิลด์เป็น optional และ "ห้าม throw เด็ดขาด"
 * เพราะ SYSTEM_PROMPT สั่ง AI ว่าอ่านไม่ออกให้ใส่ null — ถ้า schema บังคับค่า
 * ข้อมูลที่อ่านได้ทั้งใบจะถูกทิ้งเพราะฟิลด์เดียวเป็น null
 *
 * การบังคับค่าไปอยู่ที่ transactions.schema (ตอนผู้ใช้กดบันทึกจริง) ซึ่ง throw ได้
 */
import { z } from "zod";

import { matchPolicyType } from "../../shared/insurance.js";
import { matchMerchantType } from "../../shared/merchant-types.js";
import { kindOf, looksLikeDiscount, normalizeKind } from "../../shared/discounts.js";
import { Decimal, dec, sum } from "../../shared/money.js";

import {
  currencyField,
  decField,
  intField,
  strField,
  toDateString,
  toStringList,
  toTimeString,
} from "../../shared/zod.js";


/**
 * ราคาของรายการที่มีส่วนลด: gross_amount − discount = amount (ราคาสุทธิ)
 *
 * AI อาจส่งมาไม่ครบหรือใส่ส่วนลดเป็นค่าติดลบ — เติมช่องที่ขาดจากอีกสองช่อง และบังคับ
 * ส่วนลดเป็นค่าบวกเสมอ amount (สุทธิ) คือค่าที่ใช้รวมยอดรายหมวดและงบ
 */
export function normalizeItemPrice<
  T extends { gross_amount: string | null; discount: string | null; amount: string | null },
>(item: T): T {
  let disc = dec(item.discount)?.abs() ?? null;
  if (disc !== null && disc.isZero()) disc = null;
  const gross = dec(item.gross_amount);
  let amount = dec(item.amount);
  if (gross !== null) amount = gross.minus(disc ?? 0);
  const outGross = gross ?? (amount !== null && disc !== null ? amount.plus(disc) : null);
  const f = (v: Decimal | null) => (v === null ? null : v.toFixed(2));
  return { ...item, gross_amount: f(outGross), discount: f(disc), amount: f(amount) ?? item.amount };
}

const lineItemSchema = z.object({
  qty: decField,
  name: strField,
  unit_price: decField,
  /** ราคาก่อนส่วนลดของบรรทัดนี้ */
  gross_amount: decField,
  /** ส่วนลดที่ผูกกับสินค้านี้ (บวก) — null = ไม่มีส่วนลด */
  discount: decField,
  /** ข้อความของบรรทัดส่วนลดตามที่พิมพ์ เช่น "HairJew 20.57%" — แสดงเป็นข้อความ ไม่ใช่สินค้า */
  discount_label: strField,
  /** ราคาสุทธิหลังหักส่วนลด */
  amount: decField,
  flag: strField,
  /**
   * ชื่อหมวดที่ AI เดามา — ตรงนี้ยังเป็นข้อความดิบ receipts.service จะแปลงเป็น
   * id ของหมวดที่ผู้ใช้คนนั้นเห็น (ทำใน schema ไม่ได้เพราะหมวดต่างกันไปแต่ละคน)
   * และกลายเป็น null ถ้าโมเดลตอบนอกรายการ — กันหมวดขยะหลุดเข้า dashboard
   */
  category_guess: strField,
}).transform(normalizeItemPrice);

export type LineItem = z.infer<typeof lineItemSchema>;

/** ข้อมูลกรมธรรม์จากใบเสร็จค่าเบี้ยประกัน — ใช้สรุปสิทธิลดหย่อนภาษีรายปี */
export const insuranceSchema = z.object({
  insurer: strField,
  policy_number: strField,
  /** ประเภทที่ AI ตอบ -> id ใน shared/insurance.ts (ตอบนอกรายการ = null ให้ผู้ใช้เลือกเอง) */
  policy_type: z.preprocess(matchPolicyType, z.string().nullable()),
  insured_name: strField,
  coverage_start: z.preprocess(toDateString, z.string().nullable()),
  coverage_end: z.preprocess(toDateString, z.string().nullable()),
  premium: decField,
});

export type InsuranceDraft = z.infer<typeof insuranceSchema>;

const draftSchema = z.object({
  document_type: strField,
  handwritten: z.preprocess((v) => v === true, z.boolean()),
  merchant_name: strField,
  /** ประเภทร้านที่ AI ตอบ -> id ที่รู้จัก (ตอบนอกรายการ = null ให้ผู้ใช้เลือกเอง) */
  merchant_type: z.preprocess(matchMerchantType, z.string().nullable()),
  branch: strField,
  merchant_tax_id: strField,
  doc_number: strField,
  issued_at: z.preprocess(toDateString, z.string().nullable()),
  issued_time: z.preprocess(toTimeString, z.string().nullable()),
  currency: currencyField,

  line_items: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(z.preprocess((v) => (v && typeof v === "object" ? v : {}), lineItemSchema)),
  ),
  line_items_complete: z.preprocess((v) => (typeof v === "boolean" ? v : true), z.boolean()),
  item_count_printed: intField,

  subtotal: decField,
  /** ผลรวมส่วนลดท้ายบิล — normalizeDiscounts คำนวณจาก bill_discounts ให้ตรงกันเสมอ */
  discount: decField,
  /** ส่วนลดท้ายบิลแยกเป็นก้อน (ส่วนลด / สมาชิก / คูปอง / ใช้คะแนน) */
  bill_discounts: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.preprocess(
        (v) => (v && typeof v === "object" ? v : {}),
        z.object({
          label: strField,
          kind: z.preprocess(normalizeKind, z.enum(["discount", "member", "coupon", "points"])),
          amount: decField,
          points_used: decField,
        }),
      ),
    ),
  ),
  service_charge: decField,
  vat_rate: decField,
  vat_amount: decField,
  vat_included: z.preprocess((v) => (typeof v === "boolean" ? v : true), z.boolean()),
  total: decField,

  payment_method: strField,
  payment_channel: strField,

  confidence: z.preprocess((v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, number> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(val);
      if (Number.isFinite(n)) out[String(k)] = n;
    }
    return out;
  }, z.record(z.number())),

  warnings: z.preprocess(toStringList, z.array(z.string())),
  unreadable_regions: z.preprocess(toStringList, z.array(z.string())),
  raw_text: strField,

  // ข้อมูลส่วนบุคคล — ส่งกลับให้ผู้ใช้เห็นได้ แต่ไม่ถูกเขียนลง transactions
  // (เก็บไว้เฉพาะใน receipts.rawPayload ตามที่ระบุไว้ใน README)
  customer: z.preprocess(
    (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}),
    z.object({ name: strField, member_no: strField }),
  ),
  /** ข้อมูลกรมธรรม์ — มีเฉพาะใบเสร็จค่าเบี้ยประกัน (ทุกช่องว่าง = null ทั้งก้อน) */
  insurance: z.preprocess(
    (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null),
    insuranceSchema.nullable(),
  ).transform((v) => (v && Object.values(v).some((x) => x !== null) ? v : null)),
  extra: z.preprocess(
    (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}),
    z.record(z.unknown()),
  ),
});

export type ReceiptDraft = z.infer<typeof draftSchema>;

/** ค่าเริ่มต้นของ draft ว่าง — ใช้ตอน AI ตอบมาแต่ parse ไม่ได้ */
export function emptyDraft(warnings: string[] = []): ReceiptDraft {
  return draftSchema.parse({ warnings });
}

/** แปลง payload ดิบจาก AI เป็น draft โดยไม่มีทาง throw */
export function parseDraft(payload: unknown): ReceiptDraft {
  const result = draftSchema.safeParse(payload ?? {});
  if (result.success) return normalizeDiscounts(result.data);
  // ไม่ควรเกิดขึ้นเพราะทุกฟิลด์ผ่าน preprocess แล้ว แต่กันไว้ไม่ให้ทั้ง request พัง
  return emptyDraft(["AI ตอบกลับมาในรูปแบบที่ไม่คาดคิด ตรวจสอบข้อมูลให้ละเอียดก่อนบันทึก"]);
}

/**
 * จัดส่วนลดให้อยู่ถูกที่ — ส่วนลดต้องไม่ปรากฏเป็น "รายการสินค้า"
 *
 * 1. บรรทัดในรายการสินค้าที่จริงๆ เป็นส่วนลด/คูปอง/การใช้คะแนน (ยอดติดลบ หรือยอด 0 ที่ชื่อบอกว่า
 *    เป็นแต้ม/คูปอง เช่น "M-Stamp(บาท) 0.00") ย้ายไปเป็นส่วนลดท้ายบิล — AI ยังหลุดได้แม้ prompt สั่งแล้ว
 * 2. ส่วนลดเป็นบวกเสมอ และ kind เดาจากข้อความถ้า AI ไม่ได้ระบุ
 * 3. discount (ตัวเลขก้อนเดียวของใบ) = ผลรวมของ bill_discounts — ใบที่ AI ให้แค่ตัวเลขก้อนเดียว
 *    สร้างเป็นส่วนลดหนึ่งก้อนให้ ระบบส่วนอื่นที่ใช้ discount จึงทำงานเหมือนเดิม
 */
export function normalizeDiscounts(d: ReceiptDraft): ReceiptDraft {
  const bills = d.bill_discounts.map((b) => ({
    ...b,
    amount: dec(b.amount)?.abs().toFixed(2) ?? null,
    kind: b.kind === "discount" ? kindOf(b.label) : b.kind,
  }));

  const items = [];
  for (const it of d.line_items) {
    const amount = dec(it.amount);
    const isPointsOrCoupon = /point|คะแนน|แต้ม|stamp|แสตมป์|redeem|coupon|คูปอง|voucher/i.test(it.name ?? "");
    const isDiscountLine =
      amount !== null && (amount.isNegative() || (amount.isZero() && isPointsOrCoupon)) && looksLikeDiscount(it.name);
    if (!isDiscountLine) {
      items.push(it);
      continue;
    }
    // ยอด 0 ของแต้ม = ยอดส่วนลดอยู่ในตัวเลขส่วนลดท้ายบิลแล้ว ไม่ต้องสร้างก้อนใหม่ที่ไม่มีเงิน
    if (amount.isZero() && bills.some((b) => b.kind === "points")) continue;
    bills.push({
      label: it.name,
      kind: kindOf(it.name),
      amount: amount.isZero() ? null : amount.abs().toFixed(2),
      points_used: null,
    });
  }

  // แต้มที่ย้ายมาด้วยยอด 0 แต่ AI ใส่ตัวเลขไว้ที่ discount ก้อนเดียว -> ใช้ตัวเลขนั้นเป็นยอดของแต้ม
  const flat = dec(d.discount)?.abs() ?? null;
  const known = sum(bills.map((b) => b.amount));
  if (flat !== null && !flat.isZero() && flat.minus(known).abs().gte(0.01)) {
    const blank = bills.find((b) => b.amount === null);
    if (blank && known.isZero()) blank.amount = flat.toFixed(2);
    else if (bills.length === 0) bills.push({ label: null, kind: "discount", amount: flat.toFixed(2), points_used: null });
  }

  const kept = bills.filter((b) => b.amount !== null || b.points_used !== null);
  const total = sum(kept.map((b) => b.amount));
  return {
    ...d,
    line_items: items,
    bill_discounts: kept,
    discount: kept.length ? total.toFixed(2) : null,
  };
}
