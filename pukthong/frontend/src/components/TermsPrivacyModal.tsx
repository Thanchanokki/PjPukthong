import { useEffect, useLayoutEffect, useRef } from "react";

import { Logo } from "./Logo";

export type TermsSection = "terms" | "privacy";

/**
 * ⚠️ TODO: ค่าที่ยังต้องกรอกเป็นข้อมูลจริงก่อนเปิดใช้งานจริง — ห้ามเดาเอง เพราะเป็นข้อความ
 * ทางกฎหมายที่ผูกพันกับผู้ใช้ ตอนนี้แสดงเป็นป้ายสีเหลืองให้เห็นชัดว่ายังไม่ได้กรอก
 */
const TODO = {
  /** ผู้ให้บริการ OCR / AI ภายนอกที่ backend ส่งรูปใบเสร็จไปให้ และประเทศที่ตั้งศูนย์ข้อมูล */
  aiProviders: "[ระบุชื่อผู้ให้บริการ/ที่ตั้งศูนย์ข้อมูลตามจริง]",
  /** ลบข้อมูลภายในกี่วันหลังผู้ใช้ขอปิดบัญชี */
  retentionDays: "[ระบุจำนวนวัน]",
  contactEmail: "[อีเมลติดต่อ]",
  contactAddress: "[ที่อยู่สำหรับติดต่อ]",
} as const;

/** วันที่ข้อความฉบับนี้มีผล — แก้ทุกครั้งที่เนื้อหาเปลี่ยน */
const LAST_UPDATED = "16 ตุลาคม 2569";

/**
 * ข้อตกลงการใช้งาน + นโยบายความเป็นส่วนตัว ในป๊อปอัพเดียว เลื่อนอ่านได้
 *
 * เปิดจากหน้าสมัครสมาชิกโดยบอก `section` ว่าผู้ใช้กดคำไหน แล้วเลื่อนไปหัวข้อนั้นให้เลย
 * ปุ่ม "ยอมรับ" ด้านล่างติ๊ก checkbox ในฟอร์มแทนผู้ใช้ (ผ่าน onAccept) แล้วปิดป๊อปอัพ
 */
export function TermsPrivacyModal({
  section,
  onClose,
  onAccept,
}: {
  section: TermsSection;
  onClose: () => void;
  onAccept: () => void;
}) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const termsRef = useRef<HTMLElement>(null);
  const privacyRef = useRef<HTMLElement>(null);

  // เลื่อนก่อน paint ผู้ใช้จะไม่เห็นหน้ากระโดดจากหัวข้อแรกไปหัวข้อที่กด
  useLayoutEffect(() => {
    const target = (section === "terms" ? termsRef : privacyRef).current;
    const el = scroller.current;
    if (!el || !target) return;
    // ลบ padding บนของกล่องเลื่อน ให้หัวข้อเว้นขอบเท่ากับตอนเปิดที่หัวข้อแรก
    el.scrollTop = target.offsetTop - parseFloat(getComputedStyle(el).paddingTop);
  }, [section]);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // กันหน้าฟอร์มด้านหลังเลื่อนตามตอนเลื่อนอ่านในป๊อปอัพบนมือถือ
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-paper text-ink shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative flex flex-col items-center gap-1.5 border-b border-kraft px-6 pb-4 pt-5">
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink/50 hover:bg-ink/5"
          >
            ✕
          </button>
          <Logo variant="full" height={52} className="mb-1" />
          <h2 id="terms-title" className="text-center text-lg font-semibold leading-snug">
            ข้อตกลงการใช้งาน
            <br />
            และนโยบายความเป็นส่วนตัว
          </h2>
          <p className="text-sm text-ink/60">แอปพลิเคชัน “ปุ๊กทอง”</p>
          <p className="font-mono text-[11px] text-ink/45">ปรับปรุงล่าสุด: {LAST_UPDATED}</p>
        </header>

        {/* relative = จุดอ้างอิงของ offsetTop ที่ใช้เลื่อนไปหัวข้อ */}
        <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <section ref={termsRef} id="section-terms" className="flex flex-col gap-3.5">
            <SectionTitle>1. ข้อตกลงการใช้งาน</SectionTitle>
            <Clause title="1.1 การยอมรับข้อตกลง">
              การเข้าใช้งานแอปพลิเคชัน “ปุ๊กทอง” ถือว่าท่านได้อ่าน เข้าใจ
              และยินยอมผูกพันตามข้อตกลงฉบับนี้ทุกประการ หากไม่ยินยอม กรุณาหยุดการใช้งานแอปพลิเคชัน
            </Clause>
            <Clause title="1.2 คำอธิบายบริการ">
              ปุ๊กทองเป็นแอปบันทึกรายรับ-รายจ่ายส่วนบุคคล โดยให้ผู้ใช้ถ่ายภาพหรืออัปโหลดใบเสร็จ
              ระบบใช้เทคโนโลยีรู้จำตัวอักษร (OCR) ร่วมกับแบบจำลองภาษา (AI) เพื่อแยกยอดเงิน
              รายการสินค้า และจัดหมวดหมู่รายจ่ายให้โดยอัตโนมัติ
            </Clause>
            <Clause title="1.3 ความถูกต้องของผลลัพธ์จากระบบอัตโนมัติ">
              ผลลัพธ์จาก OCR และ AI อาจมีความคลาดเคลื่อนได้ในบางกรณี
              ท่านมีหน้าที่ตรวจสอบและยืนยันความถูกต้องของข้อมูลก่อนบันทึกทุกครั้ง
              ปุ๊กทองไม่รับประกันความถูกต้องสมบูรณ์ของข้อมูลที่ประมวลผลโดยอัตโนมัติ
            </Clause>
            <Clause title="1.4 สิทธิและหน้าที่ของผู้ใช้">
              ท่านต้องให้ข้อมูลที่เป็นจริงในการลงทะเบียน รักษาความลับของรหัสผ่าน
              และรับผิดชอบต่อกิจกรรมทั้งหมดภายใต้บัญชีของท่าน
              ห้ามใช้แอปเพื่อวัตถุประสงค์ที่ผิดกฎหมายหรือละเมิดสิทธิผู้อื่น
            </Clause>
            <Clause title="1.5 ข้อจำกัดความรับผิด">
              ปุ๊กทองไม่รับผิดต่อความเสียหายทางการเงินหรือความเสียหายอื่นใด
              ที่เกิดจากการตัดสินใจของผู้ใช้โดยอ้างอิงข้อมูลจากแอป
              แอปนี้เป็นเครื่องมือช่วยบันทึกและสรุปข้อมูล มิใช่คำแนะนำทางการเงิน
            </Clause>
            <Clause title="1.6 การระงับหรือยกเลิกบัญชี">
              ปุ๊กทองสงวนสิทธิ์ระงับหรือยกเลิกบัญชีที่ฝ่าฝืนข้อตกลงนี้
              โดยจะแจ้งให้ทราบล่วงหน้าตามความเหมาะสม เว้นแต่กรณีจำเป็นเร่งด่วน
            </Clause>
            <Clause title="1.7 การแก้ไขข้อตกลง">
              เราอาจปรับปรุงข้อตกลงนี้เป็นครั้งคราว
              และจะแจ้งให้ทราบผ่านแอปก่อนการเปลี่ยนแปลงมีผลบังคับใช้
            </Clause>
          </section>

          <hr className="my-6 border-kraft" />

          <section ref={privacyRef} id="section-privacy" className="flex flex-col gap-3.5">
            <SectionTitle>2. นโยบายความเป็นส่วนตัว</SectionTitle>
            <Clause title="2.1 ข้อมูลที่เราเก็บรวบรวม">
              <ul className="list-disc space-y-1 pl-4">
                <li>ข้อมูลบัญชีผู้ใช้ทั่วไป — ชื่อ อีเมล หรือเบอร์โทรศัพท์ที่ใช้ลงทะเบียน</li>
                <li>ภาพถ่ายใบเสร็จ — ภาพที่ท่านถ่ายหรืออัปโหลดเข้าระบบ</li>
                <li>
                  ข้อมูลธุรกรรมทางการเงิน — ยอดเงิน ชื่อร้านค้า วันที่
                  และหมวดหมู่รายจ่ายที่แยกได้จากใบเสร็จ
                </li>
              </ul>
            </Clause>
            <Clause title="2.2 วัตถุประสงค์ในการใช้ข้อมูล">
              เราใช้ข้อมูลข้างต้นเพื่อประมวลผล OCR แยกและจัดหมวดหมู่รายการ
              แสดงสรุปงบประมาณและรายงานให้ผู้ใช้ ตลอดจนพัฒนาและปรับปรุงความแม่นยำของระบบ
            </Clause>

            {/* ข้อที่ผู้ใช้ต้องรู้ก่อนยอมรับมากที่สุด — รูปใบเสร็จออกนอกระบบเราไปหาบริการภายนอก */}
            <div className="rounded-xl border border-brass/60 bg-white px-4 py-3.5">
              <p className="mb-1 font-mono text-[11px] font-bold uppercase tracking-wide text-brass">
                สำคัญ โปรดอ่าน
              </p>
              <Clause title="2.3 การเปิดเผยข้อมูลแก่บุคคลที่สาม">
                ในการประมวลผลใบเสร็จ ปุ๊กทองจำเป็นต้องส่ง
                <strong className="font-semibold text-ink">ภาพใบเสร็จและ/หรือข้อความที่แยกได้</strong>
                ไปยังผู้ให้บริการประมวลผล OCR และแบบจำลองภาษา (AI) ภายนอก
                เพื่อแปลงภาพเป็นข้อความและจัดหมวดหมู่รายการให้
                ผู้ให้บริการดังกล่าวมีข้อตกลงรักษาความลับข้อมูลกับเรา
                และใช้ข้อมูลเพื่อการประมวลผลตามคำขอเท่านั้น
                ไม่นำไปใช้เพื่อวัตถุประสงค์อื่นโดยไม่ได้รับความยินยอม{" "}
                <Todo>{TODO.aiProviders}</Todo>
              </Clause>
            </div>

            <Clause title="2.4 ระยะเวลาการเก็บรักษาข้อมูล">
              เราเก็บรักษาข้อมูลของท่านตลอดระยะเวลาที่ใช้งานบัญชี
              และจะลบหรือทำให้ไม่สามารถระบุตัวตนได้ภายใน <Todo>{TODO.retentionDays}</Todo>{" "}
              วันหลังจากท่านขอปิดบัญชีหรือลบข้อมูล เว้นแต่กฎหมายกำหนดให้เก็บไว้นานกว่านั้น
            </Clause>
            <Clause title="2.5 สิทธิของเจ้าของข้อมูลส่วนบุคคล">
              ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ท่านมีสิทธิขอเข้าถึง แก้ไข ลบ
              โอนย้าย หรือถอนความยินยอมในการประมวลผลข้อมูลส่วนบุคคลของท่านได้ทุกเมื่อ
              ผ่านช่องทางที่ระบุด้านล่าง
            </Clause>
            <Clause title="2.6 มาตรการรักษาความปลอดภัย">
              เรามีการเข้ารหัสข้อมูลระหว่างการส่งและจัดเก็บ
              จำกัดสิทธิ์การเข้าถึงเฉพาะบุคลากรที่เกี่ยวข้อง และตรวจสอบระบบความปลอดภัยอย่างสม่ำเสมอ
            </Clause>
            <Clause title="2.7 ช่องทางติดต่อ">
              หากมีข้อสงสัยเกี่ยวกับนโยบายนี้ หรือต้องการใช้สิทธิของเจ้าของข้อมูล
              ติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคลได้ที่ <Todo>{TODO.contactEmail}</Todo> หรือ{" "}
              <Todo>{TODO.contactAddress}</Todo>
            </Clause>
          </section>
        </div>

        <footer className="flex flex-col gap-2 border-t border-kraft px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={onAccept}
            className="w-full rounded-lg bg-stamp py-3 text-sm font-semibold text-white transition hover:bg-stamp/90"
          >
            อ่านแล้ว ยอมรับข้อตกลงและนโยบาย
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg py-2.5 text-sm font-medium text-ink/60 hover:bg-ink/5"
          >
            ปิด
          </button>
        </footer>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-ink">{children}</h3>;
}

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-ink">{title}</h4>
      <div className="text-[13px] leading-relaxed text-ink/70">{children}</div>
    </div>
  );
}

/** ช่องที่ยังไม่ได้กรอกค่าจริง — ทำให้เด่นไว้ จะได้ไม่หลุดขึ้น production โดยไม่มีใครเห็น */
function Todo({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-brass/25 px-1 text-ink">{children}</mark>;
}
