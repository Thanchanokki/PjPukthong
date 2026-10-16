/**
 * ตรวจใบเสร็จซ้ำ — ใบเดียวกันต้องบันทึกได้ครั้งเดียว (รายจ่ายจะถูกนับซ้ำในรายงานและงบ)
 *
 * ชั้นแรก (รูปเดียวกันเป๊ะ) อยู่ที่ receipts.fileHash แล้ว แต่ถ่ายใบเดิมใหม่อีกรูปได้ hash คนละตัว
 * จึงเทียบจาก "ข้อมูลบนใบ" ด้วย — ซ้ำเมื่อเข้าเงื่อนไขข้อใดข้อหนึ่ง:
 *   1. รูปใบเสร็จเดียวกัน (receiptId) ถูกบันทึกเป็นรายการไปแล้ว
 *   2. เลขที่เอกสารตรงกัน + ยอดรวมเท่ากัน (+ เลขผู้เสียภาษีตรงกันถ้ามีทั้งคู่)
 *   3. วันที่ + เวลา (ถึงนาที) + ยอดรวมเท่ากัน + ชื่อร้านใกล้เคียง
 *
 * ข้อ 3 ต้องมีเวลาด้วยเสมอ — ไม่มีเวลาไม่นับ เพราะซื้อกาแฟราคาเดิมร้านเดิมวันเดียวกันสองแก้วเป็นเรื่องปกติ
 */
import { transactions } from "../../db/client.js";
import type { TransactionDoc } from "../../db/models.js";

export interface DuplicateQuery {
  docNumber: string | null;
  merchantTaxId: string | null;
  merchantName: string | null;
  purchasedAt: string | null;
  purchasedTime: string | null;
  /** ยอดรวมแบบทศนิยม 2 ตำแหน่ง ("428.60") ตรงกับที่เก็บใน DB */
  total: string | null;
}

export interface DuplicateInfo {
  transaction_id: string;
  merchant_name: string | null;
  purchased_at: string;
  total: string;
  /** เหตุผลที่ถือว่าซ้ำ ไว้แสดงให้ผู้ใช้เข้าใจ */
  reason: string;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/[^0-9a-zA-Z฀-๿]/g, "").toLowerCase();

function similarName(a: string | null, b: string | null) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return true; // ไม่มีชื่อร้านฝั่งใดฝั่งหนึ่ง = ตัดสินจากวันเวลาและยอดพอ
  return x.includes(y) || y.includes(x);
}

export async function findDuplicate(
  userId: string,
  q: DuplicateQuery,
  opts: { receiptId?: string | null; excludeId?: string } = {},
): Promise<DuplicateInfo | null> {
  const notSelf = opts.excludeId ? { _id: { $ne: opts.excludeId } } : {};

  if (opts.receiptId) {
    const same = await transactions.findOne({ userId, receiptId: opts.receiptId, ...notSelf });
    if (same) return info(same, "รูปใบเสร็จนี้ถูกบันทึกไปแล้ว");
  }
  if (!q.total) return null;

  // ยอดรวมต้องเท่ากันทุกเงื่อนไข — กรองด้วยยอดก่อน แต่ละคนมีใบยอดเดียวกันไม่กี่ใบ
  const sameTotal = await transactions.find({ userId, total: q.total, ...notSelf }).toArray();

  const doc = norm(q.docNumber);
  if (doc.length >= 3) {
    const hit = sameTotal.find(
      (t) =>
        norm(t.docNumber) === doc &&
        !(norm(q.merchantTaxId) && norm(t.merchantTaxId) && norm(q.merchantTaxId) !== norm(t.merchantTaxId)),
    );
    if (hit) return info(hit, `เลขที่เอกสาร ${q.docNumber} และยอดรวมตรงกับรายการที่บันทึกไว้`);
  }

  const time = q.purchasedTime?.slice(0, 5);
  if (q.purchasedAt && time) {
    const hit = sameTotal.find(
      (t) =>
        t.purchasedAt === q.purchasedAt &&
        t.purchasedTime?.slice(0, 5) === time &&
        similarName(t.merchantName, q.merchantName),
    );
    if (hit) return info(hit, "ร้าน วันที่ เวลา และยอดรวมตรงกับรายการที่บันทึกไว้");
  }
  return null;
}

function info(t: TransactionDoc, reason: string): DuplicateInfo {
  return {
    transaction_id: t._id,
    merchant_name: t.merchantName,
    purchased_at: t.purchasedAt,
    total: t.total,
    reason,
  };
}

/** ข้อความ error ตอนพยายามบันทึกซ้ำ */
export const duplicateMessage = (d: DuplicateInfo) =>
  `ใบเสร็จนี้เคยบันทึกแล้ว (${d.merchant_name ?? "ไม่ระบุร้าน"} วันที่ ${d.purchased_at} ยอด ${d.total} บาท) — ${d.reason}`;
