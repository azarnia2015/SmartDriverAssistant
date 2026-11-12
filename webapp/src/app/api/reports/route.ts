import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { shiftReports } from "@/db/schema";

/**
 * همگام‌سازی اختیاری گزارش‌ها (فقط اگر DATABASE_URL تنظیم شده باشد).
 * اپلیکیشن اندروید و نسخهٔ وب بدون این مسیر هم کامل کار می‌کنند.
 */
export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json({ ok: true, storage: "offline", reports: [] });
  try {
    const rows = await db.select().from(shiftReports).limit(200);
    return NextResponse.json({ ok: true, storage: "postgres", reports: rows });
  } catch {
    return NextResponse.json({ ok: false, error: "db-unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, error: "no-database" }, { status: 501 });
  try {
    const body = await request.json();
    const inserted = await db
      .insert(shiftReports)
      .values({
        driverName: String(body.driverName ?? ""),
        plate: String(body.plate ?? ""),
        reportDate: String(body.reportDate ?? ""),
        kmStart: Number(body.kmStart ?? 0),
        kmEnd: Number(body.kmEnd ?? 0),
        distance: Number(body.distance ?? 0),
        fuelUsed: Number(body.fuelUsed ?? 0),
        fuelLoaded: Number(body.fuelLoaded ?? 0),
        consumption: Number(body.consumption ?? 0),
        carsServed: Number(body.carsServed ?? 0),
        trips: Number(body.trips ?? 0),
        cost: Number(body.cost ?? 0),
        score: Number(body.score ?? 0),
        tasks: String(body.tasks ?? ""),
        issues: String(body.issues ?? ""),
        notes: String(body.notes ?? ""),
      })
      .returning();
    return NextResponse.json({ ok: true, report: inserted[0] });
  } catch {
    return NextResponse.json({ ok: false, error: "insert-failed" }, { status: 500 });
  }
}
