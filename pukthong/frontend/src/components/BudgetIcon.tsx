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
 * ไอคอนของหมวดงบ — แกนประเภทร้านใช้ไอคอนเส้น, แกนหมวดของใช้ไอคอนที่ตั้งไว้กับหมวด
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
  const path = axis === "merchant" ? MERCHANT_ICON[id] : undefined;
  if (path) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        {path}
      </svg>
    );
  }
  return <span className={`${emojiClass} leading-none`} aria-hidden="true">{icon ?? "•"}</span>;
}
