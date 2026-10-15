/**
 * หมวดกลางของระบบ — seed ลง collection `categories` ทุกครั้งที่บูต (ดู categories.service)
 *
 * ชื่อหมวดตามสเปกของโปรเจกต์: อาหาร, สุขภาพและยา, ช้อปปิ้ง, ของใช้ในบ้าน, การเดินทาง,
 * บิลและบริการ, ประกันภัย, อื่นๆ — หมวดละเอียดอื่น (เครื่องดื่ม, การศึกษา ฯลฯ) ยังเก็บไว้
 * ใช้จัดสินค้าทีละชิ้นในร้านที่ขายของปนกัน (ร้านสะดวกซื้อ, ซูเปอร์มาร์เก็ต)
 * id ของ apparel/housing มาจากชื่อเดิม (เสื้อผ้าฯ/ที่พักฯ) — เปลี่ยนแค่ชื่อที่แสดง ข้อมูลเก่าจึงไม่ต้องย้าย
 *
 * ทำไม _id เป็น slug คงที่ ไม่ใช่ UUID: รายการทุกชิ้นเก็บ categoryId ไว้ ถ้า id เปลี่ยน
 * ทุกครั้งที่ seed ข้อมูลเก่าจะหลุดหมวดหมด — แก้ชื่อหรือไอคอนตรงนี้ได้ แต่ห้ามแก้ id
 *
 * aliases คือชื่อที่เคยใช้หรือที่ AI ชอบตอบ — ใช้แปลงชื่อเป็น id ทั้งตอนรับผลจาก AI
 * และตอนย้ายข้อมูลเก่าที่เก็บเป็นชื่อหมวด (ก่อนมี collection นี้)
 */

export interface SystemCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  aliases: string[];
}

export const SYSTEM_CATEGORIES: SystemCategory[] = [
  { id: "food", name: "อาหาร", icon: "🍚", color: "#F59E0B", aliases: ["อาหารและเครื่องดื่ม", "ขนม"] },
  { id: "drinks", name: "เครื่องดื่ม", icon: "☕", color: "#A16207", aliases: ["กาแฟ", "น้ำดื่ม"] },
  { id: "household", name: "ของใช้ในบ้าน", icon: "🧽", color: "#0EA5E9", aliases: [] },
  { id: "personal", name: "ความงามและของใช้ส่วนตัว", icon: "🧴", color: "#EC4899", aliases: ["ของใช้ส่วนตัว", "ความงาม", "เครื่องสำอาง"] },
  { id: "health", name: "สุขภาพและยา", icon: "💊", color: "#10B981", aliases: ["สุขภาพ", "ยา"] },
  { id: "transport", name: "การเดินทาง", icon: "🚗", color: "#6366F1", aliases: ["เดินทาง", "น้ำมัน", "ค่าที่จอดรถ"] },
  { id: "apparel", name: "ช้อปปิ้ง", icon: "🛍️", color: "#8B5CF6", aliases: ["เสื้อผ้าและเครื่องประดับ", "เสื้อผ้า", "เครื่องประดับ", "แฟชั่น"] },
  { id: "electronics", name: "เครื่องใช้ไฟฟ้าและไอที", icon: "💻", color: "#64748B", aliases: ["ไอที", "อุปกรณ์อิเล็กทรอนิกส์"] },
  { id: "housing", name: "บิลและบริการ", icon: "🧾", color: "#EF4444", aliases: ["ที่พักและสาธารณูปโภค", "ค่าเช่า", "ค่าน้ำ", "ค่าไฟ", "ค่าโทรศัพท์"] },
  { id: "education", name: "การศึกษา", icon: "📚", color: "#14B8A6", aliases: ["เครื่องเขียน", "หนังสือ"] },
  { id: "entertainment", name: "บันเทิงและงานอดิเรก", icon: "🎮", color: "#F97316", aliases: ["บันเทิง", "ของเล่น", "ท่องเที่ยว"] },
  { id: "pets", name: "สัตว์เลี้ยง", icon: "🐾", color: "#84CC16", aliases: [] },
  { id: "insurance", name: "ประกันภัย", icon: "🛡️", color: "#0F766E", aliases: ["ประกัน", "เบี้ยประกัน", "ประกันชีวิต", "ประกันสุขภาพ"] },
  { id: "other", name: "อื่นๆ", icon: "📦", color: "#94A3B8", aliases: ["อื่น ๆ", "อื่น"] },
];

/**
 * หมวดปลายทางของเงินที่จัดกลุ่มไม่ได้ (VAT ท้ายบิล ส่วนลด ของที่ยังไม่เลือกหมวด)
 *
 * ต้องเป็นหมวดกลางเสมอ ผู้ใช้ทุกคนจึงเห็นหมวดนี้ใน dashboard และเลือกในฟอร์มได้
 */
export const FALLBACK_ID = "other";

/** ข้อมูลขั้นต่ำที่ใช้จับคู่ชื่อ — ทั้ง CategoryDoc และ SystemCategory มีครบ */
export interface Matchable {
  id: string;
  name: string;
  aliases: string[];
}

const clean = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * แปลงชื่อหรือ id ที่ AI/ผู้ใช้/ข้อมูลเก่าส่งมา ให้เป็น id ของหมวดที่ผู้ใช้คนนั้นเห็น
 * คืน null ถ้าจับคู่ไม่ได้
 *
 * คืน null ไม่ใช่ FALLBACK_ID โดยตั้งใจ: "ยังไม่ได้จัดหมวด" กับ "จัดแล้วได้อื่นๆ"
 * เป็นคนละเรื่อง — อย่างแรกควรให้ผู้ใช้เห็นว่าต้องเลือกเอง อย่างหลังคือคำตอบสุดท้ายแล้ว
 */
export function matchCategory(value: unknown, pool: readonly Matchable[]): string | null {
  if (typeof value !== "string") return null;
  const v = clean(value);
  if (!v) return null;

  for (const c of pool) {
    if (c.id === value.trim() || clean(c.name) === v) return c.id;
  }
  for (const c of pool) {
    if (c.aliases.some((a) => clean(a) === v)) return c.id;
  }

  // AI ชอบตอบชื่อใกล้เคียงแม้ prompt จะสั่งให้เลือกจากรายการ เช่น "อาหารญี่ปุ่น"
  // เลือกตัวที่ชื่อยาวสุดเพื่อไม่ให้หมวดสั้นที่บังเอิญเป็นสตริงย่อยชิงไป
  const hits = pool
    .flatMap((c) => [c.name, ...c.aliases].map((n) => ({ id: c.id, n: clean(n) })))
    .filter(({ n }) => n.length >= 2 && (v.includes(n) || n.includes(v)))
    .sort((a, b) => b.n.length - a.n.length);
  return hits[0]?.id ?? null;
}
