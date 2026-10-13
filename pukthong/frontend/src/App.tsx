import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./auth";
import { BottomNav } from "./components/BottomNav";
import BudgetPage from "./pages/BudgetPage";
import CapturePage from "./pages/CapturePage";
import CategoriesPage from "./pages/CategoriesPage";
import DashboardPage from "./pages/DashboardPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ManualPage from "./pages/ManualPage";
import MonthlyPage from "./pages/MonthlyPage";
import RegisterPage from "./pages/RegisterPage";
import ReviewPage from "./pages/ReviewPage";
import SettingsPage from "./pages/SettingsPage";



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
  return (
    <div className="min-h-screen">
      {/* ไม่มีแถบบนสุดแล้ว — ปุ่มออกจากระบบย้ายไปอยู่ในหน้าตั้งค่า (เปิดจากไอคอนเฟืองที่
          หน้าหลัก) เมนูนำทางไปหน้าอื่น (ถ่ายใบเสร็จ/กรอกเอง/สรุป/รายการ) อยู่ที่ bottom nav */}

      {/* pb-24 กันเนื้อหาไม่ให้ถูก BottomNav (fixed) บัง — ปรับตัวเลขถ้าความสูง nav เปลี่ยน */}
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/add" element={<CapturePage />} />
          <Route path="/review/:receiptId" element={<ReviewPage />} />
          <Route path="/manual" element={<ManualPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/monthly" element={<MonthlyPage />} />
           <Route path="/budget" element={<BudgetPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
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