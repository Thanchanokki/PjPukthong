/**
 * endpoint ของใบเสร็จ — รับ multipart, ตรวจขนาด/ชนิดไฟล์, แล้วส่งต่อให้ service
 *
 * ทุก route ที่นี่ต้องล็อกอิน — ใส่ preHandler ทีละตัวแทน hook ระดับ plugin เพราะ
 * route รูปภาพต้องยอมรับ token จาก query string ด้วย (<img src> แนบ header ไม่ได้)
 *
 * เพิ่ม route ใหม่เมื่อไหร่ ต้องไม่ลืมใส่ { preHandler: requireAuth }
 */
import type { FastifyInstance } from "fastify";

import { maxUploadBytes, settings } from "../../config/index.js";
import { httpError, requireUuid } from "../../shared/errors.js";
import { requireAuth, requireAuthAllowQueryToken } from "../auth/auth.security.js";
import { ALLOWED_MIME } from "./image.storage.js";
import { receiptRawOut } from "./receipts.serializer.js";
import * as service from "./receipts.service.js";

export default async function receiptsController(app: FastifyInstance) {
  app.post("/api/receipts", { preHandler: requireAuth }, async (req, reply) => {
    const part = await req.file();
    if (!part) throw httpError(400, "ไม่พบไฟล์ที่อัปโหลด");

    if (part.mimetype && !ALLOWED_MIME.has(part.mimetype.toLowerCase())) {
      throw httpError(
        415,
        `ไม่รองรับไฟล์ชนิด ${part.mimetype} (รองรับ JPEG, PNG, WebP, HEIC)`,
      );
    }

    let raw: Buffer;
    try {
      raw = await part.toBuffer();
    } catch (err) {
      throw httpError(413, `ไฟล์ใหญ่เกิน ${settings.maxUploadMb} MB`, err);
    }
    if (part.file.truncated || raw.length > maxUploadBytes) {
      throw httpError(413, `ไฟล์ใหญ่เกิน ${settings.maxUploadMb} MB`);
    }
    if (raw.length === 0) throw httpError(400, "ไฟล์ว่างเปล่า");

    const result = await service.createFromImage(req.userId, raw);

    return reply.code(201).send({
      receipt_id: result.receiptId,
      duplicate: result.duplicate,
      blurry: result.blurry,
      blur_score: result.blurScore,
      image_url: `/api/receipts/${result.receiptId}/image`,
    });
  });

  /** ปุ่ม ✨ ให้ AI อ่านให้ — เรียกซ้ำได้ถ้าผลรอบแรกไม่ดี */
  app.post<{ Params: { receiptId: string } }>(
    "/api/receipts/:receiptId/extract",
    { preHandler: requireAuth },
    async (req) =>
      service.extract(req.userId, requireUuid(req.params.receiptId, "receipt_id")),
  );

  /**
   * คืนรูปใบเสร็จ ไว้แสดงคู่ฟอร์มให้ผู้ใช้ซูมตรวจ
   *
   * route เดียวที่รับ token ทาง ?token= ได้ เพราะ frontend ใส่ URL นี้ลง <img src>
   * ตรงๆ ซึ่งแนบ Authorization header ไม่ได้
   */
  app.get<{ Params: { receiptId: string }; Querystring: { token?: string } }>(
    "/api/receipts/:receiptId/image",
    { preHandler: requireAuthAllowQueryToken },
    async (req, reply) => {
      const id = requireUuid(req.params.receiptId, "receipt_id");
      const data = await service.readImage(req.userId, id);
      return reply
        .type("image/jpeg")
        .header("Cache-Control", "private, max-age=86400")
        .send(data);
    },
  );

  /** JSON ดิบจาก AI ไว้ debug ตอนผลอ่านเพี้ยน */
  app.get<{ Params: { receiptId: string } }>(
    "/api/receipts/:receiptId/raw",
    { preHandler: requireAuth },
    async (req) => {
      const id = requireUuid(req.params.receiptId, "receipt_id");
      return receiptRawOut(await service.findOwned(id, req.userId));
    },
  );
}
