// ทุก request วิ่งผ่าน backend ของเราเสมอ — frontend ไม่เคยถือ KKU_API_KEY

/**
 * ที่อยู่ backend — ค่าว่าง = origin เดียวกับหน้าเว็บ ถ้าไม่ได้ตั้ง VITE_API_BASE ไว้
 *
 * vite proxy ส่ง /api ต่อให้ backend (ดู vite.config.ts) จึงถูกเสมอทั้งตอนเปิด
 * localhost:3000, เปิด 192.168.x.x:3000 จากมือถือใน LAN และเปิดผ่าน tunnel
 * จากเน็ตมือถือ — ห้ามใส่ "localhost" ตรงนี้ เพราะบนมือถือมันคือตัวมือถือเอง
 */
export const API_BASE = import.meta.env.VITE_API_BASE || "";

/**
 * JWT เก็บใน localStorage เพื่อให้ยังล็อกอินค้างหลังปิดแท็บ
 * (ฝั่งที่ทำ login/register เดิมก็ใช้ที่เดียวกัน แต่แนบ token ผ่าน axios interceptor
 * ส่วนไฟล์นี้ใช้ fetch ล้วน จึงเติม header เองใน authHeaders())
 */
export const TOKEN_KEY = "pukthong_token";

/**
 * ยิงเมื่อ backend ตอบ 401 — auth.tsx ฟังแล้วพาออกจากระบบให้
 *
 * ใช้ event แทนการ import ฟังก์ชันจาก auth.tsx เพราะไฟล์นี้เป็นชั้นล่างสุด
 * ถ้า import ขึ้นไปจะเกิด circular import (auth.tsx import api.ts อยู่แล้ว)
 */
export const UNAUTHORIZED_EVENT = "pukthong:unauthorized";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/** ไม่มี token = ไม่ส่ง header เปล่าๆ ไป ปล่อยให้ backend ตอบ 401 ตามปกติ */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  currency: string;
  role: string;
};

export type AuthResult = { token: string; user: AuthUser };

export type LineItem = {
  qty: string | null;
  name: string | null;
  unit_price: string | null;
  amount: string | null;
  flag: string | null;
  /** id ของหมวดที่ AI เดาให้ตอนสแกน — เป็นค่าตั้งต้นของ category_id */
  category_guess?: string | null;
  /** id ของหมวดที่ผู้ใช้ยืนยัน — ตัวนี้เท่านั้นที่ถูกบันทึกและใช้สรุปใน dashboard */
  category_id?: string | null;
  /** ชื่อหมวด (backend ส่งมาให้แสดงผล อ่านอย่างเดียว) */
  category?: string | null;
  /** ชื่อหมวดหลักที่ใช้จัดกลุ่มในรายงาน — หมวดย่อยรวมขึ้นไปที่แม่ (อ่านอย่างเดียว) */
  category_root?: string;
};

/** หมวดค่าใช้จ่าย — หมวดกลางของระบบ (is_system) + หมวดที่ผู้ใช้สร้างเอง */
export type Category = {
  id: string;
  name: string;
  /** หมวดย่อยชี้ไปหมวดหลัก (ลึกได้ชั้นเดียว) */
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
};

/** ประเภทร้าน — ชุดตายตัวของระบบ ใช้แยกใบเสร็จทั้งใบตามร้าน (คนละแกนกับหมวดสินค้า) */
export type MerchantType = { id: string; name: string; icon: string };

export async function fetchMerchantTypes(): Promise<MerchantType[]> {
  return handle(await fetch(`${API_BASE}/api/merchant-types`, { headers: authHeaders() }));
}

export type CategoryInput = {
  name?: string;
  parent_id?: string | null;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
};

export type ReceiptDraft = {
  document_type: string | null;
  merchant_name: string | null;
  /** id ประเภทร้านที่ AI เดา — null = ตอบนอกรายการ */
  merchant_type: string | null;
  branch: string | null;
  merchant_tax_id: string | null;
  doc_number: string | null;
  issued_at: string | null;
  issued_time: string | null;
  currency: string;
  line_items: LineItem[];
  line_items_complete: boolean;
  item_count_printed: number | null;
  subtotal: string | null;
  discount: string | null;
  service_charge: string | null;
  vat_rate: string | null;
  vat_amount: string | null;
  vat_included: boolean;
  total: string | null;
  payment_method: string | null;
  payment_channel: string | null;
  confidence: Record<string, number>;
  warnings: string[];
  unreadable_regions: string[];
  raw_text: string | null;
};

export type UploadResult = {
  receipt_id: string;
  duplicate: boolean;
  blurry: boolean;
  blur_score: number | null;
  /** false = ไม่ได้ทำ OCR (ปิดไว้ใน .env หรือ Cloud Vision เรียกไม่สำเร็จ) */
  has_ocr: boolean;
  /** ความมั่นใจเฉลี่ยของ OCR 0–1 — null คือไม่รู้ ไม่ใช่ศูนย์ */
  ocr_quality: number | null;
  ocr_low_quality: boolean;
  image_url: string;
};

export type ScanCheck = {
  key: string;
  label: string;
  status: "pass" | "fail" | "unknown";
  weight: number;
  detail: string;
};

/**
 * ความน่าเชื่อถือของผลสแกน — ไม่ใช่ "ความแม่นยำ" (วัดไม่ได้เพราะไม่มีเฉลยมาเทียบ)
 * คิดจากหลักฐานที่ตรวจสอบได้จริง ดู backend/src/modules/receipts/confidence.ts
 */
export type ScanConfidence = {
  score: number | null;
  level: "high" | "medium" | "low" | "unknown";
  checks: ScanCheck[];
};

/** เอกสารที่ระบบไม่รองรับ — backend ตัดสินจากผลที่ AI อ่าน (ดู receipts.support.ts) */
export type Unsupported = {
  kind: "transfer_slip" | "handwritten" | "not_receipt";
  title: string;
  message: string;
};

export type ExtractResult = {
  receipt_id: string;
  draft: ReceiptDraft;
  warnings: string[];
  ai_model: string;
  scan_confidence: ScanConfidence;
  /** null = เอกสารปกติ */
  unsupported: Unsupported | null;
};

export type Transaction = {
  id: string;
  receipt_id: string | null;
  /** เหลือไว้เพื่อความเข้ากันได้ — ตอนนี้เป็น "expense" เสมอ (ระบบรายรับถูกตัดออก) */
  direction: string;
  merchant_name: string | null;
  branch: string | null;
  merchant_tax_id: string | null;
  doc_number: string | null;
  /** วันที่บนใบเสร็จ 'YYYY-MM-DD' — ใช้สรุปยอดรายเดือน เคลมภาษี เช็คระยะประกัน */
  purchased_at: string;
  purchased_time: string | null;
  currency: string;
  subtotal: string | null;
  discount: string | null;
  service_charge: string | null;
  vat_rate: string | null;
  vat_amount: string | null;
  total: string;
  /** id ประเภทร้าน — null = ยังไม่ได้จัด (นับเป็น "ร้านอื่นๆ") */
  merchant_type: string | null;
  merchant_type_name: string;
  category_id: string | null;
  /** ชื่อหมวด — backend เปิดหาจาก category_id ให้ */
  category: string | null;
  category_root: string;
  payment_method: string | null;
  payment_channel: string | null;
  note: string | null;
  verified_by_user: boolean;
  /** เวลาที่สแกนเข้าระบบ (ISO) — ใช้เรียง feed, audit, debug ไม่เกี่ยวกับยอดรายเดือน */
  uploaded_at: string;
  created_at: string;
  items: (LineItem & { id: number; line_no: number | null })[];
};

export type Monthly = {
  month: string;
  /** แกนเวลาที่ใช้กรองเดือนนี้ — สะท้อนกลับมาให้ UI ตั้งป้ายให้ตรงความหมาย */
  axis: DateAxis;
  expense_total: string;
  transaction_count: number;
  /**
   * ยอดต่อหมวด เรียงจากมากไปน้อย — สรุปจากหมวด "รายชิ้น" ไม่ใช่หมวดของทั้งใบ
   * count คือจำนวนชิ้นของในหมวดนั้น ผลรวม total ทุกหมวด = expense_total เสมอ
   */
  by_category: {
    category_id: string;
    /** ชื่อหมวดหลัก (หมวดย่อยถูกรวมขึ้นไปที่หมวดหลักแล้ว) */
    category: string;
    icon: string | null;
    color: string | null;
    total: string;
    count: number;
  }[];
  by_day: { date: string; total: string }[];
  transactions: Transaction[];
};

export async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // token หมดอายุหรือถูกเพิกถอน — ทิ้งทันที ไม่งั้นแอปจะพยายามใช้ต่อจนกว่าจะปิดแท็บ
    if (res.status === 401) {
      /**
       * ยิง event เฉพาะตอนที่ "เคยมี token อยู่" = session หมดอายุระหว่างใช้งาน
       *
       * กรอกรหัสผ่านผิดตอนล็อกอินก็ได้ 401 เหมือนกัน แต่ตอนนั้นยังไม่มี token
       * ถ้ายิงด้วยจะไปล้าง cache ทิ้งฟรีๆ ทุกครั้งที่พิมพ์รหัสผิด
       */
      const hadToken = Boolean(getToken());
      clearToken();
      if (hadToken) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    let detail = `เกิดข้อผิดพลาด (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* ตอบกลับไม่ใช่ JSON — ใช้ข้อความ default */
    }
    throw new Error(detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/**
 * ใช้กับ <img src> ซึ่งแนบ Authorization header ไม่ได้ — backend จึงยอมรับ ?token=
 * เฉพาะ endpoint รูปภาพนี้ตัวเดียว
 */
export const imageUrl = (receiptId: string) => {
  const token = getToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${API_BASE}/api/receipts/${receiptId}/image${query}`;
};

export async function uploadReceipt(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  return handle(
    await fetch(`${API_BASE}/api/receipts`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    }),
  );
}

export async function extractReceipt(receiptId: string): Promise<ExtractResult> {
  return handle(
    await fetch(`${API_BASE}/api/receipts/${receiptId}/extract`, {
      method: "POST",
      headers: authHeaders(),
    }),
  );
}

export async function createTransaction(payload: unknown): Promise<Transaction> {
  return handle(
    await fetch(`${API_BASE}/api/transactions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateTransaction(
  id: string,
  payload: unknown,
): Promise<Transaction> {
  return handle(
    await fetch(`${API_BASE}/api/transactions/${id}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteTransaction(id: string): Promise<void> {
  return handle(
    await fetch(`${API_BASE}/api/transactions/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }),
  );
}

/** includeInactive ใช้ในหน้าจัดการหมวด — ที่อื่นเห็นเฉพาะหมวดที่เปิดอยู่ */
export async function fetchCategories(includeInactive = false): Promise<Category[]> {
  const q = includeInactive ? "?include_inactive=1" : "";
  return handle(await fetch(`${API_BASE}/api/categories${q}`, { headers: authHeaders() }));
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  return handle(
    await fetch(`${API_BASE}/api/categories`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
    }),
  );
}

export async function updateCategory(id: string, input: CategoryInput): Promise<Category> {
  return handle(
    await fetch(`${API_BASE}/api/categories/${id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
    }),
  );
}

export type MonthWithData = { month: string; count: number; total: string };

/** เดือนที่มีข้อมูลอยู่จริงตามแกนที่เลือก — ใช้บอกผู้ใช้ตอนเดือนที่เปิดอยู่ว่างเปล่า */
export async function fetchMonths(
  axis: DateAxis = "purchased",
): Promise<MonthWithData[]> {
  return handle(
    await fetch(`${API_BASE}/api/transactions/months?by=${axis}`, {
      headers: authHeaders(),
    }),
  );
}

/**
 * axis กำหนดว่า "เดือน" หมายถึงเดือนอะไร — เปลี่ยนทั้งชุดข้อมูลที่ได้ ไม่ใช่แค่ลำดับ
 *
 * purchased = เดือนที่ซื้อของ (มุมมองการเงิน)
 * uploaded  = เดือนที่สแกนเข้าระบบ (มุมมอง feed/audit)
 */
export type DateAxis = "purchased" | "uploaded";

export async function fetchMonthly(
  month: string,
  axis: DateAxis = "purchased",
): Promise<Monthly> {
  const q = `month=${encodeURIComponent(month)}&by=${axis}`;
  return handle(
    await fetch(`${API_BASE}/api/transactions?${q}`, { headers: authHeaders() }),
  );
}

// ---------------------------------------------------------------- auth

export async function registerAccount(
  name: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  return handle(
    await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    }),
  );
}

export async function loginAccount(
  email: string,
  password: string,
): Promise<AuthResult> {
  return handle(
    await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
}

/** เรียกตอนเปิดแอปเพื่อดูว่า token ที่เก็บไว้ยังใช้ได้ไหม */
export async function fetchMe(): Promise<AuthUser> {
  return handle(await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() }));
}

export const baht = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === ""
    ? "—"
    : Number(v).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
