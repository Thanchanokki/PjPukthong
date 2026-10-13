/**
 * ตรรกะของรายการรับ-จ่าย: บันทึก แก้ไข ลบ และสรุปยอดรายเดือน
 *
 * การคำนวณเงินทุกจุดใช้ Decimal เท่านั้น (ดูเหตุผลใน shared/money.ts)
 */
import { randomUUID } from "node:crypto";

import { receipts, transactions } from "../../db/client.js";
import type { TransactionDoc, TransactionItemDoc } from "../../db/models.js";
import { httpError } from "../../shared/errors.js";
import { matchMerchantType } from "../../shared/merchant-types.js";
import { Decimal, dec, moneyOut, quantize, sum } from "../../shared/money.js";
import { type CategoryBook, loadBook } from "../categories/categories.service.js";
import type { TransactionCreate } from "./transactions.schema.js";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** '2026-08' -> ('2026-08-01', '2026-09-01')  ครึ่งเปิดขวา */
function monthRange(month: string): [string, string] {
  if (!MONTH_RE.test(month)) {
    throw httpError(422, "รูปแบบเดือนต้องเป็น YYYY-MM เช่น 2026-08");
  }
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const start = `${p(y, 4)}-${p(m)}-01`;
  const end = m === 12 ? `${p(y + 1, 4)}-01-01` : `${p(y, 4)}-${p(m + 1)}-01`;
  return [start, end];
}

/**
 * แปลงหมวดที่ client ส่งมาเป็น categoryId ที่ผู้ใช้คนนี้ใช้ได้จริง
 *
 * - category_id ต้องเป็นหมวดที่ผู้ใช้มองเห็น (หมวดที่ซ่อนแล้วยังรับ เพราะการแก้รายการเก่า
 *   ที่อยู่ในหมวดนั้นต้องบันทึกได้โดยไม่ถูกบังคับให้ย้ายหมวด)
 * - category (ชื่อ) ของ client รุ่นเก่า — จับคู่ไม่ได้ก็ถือว่ายังไม่ได้จัดหมวด
 */
function resolveCategory(
  book: CategoryBook,
  v: { category_id: string | null; category: string | null },
): string | null {
  if (v.category_id) {
    if (!book.get(v.category_id)) throw httpError(422, "ไม่พบหมวดที่เลือก");
    return v.category_id;
  }
  return book.match(v.category);
}

/** ฟิลด์ที่ผู้ใช้แก้ได้ — ใช้ร่วมกันทั้งตอน insert และ update */
function toFields(payload: TransactionCreate, book: CategoryBook) {
  return {
    // ระบบรายรับถูกตัดออก — ทุกอย่างที่บันทึกผ่าน API นี้คือรายจ่าย
    direction: "expense",
    merchantName: payload.merchant_name,
    // ค่าที่ไม่รู้จักกลายเป็น null (= นับเป็น "ร้านอื่นๆ" ตอนสรุป) ไม่ใช่ error
    merchantType: matchMerchantType(payload.merchant_type),
    branch: payload.branch,
    merchantTaxId: payload.merchant_tax_id,
    docNumber: payload.doc_number,
    purchasedAt: payload.purchased_at,
    purchasedTime: payload.purchased_time,
    currency: payload.currency,
    subtotal: quantize(payload.subtotal),
    discount: quantize(payload.discount),
    serviceCharge: quantize(payload.service_charge),
    vatRate: quantize(payload.vat_rate),
    vatAmount: quantize(payload.vat_amount),
    total: quantize(payload.total) as string,
    categoryId: resolveCategory(book, payload),
    paymentMethod: payload.payment_method,
    paymentChannel: payload.payment_channel,
    note: payload.note,
  };
}

const itemDocs = (payload: TransactionCreate, book: CategoryBook): TransactionItemDoc[] =>
  payload.items.map((item, i) => ({
    lineNo: item.line_no ?? i + 1,
    name: item.name,
    // จำนวนใบเสร็จมีทศนิยมได้ถึง 3 ตำแหน่ง (เช่น ชั่งกิโล 0.375)
    qty: quantize(item.qty, 3),
    unitPrice: quantize(item.unit_price),
    amount: quantize(item.amount),
    flag: item.flag,
    categoryId: resolveCategory(book, item),
  }));

/** บันทึกรายการที่ผู้ใช้ตรวจและยืนยันแล้ว — ไม่มีทางถูกเรียกอัตโนมัติ */
export async function create(
  userId: string,
  payload: TransactionCreate,
): Promise<TransactionDoc> {
  /**
   * ไม่ได้ห่อสองคำสั่งนี้ด้วย transaction เพราะ multi-document transaction
   * ต้องใช้ replica set ซึ่ง mongod เครื่องเดียวไม่มี — จึงอัปเดตสถานะใบเสร็จ
   * ก่อน แล้วค่อยเขียนรายการ (ตัวรายการเองเขียนครั้งเดียวจบจึง atomic อยู่แล้ว)
   */
  // เช็คหมวดก่อนแตะใบเสร็จ — หมวดผิดต้องไม่ทำให้ใบเสร็จถูกตั้งเป็น confirmed ไปแล้ว
  const book = await loadBook(userId);
  const fields = toFields(payload, book);
  const items = itemDocs(payload, book);

  let uploadedAt = new Date();
  if (payload.receipt_id) {
    const receipt = await receipts.findOneAndUpdate(
      { _id: payload.receipt_id, userId },
      { $set: { status: "confirmed" } },
      { returnDocument: "after" },
    );
    if (!receipt) throw httpError(404, "ไม่พบใบเสร็จที่อ้างถึง");
    /**
     * ใช้เวลาที่ "อัปโหลดรูป" ไม่ใช่เวลาที่กดบันทึก — ผู้ใช้อาจสแกนทิ้งไว้แล้ว
     * กลับมาตรวจทีหลังเป็นวันๆ ซึ่งเวลาที่ระบบเห็นใบนี้ครั้งแรกคือตอนอัปโหลด
     */
    uploadedAt = receipt.createdAt ?? uploadedAt;
  }

  const now = new Date();
  const doc: TransactionDoc = {
    _id: randomUUID(),
    userId,
    receiptId: payload.receipt_id ?? null,
    verifiedByUser: true,
    uploadedAt,
    ...fields,
    items,
    createdAt: now,
    updatedAt: now,
  };
  await transactions.insertOne(doc);

  return doc;
}

/** รายการของคนอื่นตอบ 404 เหมือนไม่มีอยู่จริง */
export async function findOwned(
  userId: string,
  id: string,
): Promise<TransactionDoc> {
  const row = await transactions.findOne({ _id: id, userId });
  if (!row) throw httpError(404, "ไม่พบรายการนี้");
  return row;
}

export async function update(
  userId: string,
  id: string,
  payload: TransactionCreate,
): Promise<TransactionDoc> {
  const book = await loadBook(userId);
  // แทนที่รายการย่อยทั้งชุด (เทียบเท่า cascade delete-orphan ของเดิม)
  const row = await transactions.findOneAndUpdate(
    { _id: id, userId },
    {
      // ไม่แตะ uploadedAt — นั่นคือเวลาที่ระบบ "รับรู้" รายการนี้ ไม่ใช่เวลาที่แก้ล่าสุด
      $set: {
        ...toFields(payload, book),
        items: itemDocs(payload, book),
        verifiedByUser: true,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!row) throw httpError(404, "ไม่พบรายการนี้");

  return row;
}

export async function remove(userId: string, id: string): Promise<void> {
  const { deletedCount } = await transactions.deleteOne({ _id: id, userId });
  if (deletedCount === 0) throw httpError(404, "ไม่พบรายการนี้");
}

/**
 * รายการทั้งเดือนพร้อมยอดสรุป — ทั้งหน้ารายการและ dashboard เรียกตัวนี้ตัวเดียว
 *
 * ให้ทั้งสองหน้าใช้ endpoint เดียวกันเพื่อให้ TanStack Query แชร์ cache ก้อนเดียว
 * (สลับแท็บไปมาไม่ยิงซ้ำ และตัวเลขสองหน้าไม่มีทางไม่ตรงกัน)
 */
export type DateAxis = "purchased" | "uploaded";

export async function monthlySummary(
  userId: string,
  month: string,
  /**
   * แกนเวลาที่ใช้ "กรอง" เดือน ไม่ใช่แค่เรียงลำดับ
   *
   * purchased = เดือนนั้นใช้เงินไปเท่าไหร่ (มุมมองการเงิน — dashboard ใช้ตัวนี้เสมอ)
   * uploaded  = เดือนนั้นสแกนอะไรเข้าระบบบ้าง (มุมมอง feed/audit)
   *
   * สองอันตอบคนละคำถามและได้คนละชุดข้อมูล — ใบที่ซื้อปีก่อนแต่เพิ่งสแกนเดือนนี้
   * จะอยู่ใน uploaded ของเดือนนี้ แต่ไม่อยู่ใน purchased ของเดือนนี้
   */
  axis: DateAxis = "purchased",
) {
  const [start, end] = monthRange(month);

  /**
   * purchasedAt เป็น string 'YYYY-MM-DD' เทียบช่วงแบบ lexicographic ได้เลย
   * ส่วน uploadedAt เป็น BSON Date จึงต้องแปลงขอบเขตเป็น Date ก่อน
   * (เทียบ Date กับ string ตรงๆ ใน Mongo จะไม่ match อะไรเลยแบบเงียบๆ)
   */
  const filter =
    axis === "uploaded"
      ? { userId, uploadedAt: { $gte: new Date(`${start}T00:00:00.000Z`), $lt: new Date(`${end}T00:00:00.000Z`) } }
      : { userId, purchasedAt: { $gte: start, $lt: end } };

  const [rows, book] = await Promise.all([
    transactions
      .find(filter)
      .sort(
        axis === "uploaded"
          ? { uploadedAt: -1, createdAt: -1 }
          : { purchasedAt: -1, createdAt: -1 },
      )
      .toArray(),
    loadBook(userId),
  ]);

  let expense = new Decimal(0);
  let expenseCount = 0;
  /**
   * ยอดต่อหมวด — key เป็น id ของ "หมวดหลัก" (หมวดย่อยรวมขึ้นไปที่แม่)
   * count คือจำนวน "ชิ้นของ" ไม่ใช่จำนวนใบเสร็จ
   * id ที่ไม่รู้จักหรือ null ตกไปที่ FALLBACK ผ่าน book.rootOf
   */
  const buckets = new Map<string, { total: Decimal; count: number }>();
  const byDay = new Map<string, Decimal>();

  const add = (categoryId: string | null, amount: Decimal, items: number) => {
    const key = book.rootOf(categoryId)._id;
    const b = buckets.get(key) ?? { total: new Decimal(0), count: 0 };
    buckets.set(key, { total: b.total.plus(amount), count: b.count + items });
  };

  for (const r of rows) {
    const total = dec(r.total) ?? new Decimal(0);
    expense = expense.plus(total);
    expenseCount++;
    // จัดกลุ่มตามแกนเดียวกับที่กรอง ไม่งั้นวันที่บนกราฟจะหลุดออกนอกเดือนที่เลือก
    const day =
      axis === "uploaded" ? r.uploadedAt.toISOString().slice(0, 10) : r.purchasedAt;
    byDay.set(day, (byDay.get(day) ?? new Decimal(0)).plus(total));

    /**
     * สรุปที่ระดับ "รายการย่อย" ไม่ใช่ระดับใบเสร็จ เพราะใบเดียวมีของหลายหมวดปนกัน
     * ของที่ยังไม่ได้จัดหมวดถูกยุบเข้า "อื่นๆ" ตอนสรุปเท่านั้น ไม่ได้เขียนทับใน DB
     */
    let itemsSum = new Decimal(0);
    let counted = 0;
    for (const item of r.items ?? []) {
      const amount = dec(item.amount);
      if (amount === null) continue;
      add(item.categoryId, amount, 1);
      itemsSum = itemsSum.plus(amount);
      counted++;
    }

    if (counted === 0) {
      // ไม่มีรายการย่อยเลย (กรอกเอง หรือ AI อ่านบรรทัดไม่ออกสักบรรทัด)
      // ทั้งใบไปอยู่ในหมวดที่ผู้ใช้เลือกไว้ที่ระดับใบเสร็จ
      add(r.categoryId, total, 0);
      continue;
    }

    /**
     * เศษที่กระจายลงรายการไม่ได้ — VAT ที่บวกท้าย, ส่วนลดท้ายบิล, ค่าบริการ,
     * หรือบรรทัดที่ OCR อ่านไม่ออก — เข้าช่อง "อื่นๆ"
     *
     * ต้องมีขั้นนี้ ไม่งั้นผลรวมของ by_category จะไม่เท่ากับ expense_total
     * แล้วผู้ใช้จะเห็นกราฟที่รวมกันไม่ตรงกับยอดที่จ่ายจริง (เป็นลบได้ถ้าส่วนลด
     * ทำให้ยอดรายการรวมเกินยอดสุทธิ — ปล่อยให้ติดลบตามจริง ไม่กลบ)
     */
    const residual = total.minus(itemsSum);
    if (!residual.isZero()) add(null, residual, 0);
  }

  const byCategory = [...buckets.entries()]
    .sort(([, a], [, b]) => b.total.comparedTo(a.total))
    .map(([id, b]) => {
      const c = book.get(id)!;
      return {
        category_id: id,
        // คงชื่อฟิลด์ category (= ชื่อหมวด) ไว้ หน้าที่แสดงผลอยู่แล้วจะได้ไม่ต้องแก้
        category: c.name,
        icon: c.icon,
        color: c.color,
        total: b.total.toFixed(2),
        count: b.count,
      };
    });

  const byDayOut = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total: total.toFixed(2) }));

  return {
    month,
    axis,
    expense_total: moneyOut(expense, expenseCount > 0),
    transaction_count: expenseCount,
    by_category: byCategory,
    by_day: byDayOut,
    rows,
    book,
  };
}

/**
 * เดือนที่มีรายจ่ายอยู่จริง พร้อมยอดรวมของแต่ละเดือน
 *
 * หน้าสรุปเปิดมาที่ "เดือนปัจจุบัน" เสมอ ถ้าใบเสร็จถูกบันทึกด้วยวันที่เดือนอื่น
 * (ผู้ใช้ถ่ายใบเก่า หรือ AI อ่านปีผิด) หน้าจะว่างเปล่าโดยไม่บอกอะไร แล้วดูเหมือน
 * ข้อมูลหาย — ตัวนี้ทำให้บอกได้ว่า "ข้อมูลอยู่เดือนไหน" แทนที่จะปล่อยให้เดาเอง
 */
export async function availableMonths(userId: string, axis: DateAxis = "purchased") {
  const rows = await transactions
    .aggregate<{ _id: string; total: string; count: number }>([
      { $match: { userId } },
      {
        $group: {
          _id:
            axis === "uploaded"
              ? { $dateToString: { format: "%Y-%m", date: "$uploadedAt" } }
              : { $substr: ["$purchasedAt", 0, 7] },
          // total เก็บเป็น string ตามกติกาเรื่องเงิน จึงรวมยอดในโค้ดแทนใน pipeline
          totals: { $push: "$total" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ])
    .toArray();

  return rows.map((r) => ({
    month: r._id,
    count: r.count,
    total: sum((r as unknown as { totals: string[] }).totals).toFixed(2),
  }));
}
