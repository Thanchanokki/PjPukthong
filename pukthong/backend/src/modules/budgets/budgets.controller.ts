/**
 * endpoint ของงบประมาณ — หน้างบและการ์ดงบในหน้าหลักใช้ชุดนี้
 *
 * ทุก route รับ ?by=merchant เพื่อทำงานกับงบ "ตามประเภทร้าน"
 * ไม่ส่ง = งบ "ตามหมวดสินค้า" (ค่าเดิม)
 */
import type { FastifyInstance } from "fastify";

import { httpError } from "../../shared/errors.js";
import { requireAuth } from "../auth/auth.security.js";
import * as service from "./budgets.service.js";

type Params = { month: string; categoryId: string };
type Query = { by?: string };

export default async function budgetsController(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get<{ Querystring: Query & { month?: string } }>("/api/budgets", async (req) =>
    service.getBudget(
      req.userId,
      service.requireMonth(req.query.month),
      service.toAxis(req.query.by),
    ),
  );

  app.put<{ Params: Params; Querystring: Query; Body: { limit?: unknown } }>(
    "/api/budgets/:month/:categoryId",
    async (req, reply) => {
      await service.setLimit(
        req.userId,
        req.params.month,
        service.toAxis(req.query.by),
        req.params.categoryId,
        req.body?.limit,
      );
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: Params; Querystring: Query }>(
    "/api/budgets/:month/:categoryId",
    async (req, reply) => {
      await service.removeLimit(
        req.userId,
        req.params.month,
        service.toAxis(req.query.by),
        req.params.categoryId,
      );
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { month: string }; Querystring: Query; Body: { from_month?: string } }>(
    "/api/budgets/:month/copy",
    async (req, reply) => {
      const from = req.body?.from_month;
      if (!from) throw httpError(422, "ต้องระบุ from_month");
      await service.copyBudget(req.userId, service.toAxis(req.query.by), from, req.params.month);
      return reply.code(204).send();
    },
  );
}
