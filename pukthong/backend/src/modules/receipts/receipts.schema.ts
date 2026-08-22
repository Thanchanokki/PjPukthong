/**
 * ชั้น draft (ผลจาก AI) ทุกฟิลด์เป็น optional และ "ห้าม throw เด็ดขาด"
 * เพราะ SYSTEM_PROMPT สั่ง AI ว่าอ่านไม่ออกให้ใส่ null — ถ้า schema บังคับค่า
 * ข้อมูลที่อ่านได้ทั้งใบจะถูกทิ้งเพราะฟิลด์เดียวเป็น null
 *
 * การบังคับค่าไปอยู่ที่ transactions.schema (ตอนผู้ใช้กดบันทึกจริง) ซึ่ง throw ได้
 */
import { z } from "zod";

import { normalize as normalizeCategory } from "../../shared/categories.js";
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
 * หมวดที่ AI เดามา — บีบให้เป็นหนึ่งในชุดที่ระบบรู้จัก ไม่งั้นคืน null
 *
 * ทำตรงนี้แทนที่จะเชื่อ prompt อย่างเดียว เพราะโมเดลตอบนอกรายการได้เสมอ
 * และหมวดที่หลุดรายการจะทำให้ dashboard แตกเป็นหมวดขยะ
 */
const categoryField = z.preprocess(normalizeCategory, z.string().nullable());

const lineItemSchema = z.object({
  qty: decField,
  name: strField,
  unit_price: decField,
  amount: decField,
  flag: strField,
  category_guess: categoryField,
});

export type LineItem = z.infer<typeof lineItemSchema>;

const draftSchema = z.object({
  document_type: strField,
  merchant_name: strField,
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
  discount: decField,
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
  if (result.success) return result.data;
  // ไม่ควรเกิดขึ้นเพราะทุกฟิลด์ผ่าน preprocess แล้ว แต่กันไว้ไม่ให้ทั้ง request พัง
  return emptyDraft(["AI ตอบกลับมาในรูปแบบที่ไม่คาดคิด ตรวจสอบข้อมูลให้ละเอียดก่อนบันทึก"]);
}
