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

  app.get<{ Querystring: { month?: string } }>("/api/transactions", async (req) => {
    const month = req.query.month;
    if (!month) throw httpError(422, "ต้องระบุพารามิเตอร์ month เช่น ?month=2026-08");

    const { rows, ...summary } = await service.monthlySummary(req.userId, month);
    return {
      ...summary,
      // รายการย่อยฝังมากับ document อยู่แล้ว จึงไม่มีปัญหา N+1 เหมือนตอนใช้ตารางแยก
      transactions: rows.map(transactionOut),
    };
  });
}
