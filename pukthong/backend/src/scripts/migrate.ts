/**
 * MongoDB สร้าง collection ให้เองตอนเขียนข้อมูลครั้งแรก จึงไม่มี migration
 * แบบ SQL อีกต่อไป — เหลือแค่สร้าง index ที่แอปพึ่งพา ซึ่งเรียกซ้ำได้ไม่มีผลข้างเคียง
 */
import { close, connect, database } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";

await connect();
try {
  await ensureIndexes();
  console.log(`สร้าง index ครบแล้วในฐานข้อมูล '${database.databaseName}'`);
} finally {
  await close();
}
