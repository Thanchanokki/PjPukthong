/**
 * endpoint ของบัญชีผู้ใช้ — หน้าที่เดียวคือ parse body, เรียก service, แปลงผลเป็น JSON
 *
 * เปิดสาธารณะทั้งหมดยกเว้น /me จึงใส่ requireAuth ทีละ route ไม่ใช่ทั้ง plugin
 */
import type { FastifyInstance } from "fastify";

import { httpError } from "../../shared/errors.js";
import { zodMessage } from "../../shared/zod.js";
import { loginSchema, registerSchema } from "./auth.schema.js";
import { requireAuth } from "./auth.security.js";
import { userOut } from "./auth.serializer.js";
import * as service from "./auth.service.js";

export default async function authController(app: FastifyInstance) {
  app.post("/api/auth/register", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw httpError(422, zodMessage(parsed.error));

    const { token, user } = await service.register(parsed.data);
    return reply.code(201).send({ token, user: userOut(user) });
  });

  app.post("/api/auth/login", async (req) => {
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw httpError(422, zodMessage(parsed.error));

    const { token, user } = await service.login(parsed.data);
    return { token, user: userOut(user) };
  });

  /** frontend เรียกตอนเปิดแอป เพื่อดูว่า token ที่เก็บไว้ยังใช้ได้ไหม */
  app.get("/api/auth/me", { preHandler: requireAuth }, async (req) =>
    userOut(await service.getById(req.userId)),
  );
}
