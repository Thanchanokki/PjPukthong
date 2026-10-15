/**
 * สรุปเบี้ยประกันรายปีเพื่อลดหย่อนภาษีเงินได้บุคคลธรรมดา
 *
 * ใช้ปีปฏิทินของ "วันที่บนใบเสร็จ" (= วันที่ชำระเบี้ย) ตามรอบภาษีไทย ม.ค.–ธ.ค.
 * ตัวเลขเป็นค่าประมาณ — กติกาและเพดานอยู่ที่ shared/insurance.ts ที่เดียว
 */
import { transactions } from "../../db/client.js";
import { httpError } from "../../shared/errors.js";
import {
  LIFE_HEALTH_COMBINED_CAP,
  POLICY_TYPES,
  policyTypeOf,
} from "../../shared/insurance.js";
import { Decimal, dec } from "../../shared/money.js";
import { insuranceOut } from "../transactions/transactions.serializer.js";

export async function insuranceSummary(userId: string, year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw httpError(422, "ปีต้องเป็น ค.ศ. 4 หลัก เช่น 2026");
  }
  const rows = await transactions
    .find({
      userId,
      merchantType: "insurance",
      purchasedAt: { $gte: `${year}-01-01`, $lt: `${year + 1}-01-01` },
    })
    .sort({ purchasedAt: 1 })
    .toArray();

  // ยอดเบี้ยต่อประเภท — ใช้เบี้ยในข้อมูลกรมธรรม์ ถ้าไม่มีใช้ยอดรวมของใบ
  const paid = new Map<string, Decimal>();
  const policies = rows.map((r) => {
    const type = policyTypeOf(r.insurance?.policyType).id;
    const premium = dec(r.insurance?.premium) ?? dec(r.total) ?? new Decimal(0);
    paid.set(type, (paid.get(type) ?? new Decimal(0)).plus(premium));
    return {
      transaction_id: r._id,
      paid_at: r.purchasedAt,
      premium: premium.toFixed(2),
      ...insuranceOut(r.insurance),
      insurer: r.insurance?.insurer ?? r.merchantName,
      policy_type: type,
    };
  });

  const sumOf = (id: string) => paid.get(id) ?? new Decimal(0);
  const capped = (v: Decimal, cap: number) => Decimal.min(v, cap);

  // ประกันชีวิตใช้เพดานก่อน แล้วประกันสุขภาพตนเองได้ส่วนที่เหลือของเพดานรวม 100,000
  const life = capped(sumOf("life"), policyTypeOf("life").cap!);
  const health = Decimal.max(
    0,
    Decimal.min(capped(sumOf("health"), policyTypeOf("health").cap!), new Decimal(LIFE_HEALTH_COMBINED_CAP).minus(life)),
  );
  const deductible: Record<string, Decimal> = {
    life,
    health,
    health_parents: capped(sumOf("health_parents"), policyTypeOf("health_parents").cap!),
    annuity: capped(sumOf("annuity"), policyTypeOf("annuity").cap!),
  };

  const byType = POLICY_TYPES.filter((t) => paid.has(t.id) || t.cap !== null).map((t) => ({
    policy_type: t.id,
    name: t.name,
    premium_paid: sumOf(t.id).toFixed(2),
    cap: t.cap,
    deductible: (deductible[t.id] ?? new Decimal(0)).toFixed(2),
    note: t.note,
  }));

  return {
    year,
    by_type: byType,
    total_premium: [...paid.values()].reduce((a, b) => a.plus(b), new Decimal(0)).toFixed(2),
    total_deductible: Object.values(deductible).reduce((a, b) => a.plus(b), new Decimal(0)).toFixed(2),
    policies,
    disclaimer:
      "ค่าประมาณจากใบเสร็จที่บันทึกไว้ ตรวจกับหนังสือรับรองการชำระเบี้ยประกันและประกาศกรมสรรพากรก่อนยื่นภาษี",
  };
}
