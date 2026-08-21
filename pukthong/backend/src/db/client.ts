/**
 * การเชื่อมต่อ MongoDB — client ตัวเดียวใช้ร่วมกันทั้งแอป (มี connection pool ในตัว)
 *
 * driver ต่อให้เองตอนสั่ง query ครั้งแรก แต่เราเรียก connect() ตอนบูตเพื่อให้
 * รู้ทันทีว่าต่อฐานข้อมูลไม่ได้ แทนที่จะไปพังตอนผู้ใช้กดปุ่มแรก
 *
 * ไฟล์นี้ดูแลแค่ "การต่อ" กับ "หน้าตาของ collection" — กติกาเรื่อง index อยู่ที่ indexes.ts
 */
import { MongoClient } from "mongodb";

import { settings } from "../config/index.js";
import type { ReceiptDoc, TransactionDoc, UserDoc } from "./models.js";

export const client = new MongoClient(settings.mongoUri, {
  serverSelectionTimeoutMS: 5000,
});

export const database = client.db(settings.mongoDbName);

export const users = database.collection<UserDoc>("users");
export const receipts = database.collection<ReceiptDoc>("receipts");
export const transactions = database.collection<TransactionDoc>("transactions");

export async function connect(): Promise<void> {
  await client.connect();
  await database.command({ ping: 1 });
}

export async function close(): Promise<void> {
  await client.close();
}
