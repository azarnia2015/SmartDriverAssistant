import { pgTable, serial, varchar, integer, doublePrecision, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * اسکیمای اختیاری همگام‌سازی آنلاین.
 *
 * اپلیکیشن «راننده هوشمند» کاملاً آفلاین روی گوشی کار می‌کند و به این دیتابیس
 * هیچ نیازی ندارد؛ این جداول فقط برای وقتی است که بخواهید گزارش‌های شیفت را
 * در سرور شرکت هم نگه دارید (داشبورد مدیر، گزارش‌های تجمیعی و ...).
 */
export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  plate: varchar("plate", { length: 64 }).notNull().default(""),
  phone: varchar("phone", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shiftReports = pgTable(
  "shift_reports",
  {
    id: serial("id").primaryKey(),
    driverName: varchar("driver_name", { length: 120 }).notNull().default(""),
    plate: varchar("plate", { length: 64 }).notNull().default(""),
    reportDate: varchar("report_date", { length: 40 }).notNull().default(""),
    kmStart: integer("km_start").default(0).notNull(),
    kmEnd: integer("km_end").default(0).notNull(),
    distance: integer("distance").default(0).notNull(),
    fuelUsed: doublePrecision("fuel_used").default(0).notNull(),
    fuelLoaded: doublePrecision("fuel_loaded").default(0).notNull(),
    consumption: doublePrecision("consumption").default(0).notNull(),
    carsServed: integer("cars_served").default(0).notNull(),
    trips: integer("trips").default(0).notNull(),
    cost: integer("cost").default(0).notNull(),
    score: integer("score").default(0).notNull(),
    tasks: text("tasks").default("").notNull(),
    issues: text("issues").default("").notNull(),
    notes: text("notes").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("shift_reports_date_idx").on(t.reportDate)],
);

export type ShiftReport = typeof shiftReports.$inferSelect;
export type NewShiftReport = typeof shiftReports.$inferInsert;
