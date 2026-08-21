/**
 * จุดเริ่มของ backend — ต่อฐานข้อมูล เตรียมโฟลเดอร์รูป แล้วเปิดพอร์ต
 *
 * ทุกอย่างที่ "อาจล้ม" ถูกเรียกตั้งแต่ตอนบูตโดยตั้งใจ (JWT_SECRET, MongoDB)
 * เพื่อให้รู้ปัญหาทันทีพร้อมข้อความชัดๆ แทนที่จะไปพังตอนผู้ใช้กดปุ่มแรก
 */
import { mkdir } from "node:fs/promises";

import { buildApp } from "./app.js";
import { requireJwtSecret, settings } from "./config/index.js";
import { close as closeDb, connect as connectDb } from "./db/client.js";
import { ensureIndexes } from "./db/indexes.js";

// ล้มตั้งแต่บรรทัดแรกถ้าลืมตั้ง JWT_SECRET ดีกว่าไปพังตอนคนแรกกดสมัครสมาชิก
requireJwtSecret();

const app = await buildApp();

await connectDb();
await ensureIndexes();
app.addHook("onClose", async () => {
  await closeDb();
});

await mkdir(settings.uploadDir, { recursive: true });
if (!settings.kkuApiKey) {
  app.log.warn("ยังไม่ได้ตั้ง KKU_API_KEY ใน .env — ปุ่มให้ AI อ่านจะใช้งานไม่ได้");
}

await app.listen({ host: "0.0.0.0", port: settings.port });
