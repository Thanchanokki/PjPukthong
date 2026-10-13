/**
 * งบประมาณ — ต่อ backend จริง (/api/budgets)
 *
 * วงเงินเก็บใน MongoDB collection `budgets` ส่วนยอด spent คำนวณสดที่ backend มีสองแกน:
 * - "merchant" = ตามประเภทร้าน — ยอดทั้งใบเข้าประเภทของร้าน (7-Eleven = ร้านสะดวกซื้อ)
 * - "item"     = ตามหมวดสินค้ารายชิ้น — ชุดเดียวกับหน้ารายงาน ตัวเลขจึงตรงกันเสมอ
 * งบของสองแกนแยกกันคนละชุด ตั้งงบแกนหนึ่งไม่กระทบอีกแกน
 */
import { API_BASE, authHeaders, handle } from "./api";

export type BudgetAxis = "merchant" | "item";

export type BudgetLine = {
  /** id ของหมวดสินค้า หรือ id ของประเภทร้าน (ตามแกน) */
  category_id: string;
  /** ชื่อไว้แสดงผล — ใช้ category_id ทุกครั้งที่ส่งกลับไป backend */
  category: string;
  icon: string | null;
  color: string | null;
  /** null = มีรายจ่ายในเดือนนั้น แต่ยังไม่ได้ตั้งงบ */
  limit: string | null;
  spent: string;
  /** จำนวนรายการสินค้าในหมวดนี้ (ทั้งสองแกน) */
  count: number;
};

/** สิ่งที่ตั้งงบได้ในแกนนั้น (หมวดหลักทั้งหมด หรือประเภทร้านทั้งหมด) */
export type BudgetOption = { id: string; name: string; icon: string | null; color: string | null };

export type Budget = {
  month: string;
  axis: BudgetAxis;
  lines: BudgetLine[];
  options: BudgetOption[];
};

const q = (axis: BudgetAxis) => (axis === "merchant" ? "by=merchant" : "by=item");

export async function fetchBudget(month: string, axis: BudgetAxis = "merchant"): Promise<Budget> {
  return handle(
    await fetch(`${API_BASE}/api/budgets?month=${month}&${q(axis)}`, { headers: authHeaders() }),
  );
}

export async function saveBudgetLimit(
  month: string,
  axis: BudgetAxis,
  categoryId: string,
  limit: number,
): Promise<void> {
  if (!(limit > 0)) throw new Error("วงเงินต้องมากกว่า 0 บาท");
  return handle(
    await fetch(`${API_BASE}/api/budgets/${month}/${categoryId}?${q(axis)}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ limit: limit.toFixed(2) }),
    }),
  );
}

export async function removeBudgetLimit(
  month: string,
  axis: BudgetAxis,
  categoryId: string,
): Promise<void> {
  return handle(
    await fetch(`${API_BASE}/api/budgets/${month}/${categoryId}?${q(axis)}`, {
      method: "DELETE",
      headers: authHeaders(),
    }),
  );
}

/** ใช้งบชุดเดียวกับเดือนอื่น (แกนเดียวกัน) — ทับงบที่มีอยู่ของเดือนปลายทางทั้งหมด */
export async function copyBudget(
  axis: BudgetAxis,
  fromMonth: string,
  toMonth: string,
): Promise<void> {
  return handle(
    await fetch(`${API_BASE}/api/budgets/${toMonth}/copy?${q(axis)}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ from_month: fromMonth }),
    }),
  );
}
