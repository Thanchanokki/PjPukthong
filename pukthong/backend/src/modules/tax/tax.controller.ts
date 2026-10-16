/** endpoint สรุปสิทธิลดหย่อนภาษี — ตอนนี้มีเฉพาะเบี้ยประกัน */
import type { FastifyInstance } from "fastify";

import { requireAuth } from "../auth/auth.security.js";
import * as service from "./tax.service.js";

export default async function taxController(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  /** ?year=2026 (ค.ศ.) — ไม่ส่ง = ปีปัจจุบัน */
  app.get<{ Querystring: { year?: string } }>("/api/tax/insurance", async (req) =>
    service.insuranceSummary(req.userId, Number(req.query.year ?? new Date().getFullYear())),
  );
}
