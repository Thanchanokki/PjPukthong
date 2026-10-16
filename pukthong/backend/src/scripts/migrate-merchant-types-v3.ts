/**
 * ครั้งเดียวจบ: แยก "ร้านขายยา/สุขภาพและความงาม" (pharmacy_beauty) ออกเป็น 2 ประเภท
 *
 *   ร้านเครื่องสำอาง/ของใช้ส่วนตัว (Boots, Watsons, EVEANDBOY, Beautrium …) -> beauty_personal
 *   ร้านอื่นในกลุ่มเดิม (ร้านขายยา คลินิก โรงพยาบาล)                       -> pharmacy
 *
 * ตัดสินจากชื่อร้าน ไม่แตะหมวดของรายการที่บันทึกไว้แล้ว
 * งบแบบ "ตามประเภทร้าน" ของ pharmacy_beauty ย้ายไป pharmacy (ประเภทที่ตั้งหมวดเริ่มต้นแบบเดิม)
 *
 * สั่งซ้ำได้ไม่มีผลข้างเคียง
 *   npm run migrate:merchant-types-v3
 */
import { budgets, close, connect, transactions } from "../db/client.js";

const BEAUTY =
  /boots|watsons|วัตสัน|eve\s*and\s*boy|eveandboy|อีฟแอนด์บอย|beautrium|บิวเทรี่ยม|sephora|เซโฟร่า|beauty|บิวตี้|cosme|คอสเม|konvy|เครื่องสำอาง/i;

await connect();
try {
  const rows = await transactions
    .find({ merchantType: "pharmacy_beauty" }, { projection: { merchantName: 1 } })
    .toArray();
  for (const t of rows) {
    const to = BEAUTY.test(t.merchantName ?? "") ? "beauty_personal" : "pharmacy";
    await transactions.updateOne({ _id: t._id }, { $set: { merchantType: to } });
    console.log(`${t.merchantName ?? "(ไม่ระบุร้าน)"} -> ${to}`);
  }

  for (const b of await budgets.find({ axis: "merchant", categoryId: "pharmacy_beauty" }).toArray()) {
    const clash = await budgets.findOne({ userId: b.userId, month: b.month, axis: "merchant", categoryId: "pharmacy" });
    if (clash) await budgets.deleteOne({ _id: b._id });
    else await budgets.updateOne({ _id: b._id }, { $set: { categoryId: "pharmacy" } });
    console.log(`งบ ${b.month}: pharmacy_beauty -> pharmacy${clash ? " (มีอยู่แล้ว ใช้วงเงินเดิม)" : ""}`);
  }
  console.log(`เสร็จแล้ว (${rows.length} ใบ)`);
} finally {
  await close();
}
