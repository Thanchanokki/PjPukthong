/**
 * งบประมาณ — ต่อ backend จริง (/api/budgets)
 *
 * วงเงินเก็บใน MongoDB collection `budgets` ส่วนยอด spent คำนวณสดที่ backend มีสองแกน:
 * - "merchant" = "ประเภทร้าน" — ยอดทั้งใบเข้าประเภทของร้าน (7-Eleven = ร้านสะดวกซื้อ)
 * - "item"     = "หมวดของ" — หมวดสินค้ารายชิ้น ชุดเดียวกับหน้ารายงาน ตัวเลขจึงตรงกันเสมอ
 * งบของสองแกนแยกกันคนละชุด ตั้งงบแกนหนึ่งไม่กระทบอีกแกน
 */
import { API_BASE, authHeaders, handle } from "./api";

export type BudgetAxis = "merchant" | "item";

/** ชื่อแกนที่ผู้ใช้เห็น — ใช้คำเดียวกันทุกหน้า (หน้างบ, หน้าตั้งงบ, ป๊อปอัพเตือน) */
export const AXIS_LABEL: Record<BudgetAxis, string> = { item: "หมวดของ", merchant: "ประเภทร้าน" };

export type BudgetLine = {
  /** id ของหมวดสินค้า หรือ id ของประเภทร้าน (ตามแกน) */
  category_id: string;
  /** ชื่อไว้แสดงผล — ใช้ category_id ทุกครั้งที่ส่งกลับไป backend */
  category: string;
  icon: string | null;
  color: string | null;
  /** null = มีรายจ่ายในเดือนนั้น แต่ยังไม่ได้ตั้งงบ */
  limit: string | null;
  /** ใช้ทุกเดือน — เดือนถัดไปที่ยังไม่ได้ตั้งงบหมวดนี้จะใช้วงเงินนี้ต่อ */
  recurring: boolean;
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

/** prefix ของ key ใน sessionStorage ที่จำว่าป๊อปอัพเตือนงบเด้งไปแล้ว — auth.tsx ล้างตอนออกจากระบบ */
export const BUDGET_ALERT_KEY = "budget-alert:";

/** ชื่อสั้นของประเภทร้านให้พอดีการ์ด/แถบงบ — ชื่อเต็มยาวเกิน ("ร้านเครื่องสำอางและของใช้ส่วนตัว") */
const SHORT_NAME: Record<string, string> = {
  convenience: "สะดวกซื้อ",
  supermarket: "ซูเปอร์มาร์เก็ต",
  restaurant: "อาหาร / คาเฟ่",
  pharmacy: "ยา / คลินิก",
  beauty_personal: "ของใช้ส่วนตัว",
  department_fashion: "ห้าง / แฟชั่น",
  home_hardware: "ของใช้ในบ้าน",
  fuel_transport: "น้ำมัน / เดินทาง",
  bills_services: "บิล / บริการ",
  general_other: "อื่น ๆ",
};

/** ชื่อที่แสดงของบรรทัดงบ — แกนประเภทร้านใช้ชื่อสั้น แกนหมวดสินค้าใช้ชื่อหมวดตามเดิม */
export const budgetName = (axis: BudgetAxis, id: string, name: string) =>
  (axis === "merchant" && SHORT_NAME[id]) || name;

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
  /** ไม่ส่ง = คงค่า "ใช้ทุกเดือน" เดิมของหมวดนี้ */
  recurring?: boolean,
): Promise<void> {
  if (!(limit > 0)) throw new Error("วงเงินต้องมากกว่า 0 บาท");
  return handle(
    await fetch(`${API_BASE}/api/budgets/${month}/${categoryId}?${q(axis)}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ limit: limit.toFixed(2), recurring }),
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
