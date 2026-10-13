/**
 * หมวดค่าใช้จ่าย: seed หมวดกลาง, โหลดหมวดที่ผู้ใช้เห็น, สร้าง/แก้/ซ่อนหมวดของผู้ใช้
 *
 * ผู้ใช้หนึ่งคนเห็น "หมวดกลาง (userId = null) + หมวดของตัวเอง" เสมอ
 * หมวดกลางแก้ไม่ได้ผ่าน API — แก้ที่ shared/categories.ts แล้วบูตใหม่
 */
import { randomUUID } from "node:crypto";

import { categories } from "../../db/client.js";
import type { CategoryDoc } from "../../db/models.js";
import { FALLBACK_ID, SYSTEM_CATEGORIES, matchCategory } from "../../shared/categories.js";
import { httpError } from "../../shared/errors.js";
import type { CategoryCreate, CategoryUpdate } from "./categories.schema.js";

/** หมวดของผู้ใช้เรียงต่อท้ายหมวดกลางเสมอ — เว้นช่องไว้เผื่อหมวดกลางเพิ่มในอนาคต */
const USER_SORT_BASE = 100;

/** upsert หมวดกลางให้ตรงกับโค้ด — เรียกตอนบูต ซ้ำได้ไม่มีผลข้างเคียง */
export async function ensureSystemCategories(): Promise<void> {
  const now = new Date();
  await categories.bulkWrite(
    SYSTEM_CATEGORIES.map((c, i) => ({
      updateOne: {
        filter: { _id: c.id },
        update: {
          $set: {
            userId: null,
            name: c.name,
            parentId: null,
            icon: c.icon,
            color: c.color,
            sortOrder: i,
            isActive: true,
            aliases: c.aliases,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    })),
  );
}

/**
 * สมุดหมวดของผู้ใช้หนึ่งคน — โหลดครั้งเดียวต่อ request แล้วใช้เปิดหาชื่อ/จับคู่/รวมยอด
 *
 * เก็บหมวดที่ซ่อนไว้ด้วย เพราะรายการเก่ายังชี้หมวดที่ถูกซ่อนอยู่และต้องแสดงชื่อได้
 * แต่การ "เลือกหมวดใหม่" (match, isSelectable) ใช้ได้เฉพาะหมวดที่ยังเปิดอยู่
 */
export class CategoryBook {
  private readonly byId: Map<string, CategoryDoc>;

  constructor(readonly all: CategoryDoc[]) {
    this.byId = new Map(all.map((c) => [c._id, c]));
  }

  get active(): CategoryDoc[] {
    return this.all.filter((c) => c.isActive);
  }

  get(id: string | null | undefined): CategoryDoc | undefined {
    return id ? this.byId.get(id) : undefined;
  }

  nameOf(id: string | null | undefined): string | null {
    return this.get(id)?.name ?? null;
  }

  /** หมวดหลักของหมวดนี้ (ตัวเองถ้าเป็นหมวดหลักอยู่แล้ว) — id ที่ไม่รู้จักตกไป FALLBACK */
  rootOf(id: string | null | undefined): CategoryDoc {
    const c = this.get(id) ?? this.byId.get(FALLBACK_ID)!;
    return (c.parentId && this.byId.get(c.parentId)) || c;
  }

  isSelectable(id: string): boolean {
    return this.get(id)?.isActive === true;
  }

  /** ชื่อ/alias/id -> id ของหมวดที่เปิดอยู่ (null ถ้าจับคู่ไม่ได้) */
  match(value: unknown): string | null {
    return matchCategory(
      value,
      this.active.map((c) => ({ id: c._id, name: c.name, aliases: c.aliases ?? [] })),
    );
  }

  /** รายชื่อหมวดสำหรับแปะลง prompt ของ AI — หมวดย่อยแสดงเป็น "หลัก > ย่อย" */
  promptList(): string {
    return this.active
      .map((c) => {
        const parent = c.parentId ? this.get(c.parentId) : undefined;
        return parent ? `${parent.name} > ${c.name}` : c.name;
      })
      .join(" | ");
  }
}

export async function loadBook(userId: string): Promise<CategoryBook> {
  const docs = await categories
    .find({ userId: { $in: [null, userId] } })
    .sort({ sortOrder: 1, createdAt: 1 })
    .toArray();
  return new CategoryBook(docs);
}

const sameName = (a: string, b: string) =>
  a.replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase();

/** ชื่อซ้ำกับหมวดที่เปิดอยู่ = dashboard จะมีสองแท่งชื่อเดียวกัน ผู้ใช้แยกไม่ออก */
function assertNameFree(book: CategoryBook, name: string, exceptId?: string) {
  const clash = book.active.find((c) => c._id !== exceptId && sameName(c.name, name));
  if (clash) throw httpError(409, `มีหมวด "${clash.name}" อยู่แล้ว`);
}

/** หมวดย่อยลึกได้ชั้นเดียว — แม่ต้องเป็นหมวดหลักที่เปิดอยู่ */
function assertParent(book: CategoryBook, parentId: string, selfId?: string) {
  if (parentId === selfId) throw httpError(422, "หมวดเป็นหมวดย่อยของตัวเองไม่ได้");
  const parent = book.get(parentId);
  if (!parent || !parent.isActive) throw httpError(422, "ไม่พบหมวดหลักที่เลือก");
  if (parent.parentId) throw httpError(422, "หมวดย่อยซ้อนกันได้ชั้นเดียว");
}

export async function create(userId: string, input: CategoryCreate): Promise<CategoryDoc> {
  const book = await loadBook(userId);
  assertNameFree(book, input.name);
  if (input.parent_id) assertParent(book, input.parent_id);

  const mine = book.all.filter((c) => c.userId === userId);
  const now = new Date();
  const doc: CategoryDoc = {
    _id: randomUUID(),
    userId,
    name: input.name,
    parentId: input.parent_id ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    sortOrder: USER_SORT_BASE + mine.length,
    isActive: true,
    aliases: [],
    createdAt: now,
    updatedAt: now,
  };
  await categories.insertOne(doc);
  return doc;
}

/** หมวดกลางตอบ 403 (มองเห็นแต่แก้ไม่ได้) ส่วนหมวดของคนอื่นตอบ 404 เหมือนไม่มีอยู่จริง */
function ownedOrThrow(book: CategoryBook, userId: string, id: string): CategoryDoc {
  const doc = book.get(id);
  if (!doc) throw httpError(404, "ไม่พบหมวดนี้");
  if (doc.userId !== userId) throw httpError(403, "หมวดกลางของระบบแก้ไขหรือซ่อนไม่ได้");
  return doc;
}

export async function update(
  userId: string,
  id: string,
  patch: CategoryUpdate,
): Promise<CategoryDoc> {
  const book = await loadBook(userId);
  const doc = ownedOrThrow(book, userId, id);
  const children = book.all.filter((c) => c.parentId === id && c.isActive);

  const next = { ...doc };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.color !== undefined) next.color = patch.color;
  if (patch.sort_order !== undefined) next.sortOrder = USER_SORT_BASE + patch.sort_order;
  if (patch.parent_id !== undefined) {
    if (patch.parent_id) {
      assertParent(book, patch.parent_id, id);
      if (children.length > 0) {
        throw httpError(422, "หมวดนี้มีหมวดย่อยอยู่ จึงย้ายไปเป็นหมวดย่อยไม่ได้");
      }
    }
    next.parentId = patch.parent_id;
  }
  if (patch.is_active !== undefined) {
    if (!patch.is_active && children.length > 0) {
      throw httpError(422, "ซ่อนหมวดย่อยทั้งหมดก่อน แล้วค่อยซ่อนหมวดหลัก");
    }
    if (patch.is_active && next.parentId && !book.get(next.parentId)?.isActive) {
      throw httpError(422, "เปิดหมวดหลักก่อน แล้วค่อยเปิดหมวดย่อย");
    }
    next.isActive = patch.is_active;
  }
  // เช็คชื่อซ้ำตอนจบ เพราะการเปิดหมวดที่ซ่อนไว้ก็ทำให้ชื่อชนได้เหมือนการเปลี่ยนชื่อ
  if (next.isActive) assertNameFree(book, next.name, id);

  next.updatedAt = new Date();
  await categories.replaceOne({ _id: id, userId }, next);
  return next;
}

/** "ลบ" = ซ่อน — รายการเก่าที่อยู่ในหมวดนี้ยังแสดงชื่อเดิมได้ และเปิดกลับมาได้ */
export async function hide(userId: string, id: string): Promise<void> {
  await update(userId, id, { is_active: false });
}
