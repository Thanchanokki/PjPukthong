/**
 * ครั้งเดียวจบ: เติม merchantType ให้รายการที่บันทึกไว้ก่อนมีระบบประเภทร้าน
 *
 * ส่งเฉพาะ "ชื่อร้าน" (ไม่ส่งรูป) ไปให้ AI จัดประเภท — ชื่อซ้ำกันส่งครั้งเดียว
 * ร้านที่ AI จัดไม่ได้ปล่อยเป็น null (นับเป็น "ร้านอื่นๆ" ตอนสรุป แก้เองได้ในฟอร์ม)
 *
 * สั่งซ้ำได้ — แตะเฉพาะแถวที่ยังไม่มี merchantType
 *   npm run migrate:merchant-types
 */
import { close, connect, transactions } from "../db/client.js";
import { classifyMerchants } from "../modules/receipts/ai.provider.js";
import { matchMerchantType, merchantTypeOf } from "../shared/merchant-types.js";

await connect();
try {
  const rows = await transactions
    .find({ merchantType: { $in: [null] } }, { projection: { merchantName: 1 } })
    .toArray();
  const names = [...new Set(rows.map((r) => r.merchantName?.trim()).filter((n): n is string => !!n))];
  console.log(`รายการที่ยังไม่มีประเภทร้าน ${rows.length} รายการ จาก ${names.length} ร้าน`);

  const answer = await classifyMerchants(names);
  for (const name of names) {
    const id = matchMerchantType(answer[name]);
    const res = await transactions.updateMany(
      { merchantName: name, merchantType: { $in: [null] } },
      { $set: { merchantType: id } },
    );
    console.log(`  ${name} -> ${id ? merchantTypeOf(id).name : "(จัดไม่ได้)"}  [${res.modifiedCount} ใบ]`);
  }
  console.log("เสร็จแล้ว");
} finally {
  await close();
}
