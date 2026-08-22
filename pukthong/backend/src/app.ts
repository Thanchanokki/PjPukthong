/**
 * ประกอบ Fastify instance: plugin, ตัวจัดการ error, และ route ทุก module
 *
 * แยกจาก server.ts เพราะไฟล์นี้ไม่แตะฐานข้อมูลและไม่เปิดพอร์ต — สร้าง app
 * ขึ้นมาทดสอบ (app.inject) ได้โดยไม่ต้องมี MongoDB
 */
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";

import {
  LAN_ORIGIN_RE,
  corsOriginList,
  maxUploadBytes,
  settings,
} from "./config/index.js";
import authController from "./modules/auth/auth.controller.js";
import receiptsController from "./modules/receipts/receipts.controller.js";
import transactionsController from "./modules/transactions/transactions.controller.js";
import { HttpError } from "./shared/errors.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "info" }, bodyLimit: maxUploadBytes });

  // ไม่มี CORS = browser บล็อกทุก request จาก :3000 ไป :8000
  await app.register(cors, {
    /**
     * รับเป็นฟังก์ชันแทน array เพื่อให้เปิดจากมือถือได้โดยไม่ต้องไล่แก้ IP ทุกครั้ง
     * ที่เราเตอร์แจกเลขใหม่ (เปิดด้วย CORS_ALLOW_LAN=true เท่านั้น)
     */
    origin: (origin, cb) => {
      // ไม่มี origin = curl / แอปมือถือ / same-origin — ไม่ใช่คำขอข้ามโดเมนจึงไม่ต้องกรอง
      if (!origin) return cb(null, true);
      if (corsOriginList.includes(origin)) return cb(null, true);
      if (settings.corsAllowLan && LAN_ORIGIN_RE.test(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  await app.register(multipart, {
    // +1 ไบต์ เพื่อให้ตรวจจับไฟล์ที่ใหญ่เกินได้ แล้วตอบ 413 พร้อมข้อความไทย
    limits: { fileSize: maxUploadBytes + 1, files: 1 },
  });

  /**
   * FastAPI ยอมรับ POST ที่ไม่มี body เลย (ปุ่ม ✨ ยิง fetch แบบไม่มี Content-Type)
   * แต่ Fastify ตอบ 415 ให้ทุก content-type ที่ไม่รู้จัก — ต้องบอกให้ยอมรับ
   * body เปล่าด้วย ไม่งั้น /extract จะพังทั้งที่ไม่มีอะไรผิด
   */
  app.addContentTypeParser("*", (_req, payload, done) => {
    payload.resume(); // ต้อง drain stream ทิ้ง ไม่งั้น request ค้าง
    payload.on("end", () => done(null, undefined));
    payload.on("error", done);
  });

  /** ตอบ error รูปแบบเดียวกับ FastAPI: {"detail": "..."} */
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send({ detail: error.message });
    }

    const err = error as { code?: string; statusCode?: number; message?: string };
    if (err.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.code(413).send({ detail: `ไฟล์ใหญ่เกิน ${settings.maxUploadMb} MB` });
    }
    // body ที่ไม่ใช่ JSON, method ไม่รองรับ ฯลฯ — ส่งข้อความของ Fastify ต่อไปตรงๆ
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ detail: err.message ?? "คำขอไม่ถูกต้อง" });
    }

    app.log.error(error);
    return reply.code(500).send({ detail: "เกิดข้อผิดพลาดภายในระบบ" });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ detail: "ไม่พบ endpoint นี้" }),
  );

  // auth เปิดสาธารณะ (ยกเว้น /me) ส่วนอีกสองตัวบังคับล็อกอินทั้ง plugin
  await app.register(authController);
  await app.register(receiptsController);
  await app.register(transactionsController);

  /** ไม่คืนค่า key ใดๆ — บอกแค่ว่าตั้งไว้แล้วหรือยัง */
  app.get("/api/health", async () => ({
    status: "ok",
    vision_model: settings.kkuVisionModel,
    ai_configured: Boolean(settings.kkuApiKey),
    ocr_configured: Boolean(settings.googleVisionApiKey),
  }));

  return app;
}
