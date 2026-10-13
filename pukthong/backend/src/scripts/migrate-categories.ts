/**
 * ครั้งเดียวจบ: ชื่อหมวด (category) -> id ของหมวด (categoryId) ทั้งระดับใบและรายชิ้น
 *
 * ก่อนมี collection `categories` ระบบเก็บชื่อหมวดภาษาไทยตรงๆ ตอนนี้เก็บ id แทน
 * ชื่อเก่าจับคู่ผ่าน aliases ของหมวดกลาง (เช่น "ช้อปปิ้ง" -> apparel,
 * "บิลและบริการ" -> housing) — ชื่อที่จับคู่ไม่ได้จะกลายเป็น null แล้วถูกพิมพ์ออกมาให้ตรวจ
 *
 * สั่งซ้ำได้ไม่มีผลข้างเคียง (แถวที่ย้ายแล้วไม่มีฟิลด์ category เหลือให้เข้าเงื่อนไขอีก)
 *   npm run migrate:categories
 */
import { close, connect, transactions } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";
import { ensureSystemCategories } from "../modules/categories/categories.service.js";
import { SYSTEM_CATEGORIES, matchCategory } from "../shared/categories.js";

type Legacy = { category?: string | null };

await connect();
try {
  await ensureIndexes();
  await ensureSystemCategories();

  const stale = await transactions
    .find({ $or: [{ category: { $exists: true } }, { "items.category": { $exists: true } }] })
    .toArray();
  console.log(`พบรายการที่ต้องย้าย ${stale.length} รายการ`);

  const unmatched: string[] = [];
  const toId = (name: string | null | undefined, where: string) => {
    if (!name) return null;
    const id = matchCategory(name, SYSTEM_CATEGORIES);
    if (!id) unmatched.push(`${where}: "${name}"`);
    return id;
  };

  for (const t of stale) {
    const label = t.merchantName ?? "(ไม่ระบุร้าน)";
    const items = (t.items ?? []).map((raw) => {
      const { category, ...item } = raw as typeof raw & Legacy;
      return {
        ...item,
        categoryId: item.categoryId ?? toId(category, `${label} / ${item.name}`),
      };
    });
    const legacy = (t as typeof t & Legacy).category;

    await transactions.updateOne(
      { _id: t._id },
      {
        $set: { items, categoryId: t.categoryId ?? toId(legacy, label) },
        $unset: { category: "" },
      },
    );
  }

  if (unmatched.length > 0) {
    console.log("⚠️ จับคู่ไม่ได้ (ตั้งเป็นยังไม่ได้จัดหมวด):");
    for (const u of unmatched) console.log(`  ${u}`);
  }
  console.log("ย้ายเสร็จแล้ว");
} finally {
  await close();
}
