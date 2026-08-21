/**
 * ตรรกะของรายการรับ-จ่าย: บันทึก แก้ไข ลบ และสรุปยอดรายเดือน
 *
 * การคำนวณเงินทุกจุดใช้ Decimal เท่านั้น (ดูเหตุผลใน shared/money.ts)
 */
import { randomUUID } from "node:crypto";

import { receipts, transactions } from "../../db/client.js";
import type { TransactionDoc, TransactionItemDoc } from "../../db/models.js";
import { httpError } from "../../shared/errors.js";
import { Decimal, dec, moneyOut, quantize } from "../../shared/money.js";
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

/** ฟิลด์ที่ผู้ใช้แก้ได้ — ใช้ร่วมกันทั้งตอน insert และ update */
function toFields(payload: TransactionCreate) {
  return {
    direction: payload.direction,
    merchantName: payload.merchant_name,
    branch: payload.branch,
    merchantTaxId: payload.merchant_tax_id,
    docNumber: payload.doc_number,
    occurredOn: payload.occurred_on,
    occurredAtTime: payload.occurred_at_time,
    currency: payload.currency,
    subtotal: quantize(payload.subtotal),
    discount: quantize(payload.discount),
    serviceCharge: quantize(payload.service_charge),
    vatRate: quantize(payload.vat_rate),
    vatAmount: quantize(payload.vat_amount),
    total: quantize(payload.total) as string,
    category: payload.category,
    paymentMethod: payload.payment_method,
    paymentChannel: payload.payment_channel,
    note: payload.note,
  };
}

const itemDocs = (payload: TransactionCreate): TransactionItemDoc[] =>
  payload.items.map((item, i) => ({
    lineNo: item.line_no ?? i + 1,
    name: item.name,
    // จำนวนใบเสร็จมีทศนิยมได้ถึง 3 ตำแหน่ง (เช่น ชั่งกิโล 0.375)
    qty: quantize(item.qty, 3),
    unitPrice: quantize(item.unit_price),
    amount: quantize(item.amount),
    flag: item.flag,
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
  if (payload.receipt_id) {
    const updated = await receipts.updateOne(
      { _id: payload.receipt_id, userId },
      { $set: { status: "confirmed" } },
    );
    if (updated.matchedCount === 0) throw httpError(404, "ไม่พบใบเสร็จที่อ้างถึง");
  }

  const now = new Date();
  const doc: TransactionDoc = {
    _id: randomUUID(),
    userId,
    receiptId: payload.receipt_id ?? null,
    verifiedByUser: true,
    ...toFields(payload),
    items: itemDocs(payload),
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
  // แทนที่รายการย่อยทั้งชุด (เทียบเท่า cascade delete-orphan ของเดิม)
  const row = await transactions.findOneAndUpdate(
    { _id: id, userId },
    {
      $set: {
        ...toFields(payload),
        items: itemDocs(payload),
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

/** รายการทั้งเดือนพร้อมยอดสรุป — หน้าแรกของแอปเรียกตัวนี้ตัวเดียว */
export async function monthlySummary(userId: string, month: string) {
  const [start, end] = monthRange(month);

  // occurredOn เป็น 'YYYY-MM-DD' จึงเทียบช่วงแบบ string ได้ตรงกับ DATE ของเดิม
  const rows = await transactions
    .find({ userId, occurredOn: { $gte: start, $lt: end } })
    .sort({ occurredOn: -1, createdAt: -1 })
    .toArray();

  let income = new Decimal(0);
  let expense = new Decimal(0);
  let incomeCount = 0;
  let expenseCount = 0;
  // สรุปตามหมวด นับเฉพาะรายจ่าย (รายรับไม่มีหมวดในแอปนี้)
  const buckets = new Map<string | null, { total: Decimal; count: number }>();

  for (const r of rows) {
    const amount = dec(r.total) ?? new Decimal(0);
    if (r.direction === "income") {
      income = income.plus(amount);
      incomeCount++;
    } else if (r.direction === "expense") {
      expense = expense.plus(amount);
      expenseCount++;
      const b = buckets.get(r.category) ?? { total: new Decimal(0), count: 0 };
      buckets.set(r.category, { total: b.total.plus(amount), count: b.count + 1 });
    }
  }

  const byCategory = [...buckets.entries()]
    .map(([category, b]) => ({ category, total: b.total, count: b.count }))
    .sort((a, b) => b.total.comparedTo(a.total))
    .map((c) => ({ category: c.category, total: c.total.toFixed(2), count: c.count }));

  return {
    month,
    income_total: moneyOut(income, incomeCount > 0),
    expense_total: moneyOut(expense, expenseCount > 0),
    net: moneyOut(income.minus(expense), incomeCount + expenseCount > 0),
    by_category: byCategory,
    rows,
  };
}
