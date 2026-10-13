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
}

export const MERCHANT_TYPES: MerchantType[] = [
  {
    id: "convenience",
    name: "ร้านสะดวกซื้อ/ร้านค้าทั่วไป",
    icon: "🏪",
    hint: "7-Eleven, CJ, Lotus's, Big C, Tops, CP Axtra/Makro, มินิมาร์ท, ร้านโชห่วย, ซูเปอร์มาร์เก็ต",
    aliases: ["ร้านค้าทั่วไป", "ร้านสะดวกซื้อ", "ซูเปอร์มาร์เก็ต"],
  },
  {
    id: "restaurant",
    name: "ร้านอาหาร/คาเฟ่",
    icon: "🍜",
    hint: "ร้านอาหาร, ร้านกาแฟ, เบเกอรี่, ฟาสต์ฟู้ด, ฟู้ดคอร์ท, ร้านชานม",
    aliases: ["ร้านอาหาร", "คาเฟ่", "ร้านกาแฟ"],
  },
  {
    id: "pharmacy_beauty",
    name: "เครื่องสำอาง/ร้านขายยา",
    icon: "💄",
    hint: "Watsons, Boots, EVEANDBOY, ร้านขายยา, ร้านเครื่องสำอาง, ร้านบิวตี้",
    aliases: ["ร้านขายยา", "เครื่องสำอาง"],
  },
  {
    id: "fashion",
    name: "แฟชั่น/เสื้อผ้า",
    icon: "👗",
    hint: "H&M, Uniqlo, ร้านเสื้อผ้า รองเท้า กระเป๋า เครื่องประดับ",
    aliases: ["เสื้อผ้า", "แฟชั่น"],
  },
  {
    id: "fuel_transport",
    name: "ปั๊มน้ำมัน/เดินทาง",
    icon: "⛽",
    hint: "ปั๊มน้ำมัน (PTT, บางจาก, Shell), ทางด่วน, ที่จอดรถ, ขนส่งสาธารณะ, แท็กซี่, สายการบิน",
    aliases: ["ปั๊มน้ำมัน", "เดินทาง"],
  },
  {
    id: "housing_bills",
    name: "ที่พัก/ค่าเช่า/บิล",
    icon: "🏠",
    hint: "หอพัก, คอนโด, โรงแรม, ค่าเช่า, ค่าน้ำ ค่าไฟ อินเทอร์เน็ต โทรศัพท์",
    aliases: ["ที่พัก", "ค่าเช่า", "บิล"],
  },
  {
    id: "electronics",
    name: "อิเล็กทรอนิกส์",
    icon: "📱",
    hint: "ร้านมือถือ คอมพิวเตอร์ เครื่องใช้ไฟฟ้า (Power Buy, Banana IT, Apple)",
    aliases: ["ไอที", "เครื่องใช้ไฟฟ้า"],
  },
  {
    id: "stationery_books",
    name: "เครื่องเขียน/ร้านหนังสือ",
    icon: "📚",
    hint: "B2S, ร้านหนังสือ, ร้านเครื่องเขียน, ร้านถ่ายเอกสาร",
    aliases: ["เครื่องเขียน", "ร้านหนังสือ"],
  },
  {
    id: "entertainment",
    name: "บันเทิง",
    icon: "🎬",
    hint: "โรงหนัง, คอนเสิร์ต, สวนสนุก, เกม, สตรีมมิ่ง, ฟิตเนส",
    aliases: ["บันเทิง"],
  },
  {
    id: "other_shop",
    name: "ร้านอื่นๆ",
    icon: "🛍️",
    hint: "ร้านที่ไม่เข้าประเภทข้างบน",
    aliases: ["อื่นๆ", "อื่น"],
  },
];

/** ใบที่ยังไม่มีประเภทร้าน (ใบเก่า/AI อ่านไม่ออก) ถูกนับเข้าช่องนี้ตอนสรุป */
export const MERCHANT_FALLBACK_ID = "other_shop";

const byId = new Map(MERCHANT_TYPES.map((t) => [t.id, t]));

export const merchantTypeOf = (id: string | null | undefined) =>
  byId.get(id ?? "") ?? byId.get(MERCHANT_FALLBACK_ID)!;

/** id/ชื่อ/alias -> id ของประเภทร้าน (null ถ้าจับคู่ไม่ได้) */
export const matchMerchantType = (value: unknown) => matchCategory(value, MERCHANT_TYPES);

/** รายการสำหรับแปะลง prompt ของ AI */
export const merchantTypePrompt = () =>
  MERCHANT_TYPES.map((t) => `${t.id} = ${t.name} (${t.hint})`).join("\n  ");
