/**
 * endpoint ของหมวดค่าใช้จ่าย — frontend ใช้รายการนี้ทั้งดรอปดาวน์ หน้างบ และหน้าจัดการหมวด
 */
import type { FastifyInstance } from "fastify";
import type { z } from "zod";

import type { CategoryDoc } from "../../db/models.js";
import { httpError } from "../../shared/errors.js";
import { zodMessage } from "../../shared/zod.js";
import { requireAuth } from "../auth/auth.security.js";
import { categoryCreateSchema, categoryUpdateSchema } from "./categories.schema.js";
import * as service from "./categories.service.js";

export function categoryOut(c: CategoryDoc) {
  return {
    id: c._id,
    name: c.name,
    parent_id: c.parentId,
    icon: c.icon,
    color: c.color,
    sort_order: c.sortOrder,
    is_active: c.isActive,
    /** หมวดกลางของระบบ — frontend ใช้ซ่อนปุ่มแก้ไข/ซ่อน */
    is_system: c.userId === null,
  };
}

/** หมวดกลางใช้ slug ("food") ส่วนหมวดของผู้ใช้ใช้ UUID */
function requireCategoryId(value: string): string {
  if (!/^[a-z_]{1,32}$|^[0-9a-f-]{36}$/i.test(value)) {
    throw httpError(422, "category_id ไม่ถูกต้อง");
  }
  return value;
}

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw httpError(422, zodMessage(parsed.error));
  return parsed.data;
}

export default async function categoriesController(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  /** ?include_inactive=1 ใช้ในหน้าจัดการหมวด ให้เห็นหมวดที่ซ่อนไว้และเปิดกลับได้ */
  app.get<{ Querystring: { include_inactive?: string } }>("/api/categories", async (req) => {
    const book = await service.loadBook(req.userId);
    const all = req.query.include_inactive === "1";
    return (all ? book.all : book.active).map(categoryOut);
  });

  app.post("/api/categories", async (req, reply) => {
    const doc = await service.create(req.userId, parse(categoryCreateSchema, req.body));
    return reply.code(201).send(categoryOut(doc));
  });

  app.patch<{ Params: { id: string } }>("/api/categories/:id", async (req) => {
    const id = requireCategoryId(req.params.id);
    const doc = await service.update(req.userId, id, parse(categoryUpdateSchema, req.body));
    return categoryOut(doc);
  });

  app.delete<{ Params: { id: string } }>("/api/categories/:id", async (req, reply) => {
    await service.hide(req.userId, requireCategoryId(req.params.id));
    return reply.code(204).send();
  });
}
