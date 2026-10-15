/**
 * ครั้งเดียวจบ: ย้ายประเภทร้านชุดเดิม (10 แบบ) ไปเป็นชุดใหม่ตามสเปกของโปรเจกต์
 *
 *   fashion, electronics, stationery_books -> department_fashion (ห้างสรรพสินค้า/แฟชั่น)
 *   housing_bills                          -> bills_services (บิลและบริการ)
 *   entertainment, other_shop              -> general_other (ร้านค้าทั่วไป/อื่นๆ)
 *   convenience ที่ชื่อร้านเป็นซูเปอร์/ไฮเปอร์มาร์เก็ต -> supermarket
 *
 * ย้ายทั้ง transactions.merchantType และงบแบบ "ตามประเภทร้าน" (budgets axis=merchant)
 * ไม่แตะหมวดของรายการสินค้าที่บันทึกไว้แล้ว (ผู้ใช้อาจแก้เองมาแล้ว) — หมวดเริ่มต้นตามประเภทร้าน
 * มีผลกับใบที่สแกน/บันทึกหลังจากนี้
 *
 * สั่งซ้ำได้ไม่มีผลข้างเคียง
 *   npm run migrate:merchant-types-v2
 */
import { budgets, close, connect, transactions } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";
import { merchantTypeOf } from "../shared/merchant-types.js";

const RENAME: Record<string, string> = {
  fashion: "department_fashion",
  electronics: "department_fashion",
  stationery_books: "department_fashion",
  housing_bills: "bills_services",
  entertainment: "general_other",
  other_shop: "general_other",
};

/** Lotus's go fresh เป็นร้านสะดวกซื้อตามสเปก จึงตัดออกก่อนจับคำว่า Lotus */
const SUPERMARKET = /big\s*c|บิ๊กซี|tops|ท็อปส์|makro|แม็คโคร|cp\s*axtra|villa|gourmet|lotus|โลตัส/i;
const GO_FRESH = /go\s*fresh|โก\s*เฟรช/i;

await connect();
try {
  for (const [from, to] of Object.entries(RENAME)) {
    const res = await transactions.updateMany({ merchantType: from }, { $set: { merchantType: to } });
    if (res.modifiedCount) console.log(`${from} -> ${to}: ${res.modifiedCount} ใบ`);
  }

  const conv = await transactions
    .find({ merchantType: "convenience" }, { projection: { merchantName: 1 } })
    .toArray();
  for (const t of conv) {
    const name = t.merchantName ?? "";
    if (SUPERMARKET.test(name) && !GO_FRESH.test(name)) {
      await transactions.updateOne({ _id: t._id }, { $set: { merchantType: "supermarket" } });
      console.log(`convenience -> supermarket: ${name}`);
    }
  }

  // งบตามประเภทร้าน: ถ้าเดือนเดียวกันมีงบของประเภทปลายทางอยู่แล้ว เก็บของเดิมไว้แล้วลบตัวเก่าทิ้ง
  for (const [from, to] of Object.entries(RENAME)) {
    for (const b of await budgets.find({ axis: "merchant", categoryId: from }).toArray()) {
      const clash = await budgets.findOne({ userId: b.userId, month: b.month, axis: "merchant", categoryId: to });
      if (clash) {
        await budgets.deleteOne({ _id: b._id });
        console.log(`งบ ${b.month}: ${from} ซ้ำกับ ${to} ที่มีอยู่แล้ว — ใช้วงเงินเดิมของ ${to}`);
      } else {
        await budgets.updateOne({ _id: b._id }, { $set: { categoryId: to } });
        console.log(`งบ ${b.month}: ${from} -> ${to}`);
      }
    }
  }

  await ensureIndexes();
  const counts = await transactions
    .aggregate<{ _id: string | null; n: number }>([{ $group: { _id: "$merchantType", n: { $sum: 1 } } }, { $sort: { n: -1 } }])
    .toArray();
  console.log("\nประเภทร้านหลังย้าย:");
  for (const c of counts) console.log(`  ${merchantTypeOf(c._id).name} (${c._id ?? "ยังไม่จัด"}): ${c.n} ใบ`);
} finally {
  await close();
}
