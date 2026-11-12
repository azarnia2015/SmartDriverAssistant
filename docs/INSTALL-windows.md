# نصب روی ویندوز (۱۰ / ۱۱ — ۶۴ بیتی)

## الف) نسخهٔ سبک — بدون دسترسی مدیر (~۸۱۰ کیلوبایت)
1. `SmartDriverAssistant-Windows-lite.zip` را از حالت فشرده خارج کنید.
2. روی `Install.bat` دوبار کلیک کنید.
3. میان‌بر **راننده هوشمند** روی Desktop و Start Menu ساخته می‌شود و برنامه در پنجرهٔ مستقل Edge/Chrome باز می‌شود.
4. حذف: پوشهٔ `%LOCALAPPDATA%\SmartDriverAssistant` و میان‌برها را پاک کنید.

## ب) نسخهٔ مستقل Electron (~۱۱۰ مگابایت)
1. `SmartDriverAssistant-Windows-portable.zip` را خارج کنید.
2. `SmartDriverAssistant.exe` را اجرا کنید (Chromium درون‌بسته؛ مرورگر لازم نیست).
3. میان‌بر: کلیک راست روی exe → Send to → Desktop (create shortcut).

## SmartScreen
چون فایل‌ها با گواهی تجاری امضا نشده‌اند: **More info → Run anyway**.

## ساخت نصب‌کنندهٔ رسمی
```bat
cd desktop
npm install
npx electron-builder --win nsis
:: dist/SmartDriverAssistant-Setup-2.0.0.exe  (نصب + حذف + میان‌بر)
```
روی لینوکس پیش از آن `sudo apt install wine wine64` لازم است.

## محدودیت ویندوز
تشخیص گفتار میکروفون در Electron/مرورگر دسکتاپ در دسترس نیست؛ ورودی با تایپ انجام می‌شود
(محاسبات، تحلیل و خروجی اکسل کامل کار می‌کند). برای مصاحبهٔ صوتی از نسخهٔ اندروید استفاده کنید.
