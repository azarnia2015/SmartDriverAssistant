import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "راننده هوشمند | دستیار هوشمند رانندگان",
  description:
    "دستیار آفلاین رانندگان: گزارش گفت‌وگویی با صدا، محاسبه مصرف و هزینه، خروجی اکسل برای مدیر. همه‌چیز روی گوشی و بدون سرور.",
  applicationName: "راننده هوشمند",
  manifest: "/app/manifest.webmanifest",
  icons: { icon: "/app/icon-192.png", apple: "/app/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F5EFE3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
