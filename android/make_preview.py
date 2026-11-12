#!/usr/bin/env python3
"""ساخت نسخه تک‌فایل (فونت‌ها و کدها درون فایل) برای پیش‌نمایش و اشتراک‌گذاری"""
import base64, os, re, pathlib
root = pathlib.Path(__file__).parent
web = root / 'web'
html = (web / 'index.html').read_text(encoding='utf-8')
css = (web / 'style.css').read_text(encoding='utf-8')
js = (web / 'app.js').read_text(encoding='utf-8')
xlsx = (web / 'xlsx.js').read_text(encoding='utf-8')

def font_uri(name):
    data = (web / 'fonts' / name).read_bytes()
    return 'data:font/woff2;base64,' + base64.b64encode(data).decode()

css = re.sub(r"url\(fonts/([A-Za-z\-]+\.woff2)\)", lambda m: "url(%s)" % font_uri(m.group(1)), css)
icon192 = 'data:image/png;base64,' + base64.b64encode((web / 'icon-192.png').read_bytes()).decode()

html = html.replace('<link rel="manifest" href="manifest.webmanifest">',
                    '<link rel="apple-touch-icon" href="%s">' % icon192)
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="xlsx.js"></script>', '<script>\n' + xlsx + '\n</script>')
html = html.replace('<script src="app.js"></script>', '<script>\n' + js + '\n</script>')
out = root / 'out' / 'راننده-هوشمند-تک‌فایل.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8')
print('✔', out, round(out.stat().st_size/1024), 'KB')
