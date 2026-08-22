import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./auth";
import { BottomNav } from "./components/BottomNav";
import { Logo } from "./components/Logo";
import CapturePage from "./pages/CapturePage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ManualPage from "./pages/ManualPage";
import MonthlyPage from "./pages/MonthlyPage";
import RegisterPage from "./pages/RegisterPage";
import ReviewPage from "./pages/ReviewPage";



/**
 * ทุกหน้าที่แตะข้อมูลของผู้ใช้ต้องผ่านตัวนี้ก่อน
 *
 * ระหว่างที่ยังเช็ค token เดิมอยู่ต้องไม่เด้งไป /login ไม่งั้นคนที่ล็อกอินค้างไว้
 * จะโดนเตะออกทุกครั้งที่ refresh
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-slate-500">กำลังโหลด…</p>;
  }
  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }
  return <>{children}</>;
}

function Shell() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen">
      {/* เหลือแค่โลโก้กับปุ่มออกจากระบบ — เมนูนำทางไปหน้าอื่น (ถ่ายใบเสร็จ/กรอกเอง/
          สรุป/รายการ) ย้ายไป bottom nav แล้ว ไม่ต้องซ้ำกันสองที่ */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3">
          <Link to="/" aria-label="Pukthong หน้าหลัก">
           <Logo variant="full" height={38} />
          </Link>          <button
            onClick={logout}
            className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      {/* pb-24 กันเนื้อหาไม่ให้ถูก BottomNav (fixed) บัง — ปรับตัวเลขถ้าความสูง nav เปลี่ยน */}
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <Routes>
          <Route path="/" element={<CapturePage />} />
          <Route path="/review/:receiptId" element={<ReviewPage />} />
          <Route path="/manual" element={<ManualPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/monthly" element={<MonthlyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <BottomNav />
    </div>
  );
}

/** ล็อกอินอยู่แล้วไม่ต้องเห็นหน้า login/register อีก */
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <p className="p-8 text-center text-sm text-slate-500">กำลังโหลด…</p>;
  }
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* หน้าเต็มจอ ไม่มี header/nav */}
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <RegisterPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="*"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      />
    </Routes>
  );
}