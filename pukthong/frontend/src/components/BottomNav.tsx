/**
 * แถบเมนูล่าง — 4 ปุ่มเรียงเท่ากัน (ตัดปุ่มกล้องตรงกลางออกแล้วตามที่ตกลงกัน)
 *
 * ใช้ icon เส้นจาก components/icons.tsx เพื่อคุมสี/ขนาดผ่าน className ได้
 * เหมือนไอคอนอื่นในแอป
 *
 * ⚠️ ปรับ path ใน NAV_ITEMS ให้ตรงกับ route จริงในโปรเจกต์ — โดยเฉพาะ "/budget"
 * ที่ตอนนี้ยังไม่มีหน้าจริงรองรับ
 */
import { NavLink } from "react-router-dom";

import { BudgetIcon, HomeIcon, ListIcon, PieChartIcon } from "./icons";

const NAV_ITEMS = [
  { to: "/", label: "หน้าหลัก", Icon: HomeIcon },
  { to: "/monthly", label: "รายการ", Icon: ListIcon },
  { to: "/dashboard", label: "รายงาน", Icon: PieChartIcon },
  { to: "/budget", label: "งบประมาณ", Icon: BudgetIcon },
];

function NavItem({
  to,
  label,
  Icon,
}: {
  to: string;
  label: string;
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
}) {
  return (
    <NavLink
      to={to}
      // end ป้องกันไม่ให้ "/" active ค้างตอนอยู่หน้าย่อยอื่น (react-router v6 เทียบ prefix)
      end={to === "/"}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition ${
          isActive ? "text-stamp" : "text-ink/35 hover:text-ink/60"
        }`
      }
    >
      <Icon className="h-6 w-6" />
      {label}
    </NavLink>
  );
}

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl items-center
                 border-t border-ink/10 bg-paper px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]
                 pt-2"
    >
      {NAV_ITEMS.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}
    </nav>
  );
}