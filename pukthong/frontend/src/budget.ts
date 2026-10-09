/**
 * ข้อมูลงบประมาณ — ตอนนี้เป็น "ข้อมูลจำลอง" ทั้งหมด ยังไม่ต่อ backend
 *
 * ตอนต่อของจริง: เขียนฟังก์ชันชุดนี้ใหม่ให้ fetch ไป API แบบเดียวกับใน api.ts
 * (ใช้ handle() + authHeaders()) โดยคง signature เดิมไว้ — BudgetPage ไม่ต้องแก้เลย
 *
 * ยอด spent ฝั่ง backend ควรคิดจากสรุปชุดเดียวกับ Monthly.by_category (หมวดรายชิ้น
 * แกน purchased) เพื่อให้ตัวเลขหน้านี้ตรงกับหน้ารายงานเสมอ
 *
 * ⚠️ store เก็บใน memory — refresh หน้าแล้วงบที่แก้ไว้จะกลับเป็นค่าตั้งต้น
 */

export type BudgetLine = {
  category: string;
  /** null = หมวดนี้มีรายจ่ายในเดือนนั้น แต่ยังไม่ได้ตั้งงบ */
  limit: string | null;
  spent: string;
  /** จำนวนชิ้นของในหมวดนี้ (นับแบบเดียวกับ by_category.count) */
  count: number;
};

export type Budget = {
  month: string;
  lines: BudgetLine[];
};

/** รายชื่อหมวดให้เลือกตอนตั้งงบใหม่ — ปรับให้ตรงกับหมวดที่ backend ใช้จริง */
export const CATEGORIES = [
  "อาหารและเครื่องดื่ม",
  "ของใช้ในบ้าน",
  "เดินทาง",
  "สุขภาพ",
  "ช้อปปิ้ง",
  "การศึกษา",
  "บันเทิง",
  "อื่นๆ",
];

// ---------------------------------------------------------------- mock

const MOCK_SPENT: Record<string, { spent: number; count: number }> = {
  "อาหารและเครื่องดื่ม": { spent: 6840.5, count: 42 },
  "ของใช้ในบ้าน": { spent: 2310, count: 15 },
  "เดินทาง": { spent: 1985.75, count: 11 },
  "สุขภาพ": { spent: 1250, count: 4 },
  "ช้อปปิ้ง": { spent: 3420, count: 6 },
  "อื่นๆ": { spent: 480, count: 3 },
};

const DEFAULT_LIMITS: Record<string, number> = {
  "อาหารและเครื่องดื่ม": 8000,
  "ของใช้ในบ้าน": 2500,
  "เดินทาง": 3000,
  "ช้อปปิ้ง": 3000,
};

const store = new Map<string, Record<string, number>>();

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

/** เวลาท้องถิ่น ไม่ใช่ toISOString() (UTC) — ไม่งั้นช่วงเช้ามืดเวลาไทยจะได้เดือนก่อนหน้า */
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** เดือนในอนาคตเริ่มแบบว่าง เพื่อให้ลองหน้าตา "ยังไม่ได้ตั้งงบ" ได้ */
function limitsFor(month: string) {
  let limits = store.get(month);
  if (!limits) {
    limits = month <= currentMonth() ? { ...DEFAULT_LIMITS } : {};
    store.set(month, limits);
  }
  return limits;
}

/** ให้แต่ละเดือนได้ยอดไม่เท่ากัน สลับเดือนแล้วดูสมจริงขึ้น */
function spentFor(month: string) {
  if (month > currentMonth()) return {} as typeof MOCK_SPENT;
  const m = Number(month.slice(5, 7)) || 1;
  const scale = 0.7 + ((m * 37) % 50) / 100;
  const out: typeof MOCK_SPENT = {};
  for (const [category, { spent, count }] of Object.entries(MOCK_SPENT)) {
    out[category] = {
      spent: Math.round(spent * scale * 100) / 100,
      count: Math.max(1, Math.round(count * scale)),
    };
  }
  return out;
}

// ---------------------------------------------------------------- API (mock)

export async function fetchBudget(month: string): Promise<Budget> {
  await delay();
  const limits = limitsFor(month);
  const spent = spentFor(month);
  const categories = Array.from(
    new Set([...Object.keys(limits), ...Object.keys(spent)]),
  );
  return {
    month,
    lines: categories.map((category) => ({
      category,
      limit: category in limits ? limits[category].toFixed(2) : null,
      spent: (spent[category]?.spent ?? 0).toFixed(2),
      count: spent[category]?.count ?? 0,
    })),
  };
}

export async function saveBudgetLimit(
  month: string,
  category: string,
  limit: number,
): Promise<void> {
  await delay();
  if (!(limit > 0)) throw new Error("วงเงินต้องมากกว่า 0 บาท");
  limitsFor(month)[category] = limit;
}

export async function removeBudgetLimit(month: string, category: string): Promise<void> {
  await delay();
  delete limitsFor(month)[category];
}

/** ใช้งบชุดเดียวกับเดือนอื่น — ทับงบที่มีอยู่ของเดือนปลายทางทั้งหมด */
export async function copyBudget(fromMonth: string, toMonth: string): Promise<void> {
  await delay();
  const source = limitsFor(fromMonth);
  if (Object.keys(source).length === 0) {
    throw new Error("เดือนก่อนหน้ายังไม่ได้ตั้งงบไว้ ลองตั้งงบทีละหมวดแทน");
  }
  store.set(toMonth, { ...source });
}