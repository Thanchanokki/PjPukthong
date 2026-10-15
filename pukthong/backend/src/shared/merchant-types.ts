/**
 * ประเภทร้าน — แยกใบเสร็จ "ทั้งใบ" ตามร้านที่ซื้อ (คนละแกนกับหมวดสินค้ารายชิ้น)
 *
 * ตัวอย่าง: ใบ 7-Eleven ที่มีนมกับปากกา
 *   - หมวดสินค้า: นม -> เครื่องดื่ม, ปากกา -> การศึกษา  (หน้ารายงาน)
 *   - ประเภทร้าน: ทั้งใบ -> ร้านสะดวกซื้อ/ร้านค้าทั่วไป  (งบแบบ "ตามประเภทร้าน")
 *
 * ชุดตายตัวในโค้ด ผู้ใช้สร้างเพิ่มไม่ได้ — ห้ามแก้ id เพราะ transactions.merchantType
 * และ budgets เก็บ id นี้ไว้ (แก้ชื่อ/ไอคอนได้ตามสบาย)
 */
import { type Matchable, matchCategory } from "./categories.js";

export interface MerchantType extends Matchable {
  icon: string;
  /** อธิบายให้ AI เลือกถูก — แปะลง prompt */
  hint: string;
  /**
   * หมวดสินค้าเริ่มต้นของร้านประเภทนี้ (CategoryDoc._id) — null = ร้านขายของปนกัน ให้ AI จัดทีละชิ้น
   *
   * มีค่า = ทุกรายการในใบถูกตั้งเป็นหมวดนี้ทันที (ผู้ใช้แก้รายชิ้นได้ในหน้าตรวจ)
   * เช่น ใบ Starbucks ทุกรายการเป็น "อาหาร" แม้จะเป็นกาแฟก็ตาม — ตามสเปกของโปรเจกต์
   */
  defaultCategory: string | null;
  /** ใบประเภทนี้ไม่มีรายการสินค้า (ใบเสร็จค่าเบี้ยประกัน) — เก็บข้อมูลกรมธรรม์แทน */
  noItems?: boolean;
}

/**
 * aliases รวม id ชุดเก่าไว้ด้วย (fashion, housing_bills, other_shop …) ให้ข้อมูลและเฉลยที่ใช้
 * id เดิมยังแปลงเป็นประเภทใหม่ได้ — ดู scripts/migrate-merchant-types-v2.ts
 */
export const MERCHANT_TYPES: MerchantType[] = [
  {
    id: "convenience",
    name: "ร้านสะดวกซื้อ",
    icon: "🏪",
    hint: "7-Eleven, FamilyMart, Lotus's go fresh, CJ More, มินิมาร์ท — ขายของหลายหมวดปนกัน",
    aliases: ["ร้านสะดวกซื้อ/ร้านค้าทั่วไป"],
    defaultCategory: null,
  },
  {
    id: "supermarket",
    name: "ซูเปอร์มาร์เก็ต/ไฮเปอร์มาร์เก็ต",
    icon: "🛒",
    hint: "Lotus's, Big C, Tops, Makro (CP Axtra), Villa Market, Gourmet Market",
    aliases: ["ซูเปอร์มาร์เก็ต", "ไฮเปอร์มาร์เก็ต", "ห้างค้าปลีก", "wholesale"],
    defaultCategory: null,
  },
  {
    id: "restaurant",
    name: "ร้านอาหาร/คาเฟ่/เครื่องดื่ม",
    icon: "🍜",
    hint: "MK, S&P, Café Amazon, Starbucks, ฟู้ดคอร์ท, ร้านอาหาร, ร้านกาแฟ, ร้านชานม, เบเกอรี่, ฟาสต์ฟู้ด",
    aliases: ["ร้านอาหาร/คาเฟ่", "ร้านอาหาร", "คาเฟ่", "ร้านกาแฟ", "cafe", "fast_food"],
    defaultCategory: "food",
  },
  {
    id: "pharmacy",
    name: "ร้านขายยา/คลินิก/โรงพยาบาล",
    icon: "💊",
    hint: "ร้านขายยาทั่วไป, Fascino, คลินิก, โรงพยาบาล, ทันตกรรม — ขายยาหรือบริการรักษาเป็นหลัก",
    aliases: ["ร้านขายยา", "คลินิก", "โรงพยาบาล", "medical", "pharmacy_beauty"],
    defaultCategory: "health",
  },
  {
    // แยกจากร้านขายยา: Boots/Watsons ขายเครื่องสำอางและของใช้ส่วนตัวมากกว่ายา
    // ถ้าตั้งทุกรายการเป็นสุขภาพและยา ผู้ใช้ต้องแก้แทบทุกชิ้น จึงให้ AI จัดรายชิ้น
    id: "beauty_personal",
    name: "ร้านเครื่องสำอางและของใช้ส่วนตัว",
    icon: "💄",
    hint: "Boots, Watsons, EVEANDBOY, Beautrium, Sephora, เคาน์เตอร์แบรนด์เครื่องสำอางในห้าง, ร้านบิวตี้ — ขายทั้งยา เครื่องสำอาง ของใช้ส่วนตัวปนกัน",
    aliases: ["ร้านเครื่องสำอาง", "ร้านบิวตี้", "เครื่องสำอาง", "beauty"],
    defaultCategory: null,
  },
  {
    id: "department_fashion",
    name: "ห้างสรรพสินค้า/แฟชั่น",
    icon: "🛍️",
    hint: "Central, Robinson, The Mall, Uniqlo, H&M, ร้านเสื้อผ้า รองเท้า กระเป๋า เครื่องประดับ, ร้านไอที, ร้านหนังสือในห้าง",
    aliases: ["แฟชั่น/เสื้อผ้า", "ห้างสรรพสินค้า", "แฟชั่น", "fashion", "clothing", "accessories", "electronics", "stationery_books"],
    defaultCategory: "apparel",
  },
  {
    id: "home_hardware",
    name: "วัสดุและของใช้ในบ้าน",
    icon: "🔨",
    hint: "HomePro, ไทวัสดุ, Global House, Mr. DIY, Daiso, IKEA",
    aliases: ["ของใช้ในบ้าน", "วัสดุก่อสร้าง", "home_goods"],
    defaultCategory: "household",
  },
  {
    id: "fuel_transport",
    name: "ปั๊มน้ำมัน/การเดินทาง",
    icon: "⛽",
    hint: "PTT, บางจาก, Shell, Caltex, ค่าที่จอดรถ, ทางด่วน, ขนส่งสาธารณะ, แท็กซี่, สายการบิน",
    aliases: ["ปั๊มน้ำมัน", "การเดินทาง", "เดินทาง"],
    defaultCategory: "transport",
  },
  {
    id: "bills_services",
    name: "บิลและบริการ",
    icon: "🧾",
    hint: "Counter Service, ไปรษณีย์, การประปา, การไฟฟ้า, ค่าโทรศัพท์/อินเทอร์เน็ต, ค่าเช่าหอพัก",
    aliases: ["ที่พัก/ค่าเช่า/บิล", "บิล", "ค่าเช่า", "housing_bills", "rent"],
    defaultCategory: "housing",
  },
  {
    id: "insurance",
    name: "ประกันภัย",
    icon: "🛡️",
    hint: "ใบเสร็จค่าเบี้ยประกันจาก AIA, เมืองไทยประกันชีวิต, กรุงเทพประกันภัย, FWD, วิริยะประกันภัย, ไทยประกันชีวิต",
    aliases: ["ประกัน", "ประกันชีวิต", "ประกันสุขภาพ"],
    defaultCategory: "insurance",
    noItems: true,
  },
  {
    id: "general_other",
    name: "ร้านค้าทั่วไป/อื่นๆ",
    icon: "🏬",
    hint: "ตลาด, ร้านโชห่วย, ร้านที่ไม่เข้าประเภทข้างบน — อาจมีสินค้าหลายหมวดปนกัน",
    aliases: ["ร้านอื่นๆ", "อื่นๆ", "อื่น", "other_shop", "entertainment", "sports", "gift"],
    defaultCategory: null,
  },
];

/** ใบที่ยังไม่มีประเภทร้าน (ใบเก่า/AI อ่านไม่ออก) ถูกนับเข้าช่องนี้ตอนสรุป */
export const MERCHANT_FALLBACK_ID = "general_other";

const byId = new Map(MERCHANT_TYPES.map((t) => [t.id, t]));

export const merchantTypeOf = (id: string | null | undefined) =>
  byId.get(id ?? "") ?? byId.get(MERCHANT_FALLBACK_ID)!;

/** id/ชื่อ/alias -> id ของประเภทร้าน (null ถ้าจับคู่ไม่ได้) */
export const matchMerchantType = (value: unknown) => matchCategory(value, MERCHANT_TYPES);

/** รายการสำหรับแปะลง prompt ของ AI */
export const merchantTypePrompt = () =>
  MERCHANT_TYPES.map((t) => `${t.id} = ${t.name} (${t.hint})`).join("\n  ");
