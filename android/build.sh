#!/usr/bin/env bash
# ============================================================
#  راننده هوشمند — APK build script (no Gradle needed)
#  aapt2 + javac + d8 + zipalign + apksigner
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
export JAVA_HOME="${JAVA_HOME:-$HOME/work/jdk-17.0.21+9}"
export PATH="$JAVA_HOME/bin:$PATH"
SDK="${ANDROID_HOME:-$HOME/sdk}"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
OUT="$ROOT/build"
KS="$ROOT/keystore.jks"
PASS="driver1405"
VERSION="2.0.0"

echo "▸ cleaning"
rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/dex" "$ROOT/out"

echo "▸ staging web assets"
rm -rf "$ROOT/app/assets"; mkdir -p "$ROOT/app/assets/www"
cp -r "$ROOT/web/." "$ROOT/app/assets/www/"

echo "▸ compiling resources (aapt2)"
"$BT/aapt2" compile --dir "$ROOT/app/res" -o "$OUT/res.zip"

echo "▸ linking package"
"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$PLATFORM" \
  --manifest "$ROOT/app/AndroidManifest.xml" \
  -R "$OUT/res.zip" \
  -A "$ROOT/app/assets" \
  --auto-add-overlay \
  --min-sdk-version 23 \
  --target-sdk-version 34 \
  --version-code 2 --version-name "$VERSION"

echo "▸ compiling java"
find "$ROOT/app/src" -name '*.java' > "$OUT/sources.txt"
javac --release 11 -encoding UTF-8 -nowarn -classpath "$PLATFORM" \
  -d "$OUT/classes" @"$OUT/sources.txt"

echo "▸ dexing (d8)"
find "$OUT/classes" -name '*.class' > "$OUT/classes.txt"
"$BT/d8" --lib "$PLATFORM" --min-api 23 --release --output "$OUT/dex" @"$OUT/classes.txt"

echo "▸ packaging dex"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -uj unsigned.apk dex/classes.dex)

echo "▸ aligning"
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "▸ signing"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias smartdriver -keyalg RSA -keysize 2048 \
    -validity 10950 -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=Smart Driver Assistant, OU=Mobile, O=SmartDriver, L=Tehran, C=IR" >/dev/null 2>&1
fi
cp "$KS" "$OUT/keystore.jks"
APK="$ROOT/out/SmartDriverAssistant-$VERSION.apk"
"$BT/apksigner" sign --ks "$OUT/keystore.jks" --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$APK" "$OUT/aligned.apk"

echo "▸ verifying"
"$BT/apksigner" verify --print-certs "$APK" | head -4
echo
echo "✔ APK: $APK"
ls -lh "$APK" | awk '{print "  size:", $5}'
