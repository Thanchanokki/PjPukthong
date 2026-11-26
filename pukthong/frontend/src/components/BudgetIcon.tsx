import type { ReactNode } from "react";

import type { BudgetAxis } from "../budget";

/** เส้นไอคอนของประเภทร้าน (viewBox 24, เส้น 1.8 แบบเดียวกับ components/icons) */
const MERCHANT_ICON: Record<string, ReactNode> = {
  convenience: <><path d="M4 10v10h16V10" /><path d="M3 10l2-6h14l2 6Z" /><path d="M9 20v-5h6v5" /></>,
  supermarket: <><path d="M3 4h2l2.4 11h11L21 7H6.2" /><circle cx="9" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /></>,
  restaurant: <><path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10" /><path d="M16 3c-1.7 0-3 2-3 5s1.3 4 3 4v9" /></>,
  pharmacy: <><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M12 8v8" /></>,
  beauty_personal: <><path d="M9 3h6v4l1 2v12H8V9l1-2Z" /><path d="M8 13h8" /></>,
  department_fashion: <><path d="M5 8h14l-1 13H6Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  home_hardware: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  fuel_transport: <><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M5 11h10" /><path d="M15 8h2l2 3v6a1.5 1.5 0 0 0 3 0v-7l-3-3" /></>,
  bills_services: <><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  general_other: <><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>,
};

/**
 * เส้นไอคอนของหมวดของ (หมวดกลางของระบบ — id เป็น slug คงที่จาก backend shared/categories.ts)
 * หมวดที่ผู้ใช้สร้างเองไม่อยู่ในนี้ จะใช้อีโมจิที่ผู้ใช้เลือกไว้แทน
 */
const ITEM_ICON: Record<string, ReactNode> = {
  food: <><path d="M3 12h18a9 9 0 0 1-18 0Z" /><path d="M8 8c0-1 1-1.5 1-3M12 8c0-1 1-1.5 1-3M16 8c0-1 1-1.5 1-3" /></>,
  drinks: <><path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M9 3v2M13 3v2" /></>,
  household: <><path d="M9 10h6v11H9z" /><path d="M10 10V6h4l3-2" /><path d="M14 6h3M11 14h2" /></>,
  personal: MERCHANT_ICON.beauty_personal,
  health: <><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" /><path d="M8 11h2l1-2 2 4 1-2h2" /></>,
  transport: <><path d="M4 16v-4l2-5h12l2 5v4Z" /><path d="M4 12h16" /><circle cx="8" cy="17.5" r="1.5" /><circle cx="16" cy="17.5" r="1.5" /></>,
  apparel: MERCHANT_ICON.department_fashion,
  electronics: <><rect x="5" y="5" width="14" height="10" rx="1" /><path d="M3 19h18" /></>,
  housing: MERCHANT_ICON.bills_services,
  education: <><path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3Z" /><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7Z" /></>,
  entertainment: <><rect x="3" y="8" width="18" height="10" rx="5" /><path d="M8 11v4M6 13h4" /><circle cx="15.5" cy="12" r=".9" /><circle cx="17.5" cy="14.5" r=".9" /></>,
  pets: <><circle cx="12" cy="16" r="3.5" /><circle cx="6.5" cy="11" r="1.6" /><circle cx="17.5" cy="11" r="1.6" /><circle cx="9.5" cy="6.5" r="1.6" /><circle cx="14.5" cy="6.5" r="1.6" /></>,
  other: <><path d="M3 7l9-4 9 4v10l-9 4-9-4Z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
};

/**
 * ไอคอนของหมวดงบ — ไอคอนเส้นทั้งสองแกน (หมวดที่ผู้ใช้สร้างเองใช้อีโมจิของหมวด)
 * (หน้างบ + หน้าตั้งงบใช้ชุดเดียวกัน)
 */
export function BudgetIcon({
  axis,
  id,
  icon,
  className = "h-7 w-7",
  emojiClass = "text-xl",
}: {
  axis: BudgetAxis;
  id: string;
  icon: string | null;
  className?: string;
  emojiClass?: string;
}) {
  const path = (axis === "merchant" ? MERCHANT_ICON : ITEM_ICON)[id];
  if (path) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        {path}
      </svg>
    );
  }
  return <span className={`${emojiClass} leading-none`} aria-hidden="true">{icon ?? "•"}</span>;
}
