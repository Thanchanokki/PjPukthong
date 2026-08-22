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
import { scanConfidence } from "./confidence.js";
import * as quality from "./image.quality.js";
import * as storage from "./image.storage.js";
import * as ocr from "./ocr.provider.js";
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
  /** null = ไม่ได้ทำ OCR (ปิดไว้ หรือเรียกไม่สำเร็จ) */
  ocrQuality: number | null;
  ocrLowQuality: boolean;
  hasOcr: boolean;
}

/**
 * เก็บรูปใบเสร็จลงระบบ
 *
 * ยังไม่เรียก AI ตรงนี้ เพื่อให้เตือนเรื่องภาพเบลอได้ก่อนที่จะเสียค่าเรียก API
 *
 * แต่ "ทำ OCR" ตรงนี้เลย เพราะ Cloud Vision ถูกและเร็วกว่า AI มาก และผลของมัน
 * ถูกใช้ทั้งตอนกด ✨ (ส่งไปคู่กับรูป) และตอนเตือนว่าภาพอ่านยาก จึงคุ้มที่จะทำล่วงหน้า
 * ทุกใบ — ผลถูกเก็บลง DB จึงไม่ถูกเรียกซ้ำแม้ผู้ใช้กด "อ่านซ้ำ" หลายรอบ
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
      // ใช้ผล OCR ที่เก็บไว้รอบก่อน ไม่ยิง Cloud Vision ซ้ำให้เสียเงินฟรี
      ocrQuality: existing.ocrQuality ?? null,
      ocrLowQuality: ocr.isLowQuality(existing.ocrQuality ?? null),
      hasOcr: Boolean(existing.ocrText),
    };
  }

  // ทำขนานกัน — ทั้งคู่ไม่ขึ้นต่อกันและ OCR เป็นตัวที่ช้าที่สุดในขั้นตอนนี้
  const [score, ocrResult] = await Promise.all([
    quality.blurScore(jpeg),
    ocr.readText(jpeg),
  ]);
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
    // ข้อความจาก OCR ใช้ได้ทันทีตั้งแต่อัปโหลด ไม่ต้องรอให้ AI อ่าน
    rawText: ocrResult.text,
    aiModel: null,
    ocrText: ocrResult.text,
    ocrQuality: roundQuality(ocrResult.quality),
    createdAt: new Date(),
  };
  await receipts.insertOne(row);

  return {
    receiptId: row._id,
    duplicate: false,
    blurry: quality.isBlurry(score),
    blurScore: score,
    ocrQuality: row.ocrQuality,
    ocrLowQuality: ocr.isLowQuality(ocrResult.quality),
    hasOcr: ocrResult.text !== null,
  };
}

/** เก็บทศนิยม 3 ตำแหน่งพอ — เป็นค่าคุณภาพ ไม่ใช่เงิน จึงเป็น number ได้ */
const roundQuality = (v: number | null) =>
  v === null ? null : Math.round(v * 1000) / 1000;

/** ปุ่ม ✨ ให้ AI อ่านให้ — เรียกซ้ำได้ถ้าผลรอบแรกไม่ดี */
export async function extract(userId: string, receiptId: string) {
  const receipt = await findOwned(receiptId, userId);
  const jpeg = await loadImage(receipt);
  const ocrText = await ensureOcr(receipt, jpeg);

  let payload: Record<string, unknown> | null;
  let model: string;
  try {
    ({ payload, model } = await ai.extractReceipt(jpeg, ocrText));
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
    return {
      receipt_id: receiptId,
      draft,
      warnings: draft.warnings,
      ai_model: model,
      scan_confidence: scanConfidence(draft, ocrText, receipt.ocrQuality ?? null),
    };
  }

  // เทียบกับเวลาที่อัปโหลดรูป ไม่ใช่เวลาที่กดปุ่ม ✨ (อาจกดทีหลังเป็นวันๆ)
  const draft = enrich(parseDraft(payload), receipt.createdAt);

  await receipts.updateOne(
    { _id: receiptId },
    {
      $set: {
        rawPayload: payload,
        // ข้อความของ OCR มาจากพิกเซลจริง จึงเชื่อถือได้กว่าที่โมเดลถอดเอง — ใช้ก่อนเสมอ
        rawText: ocrText ?? draft.raw_text,
        aiModel: model,
        status: "extracted",
      },
    },
  );

  return {
    receipt_id: receiptId,
    draft,
    warnings: draft.warnings,
    ai_model: model,
    /**
     * คิดหลัง enrich เพื่อให้ใช้ค่าชุดเดียวกับที่ผู้ใช้เห็นในฟอร์มเป๊ะๆ
     * (ถ้าคิดก่อน ตัวเลขที่โชว์กับตัวเลขที่ให้คะแนนอาจเป็นคนละชุด)
     */
    scan_confidence: scanConfidence(draft, ocrText, receipt.ocrQuality ?? null),
  };
}

/**
 * คืนข้อความ OCR ของใบเสร็จ — ทำ OCR ให้ถ้ายังไม่เคยมี
 *
 * จำเป็นเพราะใบเสร็จที่อัปโหลดไว้ "ก่อน" เปิดใช้ Cloud Vision (หรือตอนที่ Vision ล่ม)
 * จะไม่มี ocrText ติดมาด้วย — ถ้าไม่เติมให้ตรงนี้ ใบเก่าจะไม่ได้ประโยชน์จาก OCR เลย
 * ผลถูกเขียนกลับลง DB จึงเกิดขึ้นครั้งเดียวต่อใบ ไม่ใช่ทุกครั้งที่กด "อ่านซ้ำ"
 */
async function ensureOcr(receipt: ReceiptDoc, jpeg: Buffer): Promise<string | null> {
  if (receipt.ocrText) return receipt.ocrText;
  if (!ocr.isEnabled()) return null;

  const result = await ocr.readText(jpeg);
  if (result.text === null) return null;

  await receipts.updateOne(
    { _id: receipt._id },
    {
      $set: {
        ocrText: result.text,
        ocrQuality: roundQuality(result.quality),
        // ใบเก่ายังไม่เคยมี rawText ที่เชื่อถือได้ — เติมให้ด้วยเลย
        rawText: result.text,
      },
    },
  );
  return result.text;
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
