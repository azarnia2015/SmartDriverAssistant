#!/usr/bin/env bash
# بارگذاری این پروژه روی GitHub — یک‌بار اجرا کنید
# طرز استفاده:  ./push.sh git@github.com:USERNAME/SmartDriverAssistant.git
set -euo pipefail
REMOTE="${1:-}"
if [ -z "$REMOTE" ]; then
  echo "استفاده: ./push.sh <git-remote-url>"
  echo "مثال:   ./push.sh https://github.com/USERNAME/SmartDriverAssistant.git"
  exit 1
fi
case "$REMOTE" in
  *USERNAME*|*your-user*) echo "❌ در آدرس، USERNAME را با نام کاربری واقعی GitHub خود عوض کنید."; exit 1;;
esac
git init -q 2>/dev/null || true
git add -A
git -c user.name="${GIT_NAME:-Smart Driver Assistant}" \
    -c user.email="${GIT_EMAIL:-dev@example.com}" \
    commit -qm "راننده هوشمند ۲.۰ — نسخهٔ اول" || echo "(چیزی برای کامیت نبود)"
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git push -u origin main
echo "✅ انجام شد: $REMOTE"
