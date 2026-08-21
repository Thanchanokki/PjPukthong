/**
 * ตรรกะของใบเสร็จ: รับรูป -> normalize -> hash -> เช็คเบลอ -> ให้ AI อ่าน
 *
 * แยกออกจาก controller เพราะขั้นตอนพวกนี้ไม่ได้ผูกกับ HTTP เลย — ถ้าวันหลัง
 * ต้องอ่านใบเสร็จจาก cron หรือจาก queue ก็เรียกฟังก์ชันในไฟล์นี้ได้ตรงๆ
 */
import { randomUUID } from "node:crypto";

import { receipts } from "../../db/client.js";
import type { ReceiptDoc } from "../../db/models.js";
import { httpError } from "../../shared/errors.js";
import * as ai from "./ai.provider.js";
import * as quality from "./image.quality.js";
import * as storage from "./image.storage.js";
import { enrich } from "./receipts.enrich.js";
import { emptyDraft, parseDraft } from "./receipts.schema.js";
import { blurOut } from "./receipts.serializer.js";

/** ใบเสร็จของคนอื่นตอบ 404 เหมือนไม่มีอยู่จริง — ไม่บอกใบ้ว่ามี id นี้ในระบบ */
export async function findOwned(id: string, userId: string): Promise<ReceiptDoc> {
  const row = await receipts.findOne({ _id: id, userId });
  if (!row) throw httpError(404, "ไม่พบใบเสร็จนี้");
  return row;
}

export interface UploadResult {
  receiptId: string;
  duplicate: boolean;
  blurry: boolean;
  blurScore: number | null;
}

/**
 * เก็บรูปใบเสร็จลงระบบ
 *
 * ยังไม่เรียก AI ตรงนี้ เพื่อให้เตือนเรื่องภาพเบลอได้ก่อนที่จะเสียค่าเรียก API
 */
export async function createFromImage(
  userId: string,
  raw: Buffer,
): Promise<UploadResult> {
  let jpeg: Buffer;
  try {
    jpeg = await storage.normalizeImage(raw);
  } catch (err) {
    if (err instanceof storage.ImageError) throw httpError(400, err.message, err);
    throw err;
  }

  const fileHash = storage.sha256Hex(jpeg);

  // เช็คซ้ำเฉพาะในใบเสร็จของคนนี้ — คนละคนอัปโหลดรูปเดียวกันได้ ไม่ถือว่าซ้ำ
  const existing = await receipts.findOne({ userId, fileHash });
  if (existing) {
    // อัปโหลดซ้ำ = คืนใบเดิม ไม่ใช่ error (ผู้ใช้จะได้ไม่ต้องเริ่มใหม่)
    const score = blurOut(existing.blurScore);
    return {
      receiptId: existing._id,
      duplicate: true,
      blurry: quality.isBlurry(score),
      blurScore: score,
    };
  }

  const score = await quality.blurScore(jpeg);
  const storageKey = await storage.save(jpeg, fileHash);

  const row: ReceiptDoc = {
    _id: randomUUID(),
    userId,
    storageKey,
    fileHash,
    status: "uploaded",
    // เดิมคอลัมน์เป็น NUMERIC(10,3) ฐานข้อมูลปัดให้เอง — Mongo ไม่ปัด จึงปัดตรงนี้
    blurScore: score === null ? null : Math.round(score * 1000) / 1000,
    rawPayload: null,
    rawText: null,
    aiModel: null,
    createdAt: new Date(),
  };
  await receipts.insertOne(row);

  return {
    receiptId: row._id,
    duplicate: false,
    blurry: quality.isBlurry(score),
    blurScore: score,
  };
}

/** ปุ่ม ✨ ให้ AI อ่านให้ — เรียกซ้ำได้ถ้าผลรอบแรกไม่ดี */
export async function extract(userId: string, receiptId: string) {
  const receipt = await findOwned(receiptId, userId);
  const jpeg = await loadImage(receipt);

  let payload: Record<string, unknown> | null;
  let model: string;
  try {
    ({ payload, model } = await ai.extractReceipt(jpeg));
  } catch (err) {
    if (err instanceof ai.AIUnavailable) {
      await receipts.updateOne({ _id: receiptId }, { $set: { status: "failed" } });
      throw httpError(502, err.message, err);
    }
    throw err;
  }

  if (payload === null) {
    // โมเดลตอบมาแต่ไม่ใช่ JSON — ยังต้องให้ผู้ใช้กรอกมือต่อได้ ห้ามโยน 500
    const draft = emptyDraft([
      'AI ตอบกลับในรูปแบบที่อ่านไม่ได้ ลองกด "ให้ AI อ่านซ้ำ" อีกครั้ง',
    ]);
    await receipts.updateOne(
      { _id: receiptId },
      { $set: { status: "failed", aiModel: model } },
    );
    return { receipt_id: receiptId, draft, warnings: draft.warnings, ai_model: model };
  }

  const draft = enrich(parseDraft(payload));

  await receipts.updateOne(
    { _id: receiptId },
    {
      $set: {
        rawPayload: payload,
        rawText: draft.raw_text,
        aiModel: model,
        status: "extracted",
      },
    },
  );

  return { receipt_id: receiptId, draft, warnings: draft.warnings, ai_model: model };
}

/** อ่านไฟล์รูปของใบเสร็จที่เป็นของผู้ใช้คนนี้ */
export async function readImage(userId: string, receiptId: string): Promise<Buffer> {
  return loadImage(await findOwned(receiptId, userId));
}

/** ไฟล์หายจากดิสก์ทั้งที่มีแถวในฐานข้อมูล = 404 ไม่ใช่ 500 */
async function loadImage(receipt: ReceiptDoc): Promise<Buffer> {
  try {
    return await storage.load(receipt.storageKey);
  } catch (err) {
    if (err instanceof storage.ImageError) throw httpError(404, err.message, err);
    throw err;
  }
}
