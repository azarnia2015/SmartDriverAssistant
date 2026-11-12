"use client";

import { useEffect, useRef } from "react";

/**
 * میزبان نسخهٔ وبِ «راننده هوشمند».
 *
 * رابط کاربری و موتور هوشمند همان فایل‌هایی هستند که داخل APK اندروید قرار می‌گیرند
 * (/app/shell.html + /app/app.js + /app/xlsx.js)؛ بنابراین نسخهٔ وب و اپلیکیشن
 * دقیقاً یک رفتار دارند. همهٔ داده‌ها روی خود دستگاه ذخیره می‌شود (localStorage)
 * و برنامه بدون سرور و بدون اینترنت هم کار می‌کند.
 */
export default function Home() {
  const host = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || !host.current) return;
    loaded.current = true;

    const target = host.current;
    let cancelled = false;

    const loadScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.async = false;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error(`failed: ${src}`));
        document.body.appendChild(el);
      });

    (async () => {
      try {
        const html = await fetch("/app/shell.html", { cache: "force-cache" }).then((r) => r.text());
        if (cancelled) return;
        target.innerHTML = html;
        await loadScript("/app/xlsx.js");
        await loadScript("/app/app.js");
        // موتور به‌صورت خودکار بوت می‌شود (تا زمانی که #app در صفحه باشد)
        const w = window as unknown as { __startDriverApp?: () => void };
        if (w.__startDriverApp) w.__startDriverApp();
      } catch (err) {
        target.innerHTML =
          '<p style="padding:24px;font-family:Tahoma;text-align:center">بارگذاری برنامه ناموفق بود. صفحه را دوباره باز کنید.</p>';
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <div ref={host} id="app-host" />;
}
