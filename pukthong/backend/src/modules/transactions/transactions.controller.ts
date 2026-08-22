/**
 * endpoint ของรายการรับ-จ่าย — parse body, เรียก service, แปลงผลเป็น JSON
 */
import type { FastifyInstance } from "fastify";

import { httpError, requireUuid } from "../../shared/errors.js";
import { zodMessage } from "../../shared/zod.js";
import { requireAuth } from "../auth/auth.security.js";
import { transactionCreateSchema, type TransactionCreate } from "./transactions.schema.js";
import { transactionOut } from "./transactions.serializer.js";
import * as service from "./transactions.service.js";

function parseBody(body: unknown): TransactionCreate {
  const parsed = transactionCreateSchema.safeParse(body ?? {});
  if (!parsed.success) throw httpError(422, zodMessage(parsed.error));
  return parsed.data;
}

export default async function transactionsController(app: FastifyInstance) {
  // ครอบทุก route ใน plugin นี้ — Fastify แยก scope ต่อ plugin จึงไม่กระทบ /api/health
  app.addHook("preHandler", requireAuth);

  app.post("/api/transactions", async (req, reply) => {
    const doc = await service.create(req.userId, parseBody(req.body));
    return reply.code(201).send(transactionOut(doc));
  });

  /**
   * ประกาศก่อน /:txId เพื่อให้อ่านโค้ดแล้วเห็นชัดว่าไม่ได้ตั้งใจให้ตกไปเป็น txId
   * (Fastify ให้ route ที่เป็นข้อความตายตัวชนะ parametric อยู่แล้ว ไม่ได้พึ่งลำดับ)
   */
  app.get<{ Querystring: { by?: string } }>(
    "/api/transactions/months",
    async (req) =>
      service.availableMonths(
        req.userId,
        req.query.by === "uploaded" ? "uploaded" : "purchased",
      ),
  );

  app.get<{ Params: { txId: string } }>("/api/transactions/:txId", async (req) => {
    const id = requireUuid(req.params.txId, "tx_id");
    return transactionOut(await service.findOwned(req.userId, id));
  });

  app.put<{ Params: { txId: string } }>("/api/transactions/:txId", async (req) => {
    const id = requireUuid(req.params.txId, "tx_id");
    const doc = await service.update(req.userId, id, parseBody(req.body));
    return transactionOut(doc);
  });

  app.delete<{ Params: { txId: string } }>(
    "/api/transactions/:txId",
    async (req, reply) => {
      await service.remove(req.userId, requireUuid(req.params.txId, "tx_id"));
      return reply.code(204).send();
    },
  );

  app.get<{ Querystring: { month?: string; by?: string } }>(
    "/api/transactions",
    async (req) => {
    const month = req.query.month;
    if (!month) throw httpError(422, "ต้องระบุพารามิเตอร์ month เช่น ?month=2026-08");

    /**
     * ?by=uploaded ให้ "เดือน" หมายถึงเดือนที่สแกนเข้าระบบ (มุมมอง feed/audit)
     * ค่าเริ่มต้น purchased = เดือนที่ซื้อของ ซึ่งเป็นมุมมองการเงิน
     *
     * เปลี่ยนทั้งการกรองและการเรียง ไม่ใช่แค่การเรียง — ไม่งั้นใบที่ซื้อปีก่อนแต่เพิ่ง
     * สแกนเดือนนี้จะไม่โผล่ในมุมมอง "สแกนเดือนนี้" เลย
     */
    const axis = req.query.by === "uploaded" ? "uploaded" : "purchased";
    const { rows, ...summary } = await service.monthlySummary(req.userId, month, axis);
    return {
      ...summary,
      // รายการย่อยฝังมากับ document อยู่แล้ว จึงไม่มีปัญหา N+1 เหมือนตอนใช้ตารางแยก
      transactions: rows.map(transactionOut),
    };
    },
  );
}
