// ทุก request วิ่งผ่าน backend ของเราเสมอ — frontend ไม่เคยถือ KKU_API_KEY

/**
 * ที่อยู่ backend — เดาจาก host ที่ browser เปิดอยู่ ถ้าไม่ได้ตั้ง VITE_API_BASE ไว้
 *
 * ห้าม fallback เป็น "localhost" เด็ดขาด: โค้ดนี้ทำงานใน browser ของผู้ใช้ พอเปิด
 * จากมือถือ localhost จะหมายถึงตัวมือถือเอง แล้วยิง API ไม่เจอทั้งแอป
 *
 * ใช้ hostname ที่เปิดอยู่แทน จึงถูกเสมอทั้งตอนเปิด localhost:3000 บนเครื่อง และตอน
 * เปิด 192.168.x.x:3000 จากมือถือ — และไม่พังอีกเมื่อเราเตอร์แจก IP ใหม่ให้เครื่อง
 */
const guessApiBase = () => {
  if (typeof window === "undefined") return "http://localhost:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
};

export const API_BASE = import.meta.env.VITE_API_BASE || guessApiBase();

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
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
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
  /** หมวดที่ AI เดาให้ตอนสแกน — เป็นค่าตั้งต้นของ category */
  category_guess?: string | null;
  /** หมวดที่ผู้ใช้ยืนยัน — ตัวนี้เท่านั้นที่ถูกบันทึกและใช้สรุปใน dashboard */
  category?: string | null;
};

export type ReceiptDraft = {
  document_type: string | null;
  merchant_name: string | null;
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

export type ExtractResult = {
  receipt_id: string;
  draft: ReceiptDraft;
  warnings: string[];
  ai_model: string;
  scan_confidence: ScanConfidence;
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
  category: string | null;
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
  by_category: { category: string; total: string; count: number }[];
  by_day: { date: string; total: string }[];
  transactions: Transaction[];
};

async function handle<T>(res: Response): Promise<T> {
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
