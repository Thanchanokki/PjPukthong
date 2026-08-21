/**
 * index ที่แอปพึ่งพาจริงๆ — createIndex เป็น idempotent จึงเรียกซ้ำได้ทุกครั้ง
 *
 * fileHash ต้อง unique เพราะ receipts.service ใช้ตรวจว่าอัปโหลดรูปซ้ำหรือยัง
 * ถ้าไม่มี unique index สองคำขอที่มาพร้อมกันจะสร้างใบเสร็จซ้ำได้ — แต่ต้อง unique
 * "ต่อผู้ใช้" ไม่ใช่ทั้งระบบ ไม่งั้นคนที่สองอัปโหลดใบเสร็จรูปเดียวกับคนแรกไม่ได้เลย
 *
 * index ที่ใช้กรองข้อมูลรายคนต้องมี userId นำหน้าเสมอ เพราะทุก query มี userId
 * เป็นเงื่อนไขแรกหลังบังคับล็อกอิน
 */
import { receipts, transactions, users } from "./client.js";

export async function ensureIndexes(): Promise<void> {
  // ฐานข้อมูลที่สร้างก่อนมีระบบล็อกอินยังค้าง unique index บน fileHash เดี่ยวอยู่
  // ปล่อยไว้จะทำให้ผู้ใช้คนที่สองอัปโหลดรูปซ้ำไม่ได้ — ทิ้งก่อนแล้วค่อยสร้างตัวใหม่
  // (index ของ transactions ตัวเก่าไม่ unique จึงไม่ทำให้พัง แต่ทิ้งไปด้วยเพราะไม่มีใครใช้แล้ว)
  const stale = [
    receipts.dropIndex("receipts_file_hash_uq"),
    transactions.dropIndex("transactions_occurred_on_idx"),
    transactions.dropIndex("transactions_receipt_id_idx"),
  ];
  await Promise.all(
    stale.map((p) =>
      p.catch(() => {
        /* ยังไม่เคยมี index นี้ (ฐานข้อมูลใหม่) — ไม่ใช่ปัญหา */
      }),
    ),
  );

  await users.createIndex({ email: 1 }, { unique: true, name: "users_email_uq" });
  await receipts.createIndex(
    { userId: 1, fileHash: 1 },
    { unique: true, name: "receipts_user_file_hash_uq" },
  );
  await transactions.createIndex(
    { userId: 1, occurredOn: -1, createdAt: -1 },
    { name: "transactions_user_occurred_on_idx" },
  );
  await transactions.createIndex(
    { userId: 1, receiptId: 1 },
    { name: "transactions_user_receipt_id_idx" },
  );
}
