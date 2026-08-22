/**
 * โครงหน้าจอหลักของแอป (หลังล็อกอิน) — ครอบทุกหน้าด้วย padding ล่างให้พ้น
 * BottomNav ที่ลอยติดขอบจอ ไม่งั้นเนื้อหาบรรทัดสุดท้ายจะโดนแถบเมนูบัง
 *
 * ใช้กับ react-router v6 แบบ nested route เช่น:
 *
 *   <Route element={<Layout />}>
 *     <Route path="/" element={<HomePage />} />
 *     <Route path="/capture" element={<CapturePage />} />
 *     <Route path="/transactions" element={<TransactionsPage />} />
 *     ...
 *   </Route>
 *   // หน้าที่ไม่ต้องมี bottom nav (เช่น /login) ให้อยู่นอกกลุ่ม Route นี้
 */
import { Outlet } from "react-router-dom";

import { BottomNav } from "./BottomNav";

export default function Layout() {
  return (
    <div className="min-h-screen bg-paper">
      {/* pb-24 กันเนื้อหาไม่ให้ถูก BottomNav (fixed) บัง — ปรับตัวเลขถ้าความสูง nav เปลี่ยน */}
      <div className="mx-auto max-w-xl px-4 pb-24 pt-6">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}