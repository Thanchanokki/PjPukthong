// ทุก request วิ่งผ่าน backend ของเราเสมอ — frontend ไม่เคยถือ KKU_API_KEY

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

/**
 * JWT เก็บใน localStorage เพื่อให้ยังล็อกอินค้างหลังปิดแท็บ
 * (ฝั่งที่ทำ login/register เดิมก็ใช้ที่เดียวกัน แต่แนบ token ผ่าน axios interceptor
 * ส่วนไฟล์นี้ใช้ fetch ล้วน จึงเติม header เองใน authHeaders())
 */
const TOKEN_KEY = "pukthong_token";

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
  category_guess?: string | null;
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
  image_url: string;
};

export type ExtractResult = {
  receipt_id: string;
  draft: ReceiptDraft;
  warnings: string[];
  ai_model: string;
};

export type Transaction = {
  id: string;
  receipt_id: string | null;
  direction: "income" | "expense";
  merchant_name: string | null;
  branch: string | null;
  merchant_tax_id: string | null;
  doc_number: string | null;
  occurred_on: string;
  occurred_at_time: string | null;
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
  created_at: string;
  items: (LineItem & { id: number; line_no: number | null })[];
};

export type Monthly = {
  month: string;
  income_total: string;
  expense_total: string;
  net: string;
  by_category: { category: string | null; total: string; count: number }[];
  transactions: Transaction[];
};

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // token หมดอายุหรือถูกเพิกถอน — ทิ้งทันที ไม่งั้นแอปจะพยายามใช้ต่อจนกว่าจะปิดแท็บ
    if (res.status === 401) clearToken();
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

export async function fetchMonthly(month: string): Promise<Monthly> {
  return handle(
    await fetch(`${API_BASE}/api/transactions?month=${encodeURIComponent(month)}`, {
      headers: authHeaders(),
    }),
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
