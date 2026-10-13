/**
 * งบประมาณ: วงเงินเก็บใน `budgets` ส่วนยอดที่ใช้ไปคำนวณสดจากรายการจริง
 *
 * มีสองแกน (axis) ให้ผู้ใช้สลับดู:
 * - item     = ตามหมวดสินค้ารายชิ้น — ยอดมาจาก monthlySummary ตัวเดียวกับหน้ารายงาน
 *              (หมวดย่อยรวมขึ้นหมวดหลัก) ตัวเลขสองหน้าจึงตรงกันเสมอ
 * - merchant = ตามประเภทร้าน — นับยอดรวม "ทั้งใบ" เข้าประเภทของร้านที่ออกใบ
 *              (ใบ 7-Eleven ที่มีนมกับปากกา = ร้านสะดวกซื้อทั้งใบ)
 */
import { randomUUID } from "node:crypto";

import { budgets } from "../../db/client.js";
import { httpError } from "../../shared/errors.js";
import { MERCHANT_TYPES, merchantTypeOf } from "../../shared/merchant-types.js";
import { Decimal, dec, quantize } from "../../shared/money.js";
import { loadBook } from "../categories/categories.service.js";
import { monthlySummary } from "../transactions/transactions.service.js";

export type BudgetAxis = "item" | "merchant";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** กันพิมพ์เลขศูนย์เกินโดยไม่ตั้งใจ — งบรายหมวดต่อเดือนไม่ควรถึงสิบล้าน */
const MAX_LIMIT = 10_000_000;

export function requireMonth(month: string | undefined): string {
  if (!month || !MONTH_RE.test(month)) {
    throw httpError(422, "รูปแบบเดือนต้องเป็น YYYY-MM เช่น 2026-08");
  }
  return month;
}

export const toAxis = (v: unknown): BudgetAxis => (v === "merchant" ? "merchant" : "item");

type Option = { id: string; name: string; icon: string | null; color: string | null };
type Spent = { total: string; count: number };

/**
 * ยอดที่ใช้ไปต่อกลุ่ม + รายการกลุ่มที่ตั้งงบได้ ของแกนที่เลือก
 * count = จำนวนรายการสินค้าทั้งสองแกน (ตรงกับ "รวม N รายการ" ในป๊อปอัพของหน้างบ)
 */
async function spentAndOptions(userId: string, month: string, axis: BudgetAxis) {
  const summary = await monthlySummary(userId, month, "purchased");

  if (axis === "item") {
    const { book } = summary;
    return {
      spent: new Map<string, Spent>(summary.by_category.map((c) => [c.category_id, c])),
      // ตั้งงบได้เฉพาะหมวดหลัก — ยอดของหมวดย่อยรวมอยู่ในหมวดหลักแล้ว
      options: book.active
        .filter((c) => !c.parentId)
        .map((c): Option => ({ id: c._id, name: c.name, icon: c.icon, color: c.color })),
      describe: (id: string): Option => {
        const c = book.get(id);
        return { id, name: c?.name ?? "(หมวดที่ถูกลบ)", icon: c?.icon ?? null, color: c?.color ?? null };
      },
    };
  }

  const acc = new Map<string, { total: Decimal; count: number }>();
  for (const r of summary.rows) {
    const id = merchantTypeOf(r.merchantType).id;
    const cur = acc.get(id) ?? { total: new Decimal(0), count: 0 };
    // นับรายการสินค้าแบบเดียวกับ by_category (ชิ้นที่มียอด) ไม่ใช่จำนวนใบ
    const items = (r.items ?? []).filter((i) => dec(i.amount) !== null).length;
    acc.set(id, { total: cur.total.plus(dec(r.total) ?? 0), count: cur.count + items });
  }
  const describe = (id: string): Option => {
    const t = merchantTypeOf(id);
    return { id, name: t.name, icon: t.icon, color: null };
  };
  return {
    spent: new Map<string, Spent>(
      [...acc].map(([id, v]) => [id, { total: v.total.toFixed(2), count: v.count }]),
    ),
    options: MERCHANT_TYPES.map((t) => describe(t.id)),
    describe,
  };
}

export async function getBudget(userId: string, month: string, axis: BudgetAxis) {
  requireMonth(month);
  const [{ spent, options, describe }, limits] = await Promise.all([
    spentAndOptions(userId, month, axis),
    budgets.find({ userId, month, axis }).toArray(),
  ]);
  const limitOf = new Map(limits.map((b) => [b.categoryId, b.limit]));

  const ids = new Set([...limitOf.keys(), ...spent.keys()]);
  const lines = [...ids]
    .map((id) => {
      const o = describe(id);
      const s = spent.get(id);
      return {
        category_id: id,
        category: o.name,
        icon: o.icon,
        color: o.color,
        limit: limitOf.get(id) ?? null,
        spent: s?.total ?? "0.00",
        count: s?.count ?? 0,
      };
    })
    // ไม่ได้ตั้งงบและยอดไม่เป็นบวก (เช่น "อื่นๆ" ที่มีแต่ส่วนลดท้ายบิล) ไม่มีอะไรให้ดู
    .filter((l) => l.limit !== null || Number(l.spent) > 0);

  return { month, axis, lines, options };
}

async function assertSelectable(userId: string, axis: BudgetAxis, id: string) {
  if (axis === "merchant") {
    if (!MERCHANT_TYPES.some((t) => t.id === id)) throw httpError(422, "ไม่พบประเภทร้านที่เลือก");
    return;
  }
  const c = (await loadBook(userId)).get(id);
  if (!c || !c.isActive) throw httpError(422, "ไม่พบหมวดที่เลือก");
  if (c.parentId) {
    throw httpError(422, "ตั้งงบได้เฉพาะหมวดหลัก — ยอดของหมวดย่อยรวมอยู่ในหมวดหลักแล้ว");
  }
}

export async function setLimit(
  userId: string,
  month: string,
  axis: BudgetAxis,
  categoryId: string,
  rawLimit: unknown,
): Promise<void> {
  requireMonth(month);
  await assertSelectable(userId, axis, categoryId);

  const limit = quantize(typeof rawLimit === "number" ? String(rawLimit) : (rawLimit as string));
  const value = dec(limit);
  if (value === null || !value.gt(0)) throw httpError(422, "วงเงินต้องมากกว่า 0 บาท");
  if (value.gt(MAX_LIMIT)) throw httpError(422, "วงเงินสูงเกินไป ตรวจจำนวนศูนย์อีกครั้ง");

  const now = new Date();
  await budgets.updateOne(
    { userId, month, axis, categoryId },
    {
      $set: { limit: limit as string, updatedAt: now },
      $setOnInsert: { _id: randomUUID(), createdAt: now },
    },
    { upsert: true },
  );
}

export async function removeLimit(
  userId: string,
  month: string,
  axis: BudgetAxis,
  categoryId: string,
) {
  requireMonth(month);
  await budgets.deleteOne({ userId, month, axis, categoryId });
}

/** ใช้งบชุดเดียวกับเดือนอื่น (แกนเดียวกัน) — ทับงบที่มีอยู่ของเดือนปลายทางทั้งหมด */
export async function copyBudget(
  userId: string,
  axis: BudgetAxis,
  fromMonth: string,
  toMonth: string,
) {
  requireMonth(fromMonth);
  requireMonth(toMonth);
  const source = await budgets.find({ userId, month: fromMonth, axis }).toArray();
  if (source.length === 0) {
    throw httpError(422, "เดือนก่อนหน้ายังไม่ได้ตั้งงบไว้ ลองตั้งงบทีละหมวดแทน");
  }

  const now = new Date();
  await budgets.deleteMany({ userId, month: toMonth, axis });
  await budgets.insertMany(
    source.map((b) => ({
      _id: randomUUID(),
      userId,
      month: toMonth,
      axis,
      categoryId: b.categoryId,
      limit: b.limit,
      createdAt: now,
      updatedAt: now,
    })),
  );
}
