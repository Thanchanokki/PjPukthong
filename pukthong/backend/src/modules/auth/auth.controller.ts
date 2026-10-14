/**
 * endpoint ของบัญชีผู้ใช้ — หน้าที่เดียวคือ parse body, เรียก service, แปลงผลเป็น JSON
 *
 * เปิดสาธารณะทั้งหมดยกเว้น /me จึงใส่ requireAuth ทีละ route ไม่ใช่ทั้ง plugin
 */
import type { FastifyInstance } from "fastify";

import { httpError } from "../../shared/errors.js";
import { readImageUpload } from "../../shared/upload.js";
import { zodMessage } from "../../shared/zod.js";
import { loginSchema, registerSchema, updateProfileSchema } from "./auth.schema.js";
import { requireAuth, requireAuthAllowQueryToken } from "./auth.security.js";
import { userOut } from "./auth.serializer.js";
import * as service from "./auth.service.js";

export default async function authController(app: FastifyInstance) {
  app.post("/api/auth/register", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw httpError(422, zodMessage(parsed.error));

    const { token, user } = await service.register(parsed.data);
    return reply.code(201).send({ token, user: userOut(user, token) });
  });

  app.post("/api/auth/login", async (req) => {
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw httpError(422, zodMessage(parsed.error));

    const { token, user } = await service.login(parsed.data);
    return { token, user: userOut(user, token) };
  });

  /** frontend เรียกตอนเปิดแอป เพื่อดูว่า token ที่เก็บไว้ยังใช้ได้ไหม */
  app.get("/api/auth/me", { preHandler: requireAuth }, async (req) =>
    userOut(await service.getById(req.userId), req.authToken),
  );

  /** แก้ชื่อ/อีเมลของตัวเอง — แก้ได้เฉพาะบัญชีเจ้าของ token เท่านั้น ไม่มี id ใน path */
  app.patch("/api/auth/me", { preHandler: requireAuth }, async (req) => {
    const parsed = updateProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw httpError(400, zodMessage(parsed.error));

    return userOut(await service.updateProfile(req.userId, parsed.data), req.authToken);
  });

  /** อัปโหลดรูปโปรไฟล์ (multipart field "file") — เขียนทับรูปเดิม */
  app.post("/api/auth/me/avatar", { preHandler: requireAuth }, async (req) => {
    const raw = await readImageUpload(req);
    return userOut(await service.setAvatar(req.userId, raw), req.authToken);
  });

  /**
   * คืนรูปโปรไฟล์ — avatar_url ชี้มาที่นี่ รับ token ทาง ?token= ได้เพราะ
   * frontend ใส่ URL ลง <img src> ตรงๆ
   *
   * cache ได้นานเพราะ URL มี ?v= ที่เปลี่ยนทุกครั้งที่อัปรูปใหม่
   */
  app.get(
    "/api/auth/me/avatar",
    { preHandler: requireAuthAllowQueryToken },
    async (req, reply) => {
      const data = await service.readAvatar(req.userId);
      return reply
        .type("image/jpeg")
        .header("Cache-Control", "private, max-age=86400")
        .send(data);
    },
  );
}
