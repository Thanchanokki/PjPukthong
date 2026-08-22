/**
 * ครั้งเดียวจบ: occurredOn/occurredAtTime -> purchasedAt/purchasedTime และเติม uploadedAt
 *
 * uploadedAt ของรายการที่ผูกกับใบเสร็จใช้เวลาที่อัปโหลดรูป (receipts.createdAt)
 * ส่วนรายการที่กรอกเองใช้เวลาที่สร้างเรคอร์ด — ตรงกับที่ service ทำตอนบันทึกใหม่
 *
 * สั่งซ้ำได้ไม่มีผลข้างเคียง (แถวที่ย้ายแล้วจะไม่เข้าเงื่อนไข $exists อีก)
 */
import { close, connect, receipts, transactions } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";

await connect();
try {
  const stale = await transactions.find({ occurredOn: { $exists: true } }).toArray();
  console.log(`พบรายการที่ต้องย้าย ${stale.length} รายการ`);

  for (const t of stale) {
    const old = t as unknown as {
      occurredOn: string;
      occurredAtTime: string | null;
      receiptId: string | null;
      createdAt: Date;
    };
    const receipt = old.receiptId
      ? await receipts.findOne({ _id: old.receiptId })
      : null;

    await transactions.updateOne(
      { _id: t._id },
      {
        $set: {
          purchasedAt: old.occurredOn,
          purchasedTime: old.occurredAtTime ?? null,
          uploadedAt: receipt?.createdAt ?? old.createdAt,
        },
        $unset: { occurredOn: "", occurredAtTime: "" },
      },
    );
    console.log(`  ${t.merchantName ?? "(ไม่ระบุ)"} | ซื้อ ${old.occurredOn}`);
  }

  await ensureIndexes();
  console.log("ย้ายเสร็จและสร้าง index ใหม่แล้ว");
} finally {
  await close();
}
