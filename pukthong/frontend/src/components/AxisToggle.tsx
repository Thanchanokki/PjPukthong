import type { DateAxis } from "../api";

/**
 * ปุ่มสลับแกนเวลา — ใช้ร่วมกันทั้งหน้าสรุปและหน้ารายการ
 *
 * นิยามไว้ที่เดียวเพราะสองหน้าต้องอธิบายเรื่องเดียวกันด้วยคำเดียวกัน ถ้าแยกกันเขียน
 * แล้ววันหนึ่งแก้แค่หน้าเดียว ผู้ใช้จะเจอสองหน้าที่บอกคนละอย่างเรื่องข้อมูลชุดเดียวกัน
 *
 * ค่านี้เก็บใน URL (?by=) ไม่ใช่ useState — สลับแท็บไปมาแล้วโหมดไม่รีเซ็ต
 * และส่งลิงก์ให้คนอื่นเปิดได้เห็นมุมมองเดียวกัน
 */
export function AxisToggle({
  value,
  onChange,
}: {
  value: DateAxis;
  onChange: (axis: DateAxis) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-slate-400">ดูตาม</span>
      {(
        [
          ["purchased", "เดือนที่ซื้อ"],
          ["uploaded", "เดือนที่สแกน"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded-lg px-2.5 py-1 font-medium ${
            value === key
              ? "bg-teal-700 text-white"
              : "border border-slate-300 bg-white text-slate-600"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * คำเตือนที่ต้องขึ้นคู่กับมุมมอง "เดือนที่สแกน" เสมอ
 *
 * ยอดในมุมมองนี้รวมของที่ซื้อมาจากเดือนอื่น จึงไม่ใช่ค่าใช้จ่ายของเดือนนั้น
 * ถ้าไม่บอก ตัวเลขจะถูกอ่านเป็นยอดรายเดือนแล้วสรุปผิดทันที
 */
export function UploadedAxisNotice() {
  return (
    <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
      กำลังดูตาม<b>เดือนที่สแกนเข้าระบบ</b> — ยอดนี้รวมใบที่ซื้อมาจากเดือนอื่นด้วย
      จึงไม่ใช่ค่าใช้จ่ายของเดือนนี้ ถ้าต้องการยอดรายเดือนจริงให้กด "เดือนที่ซื้อ"
    </p>
  );
}
