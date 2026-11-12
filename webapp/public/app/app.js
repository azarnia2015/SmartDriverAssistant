/* ============================================================
   راننده هوشمند ۲.۰ — Smart Driver Assistant
   · گزارش گفت‌وگویی (سؤال صوتی + پاسخ صوتی)
   · NLU فارسی روی دستگاه
   · خروجی اکسل چندبرگی (آفلاین)
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var BOOTED = false;

  /* ---------------- utils ---------------- */
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  function toEn(s) {
    return String(s == null ? '' : s)
      .replace(/[۰-۹]/g, function (d) { return FA.indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; })
      .replace(/٫/g, '.').replace(/،/g, ',').replace(/٬/g, ',');
  }
  function toFa(s) { return String(s == null ? '' : s).replace(/[0-9]/g, function (d) { return FA[+d]; }); }
  function num(v) {
    var n = parseFloat(toEn(v).replace(/[^\d.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function fmt(n, dec) {
    if (!isFinite(n)) return '—';
    var d = dec == null ? 0 : dec;
    var s = Math.abs(n) >= 1000 && d === 0
      ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toString();
    return toFa(s);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  var hasNative = function () { return !!(window.Android && Android.listen); };
  function vibrate(ms) {
    if (S.settings.haptic === false) return;
    if (window.Android && Android.vibrate) { try { Android.vibrate(ms || 12); } catch (e) {} }
    else if (navigator.vibrate) { try { navigator.vibrate(ms || 12); } catch (e) {} }
  }

  /* ---------------- jalali ---------------- */
  var JM = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  function g2j(gy, gm, gd) {
    var gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var jy = gy <= 1600 ? 0 : 979;
    gy -= gy <= 1600 ? 621 : 1600;
    var gy2 = gm > 2 ? gy + 1 : gy;
    var days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
      Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
    jy += 33 * Math.floor(days / 12053); days %= 12053;
    jy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    var jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    var jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }
  function jOf(d) { return g2j(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function jalaliStr(d) { var j = jOf(d); return toFa(j[2]) + ' ' + JM[j[1] - 1] + ' ' + toFa(j[0]); }
  function jalaliShort(d) { var j = jOf(d); return toFa(j[2]) + ' ' + JM[j[1] - 1]; }
  function timeStr(d) { return toFa(('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)); }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* ---------------- state ---------------- */
  var KEY = 'driver_assistant_v2';
  var OLDKEY = 'driver_assistant_v1';
  var S = {
    profile: { name: '', plate: '', price: 1500, target: 35, interval: 10000, tank: 0, manager: '' },
    settings: { speak: true, haptic: true, autosave: true, readQuestions: true, autoListen: true },
    draft: {},
    reports: []
  };
  var FIELDS = ['name', 'plate', 'kmS', 'kmE', 'dist', 'fuel', 'loaded', 'served', 'trips', 'price', 'tasks', 'issues', 'notes'];
  var NUMERIC = { kmS: 1, kmE: 1, dist: 1, fuel: 1, loaded: 1, served: 1, trips: 1, price: 1 };

  function load() {
    try {
      var raw = localStorage.getItem(KEY) || localStorage.getItem(OLDKEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o.profile) Object.assign(S.profile, o.profile);
        if (o.settings) {
          Object.assign(S.settings, o.settings);
          if (o.settings.readQuestions === undefined) S.settings.readQuestions = true;
          if (o.settings.autoListen === undefined) S.settings.autoListen = true;
        }
        if (o.draft) S.draft = o.draft;
        if (Array.isArray(o.reports)) S.reports = o.reports;
      }
    } catch (e) {}
  }
  var saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 180);
  }

  /* ---------------- calc ---------------- */
  function getVal(id) { var el = $('#f-' + id); return el ? el.value.trim() : (S.draft[id] || ''); }
  function compute() {
    var d = {};
    FIELDS.forEach(function (f) { d[f] = getVal(f); });
    var kmS = num(d.kmS), kmE = num(d.kmE), dist = num(d.dist), distAuto = false;
    if (!dist && kmS && kmE && kmE >= kmS) { dist = kmE - kmS; distAuto = true; }
    var fuel = num(d.fuel), loaded = num(d.loaded), served = num(d.served), trips = num(d.trips);
    var price = num(d.price) || num(S.profile.price) || 0;
    var cons = dist > 0 && fuel > 0 ? (fuel / dist) * 100 : 0;
    var cost = fuel * price;
    var costPerKm = dist > 0 ? cost / dist : 0;
    var perVehicle = served > 0 ? loaded / served : 0;
    var perTrip = trips > 0 ? dist / trips : 0;
    var target = num(S.profile.target) || 35;
    var completeness = 0;
    ['name', 'plate', 'kmS', 'kmE', 'fuel', 'tasks'].forEach(function (k) { if (d[k]) completeness += 1 / 6; });
    if (dist > 0) completeness = Math.min(1, completeness + 0.05);

    var score = 0;
    if (dist > 0 || fuel > 0) {
      score = 52 + completeness * 20;
      if (cons > 0) {
        var ratio = cons / target;
        score += ratio <= 0.9 ? 22 : ratio <= 1 ? 16 : ratio <= 1.15 ? 6 : -clamp((ratio - 1.15) * 70, 0, 18);
      } else score += 8;
      if (d.issues && d.issues.length > 2) score -= 8; else score += 6;
      if (kmE && kmS && kmE < kmS) score -= 22;
      score = clamp(Math.round(score), 0, 100);
    }
    return {
      d: d, kmS: kmS, kmE: kmE, dist: dist, distAuto: distAuto, fuel: fuel, loaded: loaded,
      served: served, trips: trips, price: price, cons: cons, cost: cost, costPerKm: costPerKm,
      perVehicle: perVehicle, perTrip: perTrip, target: target, completeness: completeness, score: score
    };
  }

  /* ---------------- text report ---------------- */
  function buildReport(m) {
    var d = m.d;
    var L = [
      '📋 گزارش روزانه راننده',
      'تاریخ: ' + ($('#f-date').value || jalaliStr(new Date())),
      'راننده: ' + (d.name || S.profile.name || '—'),
      'پلاک: ' + (d.plate || S.profile.plate || '—'),
      '',
      '— کیلومتر —',
      'کیلومتر شروع: ' + (d.kmS || '—'),
      'کیلومتر پایان: ' + (d.kmE || '—'),
      'مسافت طی‌شده: ' + (m.dist ? fmt(m.dist) + ' کیلومتر' : '—'),
      '',
      '— سوخت و عملیات —',
      'سوخت مصرفی خودرو: ' + (d.fuel ? fmt(m.fuel, 1) + ' لیتر' : '—'),
      'سوخت بارگیری‌شده در مخازن: ' + (d.loaded ? fmt(m.loaded, 1) + ' لیتر' : '—'),
      'تعداد خودروهای سوخت‌رسانی‌شده: ' + (d.served ? fmt(m.served) : '—'),
      'تعداد سفر/بار: ' + (d.trips ? fmt(m.trips) : '—'),
      'کارهای انجام‌شده: ' + (d.tasks || '—'),
      'مشکلات و خرابی: ' + (d.issues || 'ندارد')
    ];
    if (d.notes) L.push('توضیحات: ' + d.notes);
    L.push('', '— تحلیل هوشمند —');
    if (m.cons) L.push('مصرف: ' + fmt(m.cons, 1) + ' لیتر در ۱۰۰ کیلومتر');
    if (m.cost) L.push('هزینه سوخت: ' + fmt(m.cost) + ' تومان' + (m.costPerKm ? ' (' + fmt(m.costPerKm) + ' تومان/کیلومتر)' : ''));
    if (m.perVehicle) L.push('میانگین هر خودرو: ' + fmt(m.perVehicle, 1) + ' لیتر');
    L.push('امتیاز عملکرد روز: ' + fmt(m.score) + ' از ۱۰۰');
    return L.join('\n');
  }

  /* ---------------- insights ---------------- */
  function baselineCons() {
    var arr = S.reports.filter(function (r) { return r.cons > 0; }).slice(-10).map(function (r) { return r.cons; });
    if (!arr.length) return 0;
    return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
  }
  function I(type, icon, title, body) { return { type: type, icon: icon, title: title, body: body }; }
  var ICON_SVG = { spark: 'i-spark', warn: 'i-warn', check: 'i-check', coin: 'i-coin', fuel: 'i-fuel', car: 'i-car', road: 'i-road', clock: 'i-clock', chart: 'i-chart', save: 'i-save', mic: 'i-mic' };

  function insights(m) {
    var out = [], d = m.d, base = baselineCons(), target = m.target;
    if (!m.dist && !m.fuel) {
      out.push(I('info', 'mic', 'گزارش گفت‌وگویی را امتحان کنید', 'دکمهٔ «گزارش گفت‌وگویی» را بزنید؛ دستیار سؤال‌ها را بلند می‌خواند و شما فقط جواب می‌دهید.'));
      if (!d.name && S.profile.name) out.push(I('info', 'clock', 'پروفایل شما آماده است', 'نام و پلاک برای گزارش‌های بعدی خودکار پر می‌شود.'));
      return out.concat(extraReports());
    }
    if (m.kmS && m.kmE && m.kmE < m.kmS) out.push(I('bad', 'warn', 'کیلومتر پایان کمتر از شروع است', 'مقادیر کیلومتر را بررسی کنید؛ مسافت منفی محاسبه نمی‌شود.'));
    if (m.cons) {
      var ref = base || target, dev = ((m.cons - ref) / ref) * 100;
      if (dev > 18) out.push(I('bad', 'warn', 'مصرف ' + fmt(Math.abs(dev)) + '٪ بالاتر از حد انتظار', 'فشار باد لاستیک‌ها، بار اضافه و درجا کار کردن موتور را بررسی کنید.'));
      else if (dev > 6) out.push(I('warn', 'warn', 'مصرف کمی بیشتر از میانگین', 'اختلاف ' + fmt(dev) + '٪ با میانگین ' + fmt(ref, 1) + ' لیتر است؛ مسیر کوهستانی و ترافیک را در نظر بگیرید.'));
      else if (dev < -8) out.push(I('ok', 'check', 'مصرف بهینه ثبت شد', 'مصرف شما ' + fmt(Math.abs(dev)) + '٪ کمتر از میانگین است.'));
      else out.push(I('ok', 'check', 'مصرف در محدودهٔ نرمال', fmt(m.cons, 1) + ' لیتر در ۱۰۰ کیلومتر؛ در محدودهٔ هدف ' + fmt(target, 1) + ' لیتر.'));
    } else if (m.dist > 0) out.push(I('info', 'fuel', 'سوخت مصرفی ثبت نشده', 'برای محاسبهٔ دقیق مصرف، لیتر سوخت مصرفی خودرو را وارد کنید.'));
    if (m.cost) out.push(I('info', 'coin', 'هزینهٔ سوخت امروز: ' + fmt(m.cost) + ' تومان',
      m.costPerKm ? 'به‌ازای هر کیلومتر ' + fmt(m.costPerKm) + ' تومان؛ با ' + fmt(m.dist) + ' کیلومتر پیمایش.' : 'قیمت هر لیتر را در تنظیمات به‌روز کنید.'));
    if (m.perVehicle && m.loaded) {
      if (m.perVehicle > 90) out.push(I('warn', 'car', 'میانگین تحویل هر خودرو ' + fmt(m.perVehicle, 1) + ' لیتر', 'این عدد بالاست؛ تعداد خودروها یا مقدار بارگیری را بررسی کنید.'));
      else out.push(I('ok', 'car', 'تحویل به ' + fmt(m.served) + ' خودرو انجام شد', 'میانگین ' + fmt(m.perVehicle, 1) + ' لیتر برای هر خودرو.'));
    }
    if (m.perTrip > 0 && m.perTrip > 700) out.push(I('warn', 'road', 'میانگین ' + fmt(m.perTrip) + ' کیلومتر برای هر سفر', 'فاصلهٔ زیاد با تعداد سفر ثبت‌شده هم‌خوان نیست؛ تعداد سفر را کنترل کنید.'));
    if (d.issues && d.issues.length > 2) out.push(I('bad', 'warn', 'خرابی ثبت‌شده', '«' + d.issues.slice(0, 60) + '» — پیش از سفر بعدی به تعمیرگاه اطلاع دهید.'));
    var interval = num(S.profile.interval);
    if (interval && m.kmE) {
      var rem = interval - (m.kmE % interval);
      if (rem <= 500) out.push(I('warn', 'clock', 'سرویس دوره‌ای نزدیک است', fmt(rem) + ' کیلومتر تا سرویس بعدی باقی مانده؛ زمان مراجعه را رزرو کنید.'));
    }
    var tank = num(S.profile.tank);
    if (tank && m.loaded > tank) out.push(I('warn', 'fuel', 'بارگیری بیشتر از ظرفیت مخزن', 'ظرفیت ثبت‌شده ' + fmt(tank) + ' لیتر است اما ' + fmt(m.loaded) + ' لیتر بارگیری شده.'));
    if (base && m.cons && Math.abs(((m.cons - base) / base) * 100) < 6) out.push(I('info', 'chart', 'روند پایدار در ' + fmt(S.reports.length + 1) + ' گزارش', 'میانگین مصرف شما ' + fmt(base, 1) + ' لیتر در ۱۰۰ کیلومتر است.'));
    return out.slice(0, 6);
  }
  function extraReports() {
    if (S.reports.length) {
      var last = S.reports[S.reports.length - 1];
      return [I('info', 'clock', 'آخرین گزارش: ' + last.dateFa, 'مسافت ' + fmt(last.dist) + ' کیلومتر با امتیاز ' + fmt(last.score) + '.')];
    }
    return [];
  }

  function renderInsights(m) {
    var list = insights(m);
    $('#insights').innerHTML = list.map(function (x) {
      return '<div class="ins-item t-' + x.type + '"><div class="ic"><svg><use href="#' + (ICON_SVG[x.icon] || 'i-spark') + '"/></svg></div>' +
        '<div><b>' + esc(x.title) + '</b><p>' + esc(x.body) + '</p></div></div>';
    }).join('');
    $('#insight-count').textContent = list.length ? fmt(list.length) + ' نکته' : '';
  }

  /* ---------------- hero / preview ---------------- */
  var lastScore = -1;
  function renderHero(m) {
    var score = m.score, circ = 2 * Math.PI * 50;
    $('#ring-fg').style.strokeDasharray = circ;
    $('#ring-fg').style.strokeDashoffset = circ - (circ * score) / 100;
    if (score !== lastScore) {
      var numEl = $('#hero-score');
      if (score === 0) { numEl.textContent = '—'; numEl.classList.add('no-data'); }
      else { numEl.classList.remove('no-data'); animateNum(numEl, lastScore < 0 ? 0 : lastScore, score, 700, 0); }
      lastScore = score;
    }
    var badge = $('#hero-badge');
    if (score === 0) { badge.textContent = 'در انتظار داده'; badge.className = 'badge'; }
    else if (score >= 80) { badge.textContent = 'عملکرد ممتاز'; badge.className = 'badge good'; }
    else if (score >= 60) { badge.textContent = 'عملکرد خوب'; badge.className = 'badge good'; }
    else { badge.textContent = 'نیازمند توجه'; badge.className = 'badge warn'; }
    $('#hs-dist').textContent = m.dist ? fmt(m.dist) : '—';
    $('#hs-cons').textContent = m.cons ? fmt(m.cons, 1) : '—';
    $('#hs-cost').textContent = m.cost ? fmt(m.cost) : '—';
    $('#dist-note').textContent = m.distAuto
      ? 'مسافت خودکار: ' + fmt(m.kmE) + ' − ' + fmt(m.kmS) + ' = ' + fmt(m.dist) + ' کیلومتر'
      : 'فاصله به‌صورت خودکار محاسبه می‌شود.';
    $('#dist-note').className = 'auto-note' + (m.distAuto ? ' ok' : '');
  }
  function animateNum(el, from, to, dur, dec) {
    var t0 = performance.now();
    function step(t) {
      var p = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e, dec);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------------- form binding ---------------- */
  function fillForm(obj) {
    FIELDS.forEach(function (f) {
      var el = $('#f-' + f);
      if (el && obj[f] != null) el.value = obj[f];
    });
    var el = $('#f-dist');
    if (el) el.dataset.manual = obj.dist ? '1' : '';
  }
  function currentForm() {
    var o = {};
    FIELDS.forEach(function (f) { o[f] = getVal(f); });
    return o;
  }
  function refresh() {
    var m = compute();
    renderHero(m);
    renderInsights(m);
    $('#preview').textContent = buildReport(m);
    if (S.settings.autosave !== false) { S.draft = currentForm(); save(); }
    return m;
  }

  /* ---------------- reports ---------------- */
  function recordReport() {
    var m = compute();
    if (!m.dist && !m.fuel) { toast('اول کیلومتر یا سوخت را وارد کنید'); return null; }
    var now = new Date();
    var rec = {
      ts: now.getTime(), dateFa: jalaliStr(now), dateShort: jalaliShort(now), time: timeStr(now),
      fields: currentForm(), dist: m.dist, fuel: m.fuel, loaded: m.loaded, served: m.served,
      trips: m.trips, cons: m.cons, cost: m.cost, score: m.score
    };
    S.reports.push(rec);
    if (S.reports.length > 200) S.reports = S.reports.slice(-200);
    if (m.d.name) S.profile.name = m.d.name;
    if (m.d.plate) S.profile.plate = m.d.plate;
    save(); renderHistory(); toast('گزارش ثبت شد ✓'); vibrate(24);
    return rec;
  }

  function renderHistory() {
    var list = S.reports.slice().reverse();
    var emptyHtml = '<div class="empty">هنوز گزارشی ثبت نشده است. با «گزارش گفت‌وگویی» در چند ثانیه ثبت کنید.</div>';
    var rowHtml = list.map(function (r, i) {
      return '<div class="rc" data-idx="' + (S.reports.length - 1 - i) + '">' +
        '<div class="rc-score" style="--p:' + clamp(r.score, 0, 100) + '%"><span>' + fmt(r.score) + '</span></div>' +
        '<div class="rc-main"><b>' + esc(r.dateFa) + ' · ' + esc(r.time) + '</b>' +
        '<small>' + fmt(r.dist) + ' کیلومتر · ' + (r.cons ? fmt(r.cons, 1) + ' لیتر/۱۰۰کم' : 'مصرف ثبت نشده') + '</small></div>' +
        '<span class="rc-go">›</span></div>';
    }).join('');
    $('#history-list').innerHTML = list.length ? rowHtml : emptyHtml;
    $('#recent').innerHTML = list.length ? list.slice(0, 3).map(function (r, i) {
      return '<div class="rc" data-idx="' + (S.reports.length - 1 - i) + '">' +
        '<div class="rc-score" style="--p:' + clamp(r.score, 0, 100) + '%"><span>' + fmt(r.score) + '</span></div>' +
        '<div class="rc-main"><b>' + esc(r.dateShort) + '</b><small>' + fmt(r.dist) + ' کیلومتر · ' + (r.cons ? fmt(r.cons, 1) + ' لیتر/۱۰۰کم' : '—') + '</small></div>' +
        '<span class="rc-go">›</span></div>';
    }).join('') : emptyHtml;
    renderKPIs(); drawChart();
  }
  function loadRecord(i) {
    var r = S.reports[i];
    if (!r) return;
    fillForm(r.fields); refresh(); go('report'); toast('گزارش ' + r.dateFa + ' بارگذاری شد');
  }
  function renderKPIs() {
    var dist = 0, fuel = 0, cs = 0, cn = 0;
    S.reports.slice(-14).forEach(function (r) {
      dist += r.dist || 0; fuel += r.fuel || 0;
      if (r.cons > 0) { cs += r.cons; cn++; }
    });
    $('#k-dist').textContent = dist ? fmt(dist) : '—';
    $('#k-fuel').textContent = fuel ? fmt(fuel) : '—';
    $('#k-cons').textContent = cn ? fmt(cs / cn, 1) : '—';
    $('#k-count').textContent = S.reports.length ? fmt(S.reports.length) : '—';
  }

  /* ---------------- chart (light theme) ---------------- */
  function drawChart() {
    var cv = $('#chart');
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1;
    var W = cv.clientWidth || 340, H = 210;
    if (W < 160) W = 340;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    var data = S.reports.slice(-7);
    if (!data.length) {
      g.fillStyle = 'rgba(36,30,22,.35)'; g.font = '13px Vazirmatn, sans-serif'; g.textAlign = 'center';
      g.fillText('برای نمایش نمودار، گزارش ثبت کنید', W / 2, H / 2);
      return;
    }
    var padL = 36, padR = 12, padT = 16, padB = 30;
    var cw = W - padL - padR, ch = H - padT - padB;
    if (cw <= 0 || ch <= 0) return;
    var maxDist = Math.max.apply(null, data.map(function (r) { return r.dist || 0; }).concat([10]));
    var maxCons = Math.max.apply(null, data.map(function (r) { return r.cons || 0; }).concat([10]));
    g.strokeStyle = 'rgba(36,30,22,.08)'; g.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var y = padT + (ch / 4) * i;
      g.beginPath(); g.moveTo(padL, y); g.lineTo(W - padR, y); g.stroke();
    }
    var n = data.length, slot = cw / n, bw = Math.min(26, slot * 0.46);
    data.forEach(function (r, i) {
      var x = padL + slot * i + slot / 2;
      var h = ch * ((r.dist || 0) / maxDist);
      var grad = g.createLinearGradient(0, padT + ch - h, 0, padT + ch);
      grad.addColorStop(0, '#C9A227'); grad.addColorStop(1, 'rgba(233,214,166,.55)');
      g.fillStyle = grad;
      g.shadowColor = 'rgba(169,128,60,.35)'; g.shadowBlur = 10;
      roundRect(g, x - bw / 2, padT + ch - h, bw, Math.max(h, 2), 6); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(36,30,22,.45)'; g.font = '10px Vazirmatn, sans-serif'; g.textAlign = 'center';
      g.fillText(r.dateShort || '', x, H - 10);
    });
    g.beginPath();
    data.forEach(function (r, i) {
      var x = padL + slot * i + slot / 2;
      var y = padT + ch - ch * ((r.cons || 0) / maxCons) * 0.92;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = '#0D7D63'; g.lineWidth = 2.4;
    g.shadowColor = 'rgba(13,125,99,.4)'; g.shadowBlur = 10; g.stroke(); g.shadowBlur = 0;
    data.forEach(function (r, i) {
      if (!r.cons) return;
      var x = padL + slot * i + slot / 2;
      var y = padT + ch - ch * (r.cons / maxCons) * 0.92;
      g.beginPath(); g.arc(x, y, 3.4, 0, 7);
      g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = '#0D7D63'; g.lineWidth = 2; g.stroke();
    });
    g.fillStyle = 'rgba(36,30,22,.4)'; g.font = '10px Vazirmatn, sans-serif'; g.textAlign = 'left';
    g.fillText(fmt(maxDist), 4, padT + 8);
    g.fillText('۰', 4, padT + ch + 3);
  }
  function roundRect(g, x, y, w, h, r) {
    if (!(w > 0) || !(h > 0)) return;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /* ============================================================
     SPEECH  (native Android SpeechRecognizer → fallback Web Speech)
     ============================================================ */
  var speakCb = null, speakTimer = null;
  function speak(text, onEnd) {
    if (!text) { if (onEnd) onEnd(); return; }
    clearTimeout(speakTimer);
    speakCb = onEnd || null;
    var done = function () {
      clearTimeout(speakTimer);
      var cb = speakCb; speakCb = null;
      if (cb) cb();
    };
    speakTimer = setTimeout(done, Math.min(14000, 1600 + text.length * 95));
    if (window.Android && Android.speak) {
      try { Android.speak(text); } catch (e) { done(); }
      return;
    }
    if (window.speechSynthesis) {
      try {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'fa-IR'; u.rate = 1;
        u.onend = done; u.onerror = done;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        return;
      } catch (e) {}
    }
    setTimeout(done, 350);
  }
  window.__onSpeakDone = function () {
    clearTimeout(speakTimer);
    var cb = speakCb; speakCb = null;
    if (cb) cb();
  };

  var WebSR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var Rec = { active: false, mode: null, web: null, opts: null };

  function startRecognition(opts) {
    if (Rec.active) stopRecognition();
    Rec.opts = opts || {};
    Rec.active = true;

    // 1) native bridge (best quality on Android)
    if (window.Android && Android.startListening) {
      Rec.mode = 'native';
      try { Android.startListening(!!Rec.opts.continuous); }
      catch (e) { Rec.active = false; failSpeech('start-failed'); }
      return;
    }
    // 2) legacy bridge (RecognizerIntent dialog)
    if (window.Android && Android.listen) {
      Rec.mode = 'legacy';
      window.__speechCb = function (text, ok) {
        Rec.active = false;
        if (ok && text) { if (Rec.opts.onFinal) Rec.opts.onFinal(text); }
        else if (Rec.opts.onError) Rec.opts.onError('no-speech');
      };
      try { Android.listen(); } catch (e) { Rec.active = false; failSpeech('start-failed'); }
      return;
    }
    // 3) browser
    if (!WebSR) { Rec.active = false; failSpeech('unsupported'); return; }
    Rec.mode = 'web';
    var rec = new WebSR();
    rec.lang = 'fa-IR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = function (e) {
      var finalTxt = '', interimTxt = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finalTxt += r[0].transcript; else interimTxt += r[0].transcript;
      }
      if (interimTxt && Rec.opts.onPartial) Rec.opts.onPartial(interimTxt.trim());
      if (finalTxt) { Rec.active = false; if (Rec.opts.onFinal) Rec.opts.onFinal(finalTxt.trim()); }
    };
    rec.onerror = function (e) {
      Rec.active = false;
      if (Rec.opts.onError) Rec.opts.onError(e.error || 'error');
    };
    rec.onend = function () {
      if (Rec.active) { Rec.active = false; if (Rec.opts.onError) Rec.opts.onError('silence'); }
    };
    Rec.web = rec;
    try { rec.start(); } catch (e) { Rec.active = false; failSpeech('start-failed'); }
  }
  function stopRecognition() {
    if (!Rec.active) return;
    Rec.active = false;
    if (Rec.mode === 'native' && window.Android && Android.stopListening) { try { Android.stopListening(); } catch (e) {} }
    else if (Rec.mode === 'web' && Rec.web) { try { Rec.web.stop(); } catch (e) {} }
  }
  function failSpeech(code) {
    if (Rec.opts && Rec.opts.onError) Rec.opts.onError(code || 'error');
  }
  /* native events */
  window.__onSpeechResult = function (text, isFinal) {
    if (!Rec.active && !isFinal) return;
    if (!isFinal) { if (Rec.opts && Rec.opts.onPartial) Rec.opts.onPartial(text); return; }
    Rec.active = false;
    if (Rec.opts && Rec.opts.onFinal) Rec.opts.onFinal(text);
  };
  window.__onSpeechState = function (state, msg) {
    if (state === 'error') {
      Rec.active = false;
      if (Rec.opts && Rec.opts.onError) Rec.opts.onError(msg || 'error');
    } else if (state === 'listening') {
      if (Rec.opts && Rec.opts.onStart) Rec.opts.onStart();
    }
  };
  window.__onSpeech = function (text, ok) {
    if (typeof window.__speechCb === 'function') { var cb = window.__speechCb; window.__speechCb = null; cb(text, ok); }
  };

  function errMsg(code) {
    if (code === 'unsupported') return 'تشخیص گفتار در این دستگاه نصب نیست؛ لطفاً تایپ کنید.';
    if (code === 'not-allowed' || code === 'permission') return 'اجازهٔ میکروفون داده نشد.';
    if (code === 'network') return 'برای تشخیص گفتار اتصال لازم است (بستهٔ آفلاین زبان فارسی را نصب کنید).';
    if (code === 'no-speech' || code === 'silence' || code === '7') return 'صدایی شنیده نشد؛ دوباره بگویید.';
    return 'دوباره تلاش کنید.';
  }
  function status(t) { var el = $('#mic-status'); if (el) el.textContent = t || ''; }

  /* ============================================================
     VOICE INTERVIEW  (گزارش گفت‌وگویی)
     ============================================================ */
  var QUESTIONS = [
    { key: 'name', q: 'اول، اسم و نام خانوادگی‌ات را بگو.', short: 'نام راننده', type: 'text', tip: 'مثلاً: رضا محمدی' },
    { key: 'plate', q: 'پلاک خودرو را بگو.', short: 'پلاک', type: 'text', tip: 'مثلاً: ۱۲ ب ۳۴۵ ایران ۶۷' },
    { key: 'kmS', q: 'کیلومتر شروع کار امروز چند بود؟', short: 'کیلومتر شروع', type: 'num', tip: 'عدد را واضح بگو' },
    { key: 'kmE', q: 'الان کیلومترشمار چند است؟', short: 'کیلومتر پایان', type: 'num', tip: 'عدد پایان شیفت' },
    { key: 'dist', q: 'اگر مسافت را جدا می‌دانی بگو، وگرنه بگو «خودکار».', short: 'مسافت', type: 'num', tip: 'با کیلومترها خودکار حساب می‌شود' },
    { key: 'fuel', q: 'امروز چند لیتر سوخت مصرف کردی؟', short: 'سوخت مصرفی', type: 'num', tip: 'لیتر — مثلاً ۶۵' },
    { key: 'loaded', q: 'چند لیتر سوخت در مخازن بارگیری کردی؟', short: 'بارگیری', type: 'num', tip: 'لیتر بارگیری‌شده' },
    { key: 'served', q: 'به چند خودرو سوخت رساندی؟', short: 'خودروها', type: 'num', tip: 'تعداد خودرو' },
    { key: 'trips', q: 'چند سفر یا بار داشتی؟', short: 'سفرها', type: 'num', tip: 'تعداد سفر' },
    { key: 'tasks', q: 'کارهایی که امروز انجام دادی را بگو؛ وقتی تمام شد بگو «تمام».', short: 'کارها', type: 'long', tip: 'می‌توانی چند جمله بگویی' },
    { key: 'issues', q: 'مشکل یا خرابی داشتی؟ اگر نداشتی بگو «ندارم».', short: 'مشکلات', type: 'text', tip: 'اگر نداری: ندارم' },
    { key: 'notes', q: 'توضیح تکمیلی داری؟ اگر نه بگو «رد کن».', short: 'توضیحات', type: 'text', tip: 'اختیاری' },
    { key: '__final', q: 'همه‌چیز آماده است. گزارش ثبت شود و فایل اکسل ساخته شود؟', short: 'تأیید نهایی', type: 'confirm', tip: 'بگو: بله یا نه' }
  ];
  var IV = { active: false, i: 0, listening: false, heard: '', answers: {}, value: null };

  function ivEl(id) { return document.getElementById(id); }
  function setOrb(cls) {
    var m = ivEl('iv-mic');
    if (!m) return;
    m.classList.remove('listening', 'speaking');
    if (cls) m.classList.add(cls);
    ivEl('iv-wave').classList.toggle('on', cls === 'listening');
  }
  function ivHint(t) { ivEl('iv-hint').textContent = t || ''; }
  function questionText(q) {
    if (q.key === 'name' && S.profile.name) return 'اسمت را قبلاً «' + S.profile.name + '» ثبت کرده‌ام. اگر درست است بگو «همان» یا اسم جدید را بگو.';
    if (q.key === 'plate' && S.profile.plate) return 'پلاک ثبت‌شده «' + S.profile.plate + '» است. اگر همان است بگو «همان» یا پلاک جدید را بگو.';
    return q.q;
  }

  function openInterview(startAt) {
    IV.active = true;
    IV.i = typeof startAt === 'number' ? startAt : 0;
    var el = ivEl('interview');
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    vibrate(12);
    renderStep();
  }
  function closeInterview(silent) {
    IV.active = false; IV.listening = false;
    stopRecognition();
    if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) {} }
    if (window.Android && Android.stopSpeaking) { try { Android.stopSpeaking(); } catch (e) {} }
    var el = ivEl('interview');
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    setOrb(null);
    refresh();
    if (!silent) toast('گفت‌وگو بسته شد');
  }

  function renderStep() {
    var q = QUESTIONS[IV.i];
    if (!q) { finishInterview(); return; }
    ivEl('iv-count').textContent = toFa(IV.i + 1) + ' / ' + toFa(QUESTIONS.length);
    ivEl('iv-bar').style.width = Math.round(((IV.i) / QUESTIONS.length) * 100) + '%';
    ivEl('iv-q').textContent = questionText(q);
    var cur = q.key === '__final' ? '' : getVal(q.key);
    var ans = ivEl('iv-answer');
    if (q.key === '__final') {
      var m = compute();
      ans.textContent = 'مسافت ' + fmt(m.dist) + ' کیلومتر · سوخت ' + fmt(m.fuel, 1) + ' لیتر · امتیاز ' + fmt(m.score);
    } else if (cur) {
      ans.textContent = 'مقدار فعلی: ' + (NUMERIC[q.key] ? fmt(num(cur), 1) : cur);
    } else {
      ans.textContent = q.tip || 'پاسخ شما اینجا نمایش داده می‌شود';
    }
    ans.classList.toggle('filled', !!cur && q.key !== '__final');
    ivHint(q.type === 'confirm' ? 'بگو «بله» یا «نه»' : 'برای پاسخ، دکمهٔ سبز را بزن یا منتظر بمان…');
    askAndListen();
  }

  function askAndListen() {
    var q = QUESTIONS[IV.i];
    if (!q) return;
    var read = S.settings.readQuestions !== false;
    setOrb(read ? 'speaking' : null);
    ivHint(read ? 'دستیار سؤال را می‌خواند…' : 'آمادهٔ شنیدن پاسخ…');
    if (read) {
      speak(questionText(q), function () {
        if (!IV.active) return;
        if (S.settings.autoListen !== false) ivListen();
        else { setOrb(null); ivHint('دکمهٔ سبز را بزن و پاسخ بده'); }
      });
    } else if (S.settings.autoListen !== false) {
      ivListen();
    } else {
      setOrb(null); ivHint('دکمهٔ سبز را بزن و پاسخ بده');
    }
  }

  function ivListen() {
    if (!IV.active || IV.listening) return;
    IV.listening = true; IV.heard = '';
    setOrb('listening');
    ivHint('می‌شنوم… صحبت کن');
    startRecognition({
      continuous: true,
      onPartial: function (t) { IV.heard = t; ivEl('iv-answer').textContent = t; ivEl('iv-answer').classList.remove('filled'); },
      onFinal: function (t) { IV.listening = false; stopRecognition(); handleAnswer(t); },
      onError: function (code) {
        IV.listening = false; setOrb(null);
        ivHint(errMsg(code) + ' — می‌توانی تایپ کنی یا «تکرار سؤال» را بزنی.');
        vibrate(30);
      }
    });
    vibrate(14);
  }

  function handleAnswer(text) {
    var q = QUESTIONS[IV.i];
    var t = normText(text || '');
    if (!q) return;
    if (!t) { ivHint('پاسخی شنیده نشد.'); setOrb(null); return; }

    if (q.type === 'confirm') {
      if (/^(بله|آره|اره|بلی|درست|ثبت|تایید|تأیید|اوکی|باشه|yes)/.test(t)) {
        setOrb(null);
        ivEl('iv-answer').textContent = 'ثبت می‌کنم…';
        finishInterview(true);
        return;
      }
      if (/^(نه|خیر|صبر|انصراف|no)/.test(t)) {
        setOrb(null);
        ivHint('گفت‌وگو ادامه پیدا کرد؛ می‌توانی سؤال قبلی را اصلاح کنی.');
        IV.i = Math.max(0, IV.i - 1);
        renderStep();
        return;
      }
    }

    var applied = applyAnswerToForm(q, t);
    var ansEl = ivEl('iv-answer');
    if (applied.ok) {
      ansEl.textContent = '✓ ' + applied.display;
      ansEl.classList.add('filled');
      ivHint('ثبت شد. سؤال بعدی…');
      vibrate(18);
      var m = refresh();
      var nextDelay = applied.key === 'kmE' && m.dist ? 500 : 650;
      setTimeout(function () { if (IV.active) { IV.i++; renderStep(); } }, nextDelay);
    } else {
      ansEl.textContent = t;
      ansEl.classList.remove('filled');
      ivHint(applied.message || 'متوجه نشدم؛ دوباره بگو یا رد کن.');
      setOrb(null);
    }
  }

  function applyAnswerToForm(q, t) {
    var k = q.key;
    var el = $('#f-' + k);
    if (!el) return { ok: false };

    if (k === 'name') {
      if (/^(همان|همون|قبلی|درست)/.test(t) && S.profile.name) return { ok: true, key: k, display: S.profile.name };
      var nameTxt = t.replace(/^(اسمم|اسم من|نامم|نام من|من)\s*/, '').replace(/\s*(است|هست|می‌باشد)$/, '').trim();
      if (nameTxt.length < 2) return { ok: false, message: 'نام را کامل‌تر بگو.' };
      el.value = nameTxt; return { ok: true, key: k, display: nameTxt };
    }
    if (k === 'plate') {
      if (/^(همان|همون|قبلی|درست)/.test(t) && S.profile.plate) return { ok: true, key: k, display: S.profile.plate };
      el.value = t; return { ok: true, key: k, display: t };
    }
    if (NUMERIC[k]) {
      if (/(خودکار|نمیدانم|نمی دانم|رد|بعدی|skip|پاس)/.test(t) && k === 'dist') {
        el.value = ''; el.dataset.manual = '';
        var mm = compute();
        return { ok: true, key: k, display: mm.dist ? 'مسافت خودکار ' + fmt(mm.dist) + ' کیلومتر' : 'رد شد' };
      }
      if (/(ندارم|ندارد|صفر|هیچ)/.test(t) && !/\d/.test(toEn(t))) { el.value = '0'; return { ok: true, key: k, display: '۰' }; }
      var p = parseFields(t);
      var v = p.out[k];
      if (v == null) { var ns = parseNumbers(t); if (ns.length) v = ns[ns.length - 1].v; }
      if (v == null) return { ok: false, message: 'عدد را نفهمیدم؛ دوباره بگو.' };
      el.value = String((k === 'fuel' || k === 'loaded') ? Math.round(v * 10) / 10 : Math.round(v));
      if (k === 'dist') el.dataset.manual = '1';
      return { ok: true, key: k, display: (k === 'fuel' || k === 'loaded' ? fmt(v, 1) : fmt(v)) + (k === 'trips' || k === 'served' ? ' مورد' : k === 'fuel' || k === 'loaded' ? ' لیتر' : ' کیلومتر') };
    }
    if (k === 'tasks') {
      var taskTxt = t.replace(/(تمام|تموم|بسه|کافی است|همین)\s*$/, '').trim();
      if (/(ندارم|ندارد|هیچ)/.test(t) && taskTxt.length < 6) { el.value = ''; return { ok: true, key: k, display: 'رد شد' }; }
      el.value = (el.value ? el.value + ' ' : '') + taskTxt;
      return { ok: true, key: k, display: taskTxt };
    }
    if (k === 'issues') {
      if (/(ندارم|ندارد|مشکلی نیست|هیچ|سالم|رد)/.test(t)) { el.value = ''; return { ok: true, key: k, display: 'مشکلی ثبت نشد' }; }
      el.value = t; return { ok: true, key: k, display: t };
    }
    if (k === 'notes') {
      if (/(ندارم|ندارد|رد|هیچ|خیر)/.test(t)) return { ok: true, key: k, display: 'رد شد' };
      el.value = t; return { ok: true, key: k, display: t };
    }
    el.value = t;
    return { ok: true, key: k, display: t };
  }

  function finishInterview(confirmed) {
    closeInterview(true);
    var m = refresh();
    if (!confirmed) {
      go('report');
      toast('گفت‌وگو بسته شد؛ می‌توانی گزارش را دستی کامل کنی');
      return;
    }
    var rec = recordReport();
    if (!rec) { toast('داده‌ای برای ثبت نیست'); return; }
    var summary = 'گزارش ثبت شد. مسافت ' + fmt(m.dist) + ' کیلومتر، مصرف ' + fmt(m.cons, 1) + ' لیتر در ۱۰۰ کیلومتر، امتیاز ' + fmt(m.score) + ' از ۱۰۰.';
    toast('گزارش ثبت شد ✓');
    status(summary);
    setTimeout(function () {
      speak(summary, function () { exportExcel(true); });
    }, 200);
  }

  /* ============================================================
     EXCEL EXPORT
     ============================================================ */
  function buildExcelSheets() {
    var X = window.DriverXLSX, St = X.styles;
    var m = compute(), d = m.d, now = new Date();
    var H = St.HEADER, L = St.LABEL, C = St.CELL, T = St.TITLE;
    var dec = function (v) { return { v: Math.round(v * 10) / 10, s: St.DEC }; };
    var int = function (v) { return { v: Math.round(v), s: St.INT }; };

    var s1 = {
      name: 'خلاصه شیفت', cols: [26, 22, 14, 14, 14],
      rows: [
        [{ v: 'گزارش شیفت راننده', s: T }],
        [],
        [{ v: 'راننده', s: L }, { v: d.name || S.profile.name || '—', s: C }, '', { v: 'تاریخ', s: L }, { v: $('#f-date').value || jalaliStr(now), s: C }],
        [{ v: 'پلاک خودرو', s: L }, { v: d.plate || S.profile.plate || '—', s: C }, '', { v: 'ساعت ثبت', s: L }, { v: timeStr(now), s: C }],
        [{ v: 'تاریخ میلادی', s: L }, { v: ymd(now), s: C }],
        [],
        [{ v: 'شاخص عملکرد', s: H }, { v: 'مقدار', s: H }, { v: 'واحد', s: H }, { v: 'هدف', s: H }, { v: 'وضعیت', s: H }],
        [{ v: 'مسافت طی‌شده', s: L }, int(m.dist), { v: 'کیلومتر', s: C }, '', { v: m.dist ? 'ثبت شد' : 'نامشخص', s: C }],
        [{ v: 'سوخت مصرفی خودرو', s: L }, dec(m.fuel), { v: 'لیتر', s: C }, '', ''],
        [{ v: 'مصرف ویژه', s: L }, dec(m.cons), { v: 'لیتر/۱۰۰کم', s: C }, dec(m.target), { v: m.cons && m.cons <= m.target ? 'در محدوده' : 'بالاتر از هدف', s: C }],
        [{ v: 'سوخت بارگیری‌شده', s: L }, dec(m.loaded), { v: 'لیتر', s: C }, '', ''],
        [{ v: 'خودروهای سوخت‌رسانی‌شده', s: L }, int(m.served), { v: 'خودرو', s: C }, '', ''],
        [{ v: 'تعداد سفر / بار', s: L }, int(m.trips), { v: 'سفر', s: C }, '', ''],
        [{ v: 'میانگین تحویل هر خودرو', s: L }, dec(m.perVehicle), { v: 'لیتر', s: C }, '', ''],
        [{ v: 'هزینه سوخت', s: L }, int(m.cost), { v: 'تومان', s: C }, { v: m.price, s: St.INT }, { v: 'قیمت هر لیتر', s: C }],
        [{ v: 'هزینه هر کیلومتر', s: L }, int(m.costPerKm), { v: 'تومان/کیلومتر', s: C }, '', ''],
        [{ v: 'امتیاز عملکرد روز', s: L }, int(m.score), { v: 'از ۱۰۰', s: C }, int(80), { v: m.score >= 80 ? 'ممتاز' : m.score >= 60 ? 'خوب' : 'نیازمند توجه', s: C }],
        [],
        [{ v: 'تحلیل و توصیه‌های هوشمند', s: T }],
        [{ v: 'نتیجه', s: H }, { v: 'توضیح', s: H }]
      ]
    };
    insights(m).forEach(function (x) {
      s1.rows.push([{ v: x.title, s: L }, { v: x.body, s: C }]);
    });

    var s2 = {
      name: 'گزارش روز', cols: [30, 46, 16],
      rows: [
        [{ v: 'فرم کامل گزارش روزانه', s: T }], [],
        [{ v: 'بخش', s: H }, { v: 'مقدار', s: H }, { v: 'واحد', s: H }],
        [{ v: 'نام راننده', s: L }, d.name || '—', ''],
        [{ v: 'پلاک خودرو', s: L }, d.plate || '—', ''],
        [{ v: 'کیلومتر شروع', s: L }, int(m.kmS), { v: 'کیلومتر', s: C }],
        [{ v: 'کیلومتر پایان', s: L }, int(m.kmE), { v: 'کیلومتر', s: C }],
        [{ v: 'مسافت طی‌شده', s: L }, int(m.dist), { v: 'کیلومتر', s: C }],
        [{ v: 'سوخت مصرفی خودرو', s: L }, dec(m.fuel), { v: 'لیتر', s: C }],
        [{ v: 'سوخت بارگیری‌شده در مخازن', s: L }, dec(m.loaded), { v: 'لیتر', s: C }],
        [{ v: 'تعداد خودروهای سوخت‌رسانی‌شده', s: L }, int(m.served), { v: 'خودرو', s: C }],
        [{ v: 'تعداد سفر/بار', s: L }, int(m.trips), { v: 'سفر', s: C }],
        [{ v: 'کارهای انجام‌شده', s: L }, d.tasks || '—', ''],
        [{ v: 'مشکلات و خرابی', s: L }, d.issues || 'ندارد', ''],
        [{ v: 'توضیحات تکمیلی', s: L }, d.notes || '—', ''],
        [],
        [{ v: 'امضای راننده', s: L }, '________________', ''],
        [{ v: 'تأیید مدیر', s: L }, '________________', '']
      ]
    };

    var s3 = {
      name: 'تاریخچه', cols: [16, 10, 12, 12, 12, 12, 12, 12, 10, 10, 14, 10, 40, 30],
      rows: [
        [{ v: 'تاریخچهٔ گزارش‌های ثبت‌شده', s: T }], [],
        [{ v: 'تاریخ', s: H }, { v: 'ساعت', s: H }, { v: 'کیلومتر شروع', s: H }, { v: 'کیلومتر پایان', s: H },
         { v: 'مسافت', s: H }, { v: 'سوخت مصرفی', s: H }, { v: 'مصرف', s: H }, { v: 'بارگیری', s: H },
         { v: 'خودروها', s: H }, { v: 'سفرها', s: H }, { v: 'هزینه (تومان)', s: H }, { v: 'امتیاز', s: H },
         { v: 'کارها', s: H }, { v: 'مشکلات', s: H }]
      ]
    };
    var reps = S.reports.slice(-200);
    if (!reps.length) s3.rows.push([{ v: 'هنوز گزارشی ثبت نشده است', s: C }]);
    reps.forEach(function (r) {
      s3.rows.push([
        { v: r.dateFa, s: C }, { v: r.time, s: C },
        int(num(r.fields.kmS)), int(num(r.fields.kmE)), int(r.dist), dec(r.fuel), dec(r.cons), dec(r.loaded),
        int(r.served), int(r.trips), int(r.cost), int(r.score),
        { v: r.fields.tasks || '—', s: C }, { v: r.fields.issues || 'ندارد', s: C }
      ]);
    });
    if (reps.length) {
      var tDist = reps.reduce(function (a, r) { return a + (r.dist || 0); }, 0);
      var tFuel = reps.reduce(function (a, r) { return a + (r.fuel || 0); }, 0);
      var tCost = reps.reduce(function (a, r) { return a + (r.cost || 0); }, 0);
      var aScore = reps.reduce(function (a, r) { return a + (r.score || 0); }, 0) / reps.length;
      s3.rows.push([]);
      s3.rows.push([{ v: 'جمع کل', s: H }, '', '', '', int(tDist), dec(tFuel), dec(tDist ? (tFuel / tDist) * 100 : 0), '', '', '', int(tCost), int(aScore), 'میانگین امتیاز', '']);
    }

    return [s1, s2, s3];
  }

  function excelBytes() {
    if (!window.DriverXLSX) return null;
    return window.DriverXLSX.build(buildExcelSheets());
  }
  function excelName() {
    var d = new Date();
    var name = (S.profile.name || 'ranande').replace(/[\\/:*?"<>|\s]+/g, '-');
    return 'gozaresh-' + name + '-' + ymd(d) + '.xlsx';
  }

  function exportExcel(silentToast) {
    var bytes = excelBytes();
    if (!bytes) { toast('موتور اکسل بارگذاری نشد'); return; }
    var name = excelName();
    if (window.Android && Android.saveExcel) {
      try {
        Android.saveExcel(window.DriverXLSX.toBase64(bytes), name);
        toast('فایل اکسل ساخته شد ✓');
        return;
      } catch (e) {}
    }
    try {
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast('فایل اکسل ذخیره شد ✓');
    } catch (e) { toast('ساخت فایل ممکن نشد'); }
  }

  /* ============================================================
     Persian NLU (chat + field mics)
     ============================================================ */
  var WNUM = {
    'صفر': 0, 'یک': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5, 'شش': 6, 'شیش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9, 'ده': 10,
    'یازده': 11, 'دوازده': 12, 'سیزده': 13, 'چهارده': 14, 'پانزده': 15, 'پونزده': 15, 'شانزده': 16, 'شونزده': 16,
    'هفده': 17, 'هجده': 18, 'هیجده': 18, 'نوزده': 19, 'بیست': 20, 'سی': 30, 'چهل': 40, 'پنجاه': 50,
    'شصت': 60, 'هفتاد': 70, 'هشتاد': 80, 'نود': 90, 'صد': 100, 'یکصد': 100, 'دویست': 200, 'سیصد': 300,
    'چهارصد': 400, 'پانصد': 500, 'ششصد': 600, 'هفتصد': 700, 'هشتصد': 800, 'نهصد': 900,
    'هزار': 1000, 'میلیون': 1000000
  };
  function normText(t) {
    return toEn(t).replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ')
      .replace(/[ًٌٍَُِّْ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function parseNumbers(text) {
    var res = [], re = /\d+(?:[.,]\d+)?/g, m;
    while ((m = re.exec(text))) res.push({ v: parseFloat(m[0].replace(',', '.')), i: m.index, e: m.index + m[0].length });
    var tokens = text.split(' '), pos = 0, cur = null;
    tokens.forEach(function (tk) {
      var clean = tk.replace(/[،.:؛!؟]/g, ''), val = WNUM[clean], start = pos;
      pos += tk.length + 1;
      if (val !== undefined) {
        if (!cur) cur = { v: 0, i: start, e: start + tk.length };
        if (val === 1000 || val === 1000000) cur.v = (cur.v || 1) * val; else cur.v += val;
        cur.e = start + tk.length;
      } else if (clean !== 'و' && cur) { res.push(cur); cur = null; }
    });
    if (cur) res.push(cur);
    return res.sort(function (a, b) { return a.i - b.i; });
  }
  var KEYS = {
    kmS: ['کیلومتر شروع', 'کیلومتر اول', 'کیلومتر ابتدا', 'شروع کار', 'شروع'],
    kmE: ['کیلومتر پایان', 'کیلومتر آخر', 'کیلومتر پایانی', 'پایان'],
    dist: ['مسافت', 'کیلومتر رفتم', 'کیلومتر زدم', 'کیلومتر طی', 'کیلومتر کار', 'کیلومتر'],
    fuel: ['سوخت مصرف', 'مصرف سوخت', 'سوخت زدم', 'سوخت خورده', 'مصرف کرد', 'سوخت'],
    loaded: ['بارگیری', 'بار زدم', 'مخزن', 'تحویل گرفتم', 'لود'],
    served: ['خودرو', 'ماشین', 'سوخت دادم', 'سرویس دادم', 'تحویل دادم'],
    trips: ['سفر', 'بار', 'مرتبه', 'دفعه'],
    price: ['قیمت'],
    tasks: ['کارها', 'کارهای', 'انجام دادم', 'شرح کار', 'گزارش کار'],
    issues: ['مشکل', 'خرابی', 'ایراد', 'خراب'],
    notes: ['توضیح', 'یادداشت', 'نکته'],
    name: ['نام من', 'نامم', 'اسمم', 'اسم من', 'نام'],
    plate: ['پلاک']
  };
  var LABEL = {
    kmS: 'کیلومتر شروع', kmE: 'کیلومتر پایان', dist: 'مسافت', fuel: 'سوخت مصرفی', loaded: 'بارگیری مخازن',
    served: 'تعداد خودرو', trips: 'تعداد سفر', price: 'قیمت هر لیتر', tasks: 'کارها', issues: 'مشکلات',
    notes: 'توضیحات', name: 'نام', plate: 'پلاک'
  };
  function findKeys(text) {
    var hits = [];
    Object.keys(KEYS).forEach(function (f) {
      KEYS[f].forEach(function (k) {
        var idx = text.indexOf(k);
        if (idx >= 0) hits.push({ f: f, k: k, i: idx, e: idx + k.length, len: k.length });
      });
    });
    hits.sort(function (a, b) { return a.i - b.i || b.len - a.len; });
    var out = [];
    hits.forEach(function (h) {
      var dup = out.some(function (o) { return (o.i <= h.i && o.e >= h.e) || (h.i <= o.i && h.e >= o.e) || o.f === h.f; });
      if (!dup) out.push(h);
    });
    return out;
  }
  function parseFields(msg) {
    var text = normText(msg), nums = parseNumbers(text), keys = findKeys(text), out = {};
    if (!keys.length) return { out: out, nums: nums, keys: keys, text: text };
    keys.forEach(function (k) {
      var best = null;
      nums.forEach(function (n) {
        if (n.used) return;
        var d = n.i >= k.e ? n.i - k.e : (n.e <= k.i ? k.i - n.e : 0);
        if (d <= 26 && (!best || d < best.d)) best = { n: n, d: d };
      });
      if (best && NUMERIC[k.f]) { out[k.f] = best.n.v; best.n.used = true; }
    });
    keys.forEach(function (k) {
      if (NUMERIC[k.f] || out[k.f]) return;
      var rest = text.slice(k.e).replace(/^(?:ام|م|است|بود|هست|شده|کردم|زدن|زدم)\s*/, '').trim();
      rest = rest.split(' و ')[0].replace(/[.،]$/, '').trim();
      if (rest) out[k.f] = rest.slice(0, 140);
    });
    if (!out.dist && nums.length === 1 && !nums[0].used && keys.some(function (k) { return k.f === 'dist'; })) out.dist = nums[0].v;
    return { out: out, nums: nums, keys: keys, text: text };
  }

  function answer(msg) {
    var text = normText(msg), p = parseFields(msg), applied = [];
    Object.keys(p.out).forEach(function (f) {
      var el = $('#f-' + f);
      if (!el) return;
      var v = p.out[f];
      if (typeof v === 'number') {
        el.value = (f === 'fuel' || f === 'loaded') ? String(Math.round(v * 10) / 10) : String(Math.round(v));
      } else {
        el.value = (el.tagName === 'TEXTAREA' && el.value ? el.value + ' ' : '') + v;
      }
      if (f === 'dist') el.dataset.manual = '1';
      applied.push(f);
    });
    var m = refresh();
    if (applied.length) {
      var reply = 'ثبت شد: ' + applied.map(function (f) {
        var v = p.out[f];
        var shown = typeof v === 'number' ? (f === 'fuel' || f === 'loaded' ? fmt(v, 1) : fmt(v)) : esc(String(v));
        return '<b>' + LABEL[f] + '</b>: ' + shown;
      }).join(' • ');
      if (m.cons) reply += '<div class="mini"><span>مصرف محاسبه‌شده: <i>' + fmt(m.cons, 1) + '</i> لیتر در ۱۰۰ کیلومتر</span></div>';
      else if (m.dist) reply += '<div class="mini"><span>مسافت: <i>' + fmt(m.dist) + '</i> کیلومتر</span></div>';
      speak('ثبت شد');
      return reply;
    }
    if (/(اکسل|excel|فایل)/.test(text)) { exportExcel(); return 'فایل اکسل ساخته و برای ارسال آماده شد. ✅'; }
    if (/(گفت‌وگو|سوال|سؤال|مصاحبه|سوالات)/.test(text)) { closeSheet(); openInterview(); return 'گفت‌وگو را شروع کردم.'; }
    if (/(ثبت|ذخیره|سیو)/.test(text)) { recordReport(); return 'گزارش امروز ثبت و در تاریخچه ذخیره شد.'; }
    if (/(پاک|حذف|از نو|ریست)/.test(text)) { clearForm(); return 'فرم پاک شد. می‌توانید گزارش جدید را شروع کنید.'; }
    if (/(امتیاز|نمره)/.test(text)) {
      return 'امتیاز عملکرد امروز <b>' + fmt(m.score) + '</b> از ۱۰۰ است.' +
        (m.cons ? '<div class="mini"><span>مصرف: <i>' + fmt(m.cons, 1) + '</i> لیتر/۱۰۰کم</span><span>هدف: <i>' + fmt(m.target, 1) + '</i></span></div>' : '');
    }
    if (/(مصرف|لیتر|سوخت)/.test(text) && !/(قیمت|هزینه)/.test(text)) {
      var base = baselineCons();
      if (!m.cons) return 'برای محاسبهٔ مصرف، مسافت و لیتر سوخت مصرفی را وارد کنید.';
      return 'مصرف امروز <b>' + fmt(m.cons, 1) + '</b> لیتر در ۱۰۰ کیلومتر است.' +
        (base ? '<div class="mini"><span>میانگین ۱۰ گزارش آخر: <i>' + fmt(base, 1) + '</i></span><span>اختلاف: <i>' + (m.cons >= base ? '+' : '−') + fmt(Math.abs(((m.cons - base) / base) * 100)) + '٪</i></span></div>' : '');
    }
    if (/(هزینه|تومان|پول|خرج)/.test(text)) {
      if (!m.cost) return 'قیمت هر لیتر را در تنظیمات وارد کنید تا هزینه محاسبه شود.';
      return 'هزینهٔ سوخت امروز <b>' + fmt(m.cost) + '</b> تومان است' + (m.costPerKm ? ' (هر کیلومتر <b>' + fmt(m.costPerKm) + '</b> تومان).' : '.');
    }
    if (/(مسافت|کیلومتر|چقدر رفتم|راه)/.test(text)) {
      return m.dist ? 'مسافت امروز <b>' + fmt(m.dist) + '</b> کیلومتر است' + (m.kmS && m.kmE ? ' (از ' + fmt(m.kmS) + ' تا ' + fmt(m.kmE) + ').' : '.') : 'کیلومتر شروع و پایان را بگویید تا مسافت را حساب کنم.';
    }
    if (/(گزارش|خلاصه|وضعیت|جمع‌?بندی)/.test(text)) {
      var rr = buildReport(m).split('\n').slice(2, 12).join('\n');
      return '<b>خلاصهٔ گزارش</b><div class="mini">' + esc(rr).replace(/\n/g, '<br>') + '</div>';
    }
    if (/(هفته|تاریخچه|روند|آمار|میانگین)/.test(text)) {
      var d14 = S.reports.slice(-14);
      if (!d14.length) return 'هنوز گزارشی ثبت نشده؛ بعد از ثبت چند گزارش، تحلیل هفتگی را نشان می‌دهم.';
      var td = d14.reduce(function (a, r) { return a + (r.dist || 0); }, 0);
      var tf = d14.reduce(function (a, r) { return a + (r.fuel || 0); }, 0);
      return 'در ' + fmt(d14.length) + ' گزارش اخیر: <div class="mini"><span>مجموع مسافت: <i>' + fmt(td) + '</i> کیلومتر</span><span>مجموع سوخت: <i>' + fmt(tf) + '</i> لیتر</span><span>میانگین مصرف: <i>' + fmt(baselineCons(), 1) + '</i> لیتر/۱۰۰کم</span></div>';
    }
    if (/(سرویس|تعمیر|روغن)/.test(text)) {
      var interval = num(S.profile.interval) || 10000;
      var km = m.kmE || (S.reports.length ? num(S.reports[S.reports.length - 1].fields.kmE) : 0);
      if (!km) return 'کیلومتر پایان را وارد کنید تا زمان سرویس بعدی را بگویم.';
      return 'تا سرویس بعدی <b>' + fmt(interval - (km % interval)) + '</b> کیلومتر باقی مانده است.';
    }
    if (/(سلام|درود|وقت بخیر|صبح بخیر|شب بخیر)/.test(text)) {
      return 'سلام! من دستیار شما هستم. می‌توانم گفت‌وگویی گزارش بگیرم، مصرف را حساب کنم یا فایل اکسل بسازم.';
    }
    if (/(کمک|راهنما|چی کار|چیکار|چه کاری|دستور)/.test(text)) {
      return '<b>این‌ها را می‌توانید بگویید:</b><div class="mini">' +
        '<span>«گزارش گفت‌وگویی» → سؤال‌ها را می‌پرسم</span>' +
        '<span>«۲۱۰ کیلومتر رفتم و ۶۵ لیتر سوخت زدم»</span>' +
        '<span>«امتیاز امروز چنده؟» / «هزینه سوخت» / «خروجی اکسل»</span></div>';
    }
    if (p.nums.length && !p.keys.length) return 'عدد را شنیدم اما نمی‌دانم مربوط به چه بخشی است. مثلاً بگویید: «۲۱۰ کیلومتر رفتم».';
    return 'می‌خواهید چه چیزی را ثبت کنم؟ مثلاً: «مسافت ۲۱۰ کیلومتر، سوخت ۶۵ لیتر، ۴ سفر».';
  }

  /* ---------------- chat ---------------- */
  function addBub(html, who) {
    var b = document.createElement('div');
    b.className = 'bub ' + who; b.innerHTML = html;
    $('#chat').appendChild(b);
    $('#chat').scrollTop = $('#chat').scrollHeight;
    return b;
  }
  function askAssistant(msg) {
    if (!msg || !msg.trim()) return;
    addBub(esc(msg), 'me');
    $('#chat-input').value = '';
    var typing = addBub('<span class="typing">…</span>', 'ai');
    setTimeout(function () {
      var r = answer(msg);
      typing.innerHTML = r;
      $('#chat').scrollTop = $('#chat').scrollHeight;
      var plain = r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      if (!/(ثبت|ذخیره)/.test(normText(msg))) speak(plain);
    }, 420);
  }

  /* ---------------- navigation ---------------- */
  function go(view) {
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === view); });
    $$('.nav-item').forEach(function (b) { b.classList.toggle('is-active', b.dataset.go === view); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'stats') setTimeout(drawChart, 60);
    if (view === 'report') setTimeout(refresh, 20);
    vibrate(8);
  }
  function openSheet() {
    $('#assistant').classList.add('open');
    $('#sheet-backdrop').classList.add('show');
    setTimeout(function () { $('#chat').scrollTop = $('#chat').scrollHeight; }, 320);
    vibrate(10);
  }
  function closeSheet() {
    $('#assistant').classList.remove('open');
    $('#sheet-backdrop').classList.remove('show');
  }
  var toastT = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------------- actions ---------------- */
  function clearForm() {
    FIELDS.forEach(function (f) { var el = $('#f-' + f); if (el) el.value = ''; });
    $('#f-dist').dataset.manual = '';
    refresh(); status('');
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('گزارش کپی شد ✓'); }, function () { toast('کپی نشد'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('گزارش کپی شد ✓'); } catch (e) { toast('کپی نشد'); }
      document.body.removeChild(ta);
    }
  }
  function shareText(t) {
    if (window.Android && Android.share) { try { Android.share(t); return; } catch (e) {} }
    if (navigator.share) navigator.share({ title: 'گزارش روزانه راننده', text: t }).catch(function () {});
    else copyText(t);
  }
  function sendToManager(t) {
    var to = (S.profile.manager || '').replace(/\D/g, '');
    if (window.Android && Android.whatsappTo && to) { try { Android.whatsappTo(to, t); return; } catch (e) {} }
    var url = 'https://wa.me/' + (to || '') + '?text=' + encodeURIComponent(t);
    if (to) window.open(url, '_blank'); else shareText(t);
  }
  function saveFile(t) {
    var name = 'gozaresh-' + ymd(new Date()) + '.txt';
    if (window.Android && Android.saveFile) { try { Android.saveFile(name, t); toast('در پوشهٔ دانلود ذخیره شد ✓'); return; } catch (e) {} }
    var blob = new Blob(['\ufeff' + t], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast('فایل گزارش ذخیره شد ✓');
  }

  function initTilt() {
    $$('[data-tilt]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(900px) rotateY(' + (px * 6).toFixed(2) + 'deg) rotateX(' + (-py * 6).toFixed(2) + 'deg)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
      el.addEventListener('pointercancel', function () { el.style.transform = ''; });
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    if (BOOTED) return;
    BOOTED = true;
    load();
    $('#today-date').textContent = jalaliStr(new Date());
    $('#f-date').value = jalaliStr(new Date());

    if (S.profile.name) $('#s-name').value = S.profile.name;
    if (S.profile.plate) $('#s-plate').value = S.profile.plate;
    $('#s-price').value = S.profile.price || '';
    $('#s-interval').value = S.profile.interval || '';
    $('#s-target').value = S.profile.target || '';
    $('#s-tank').value = S.profile.tank || '';
    $('#s-manager').value = S.profile.manager || '';

    var f = S.draft && Object.keys(S.draft).length ? S.draft : {};
    fillForm({
      name: f.name || S.profile.name || '', plate: f.plate || S.profile.plate || '',
      kmS: f.kmS || '', kmE: f.kmE || '', dist: f.dist || '', fuel: f.fuel || '',
      loaded: f.loaded || '', served: f.served || '', trips: f.trips || '',
      price: f.price || S.profile.price || '', tasks: f.tasks || '', issues: f.issues || '', notes: f.notes || ''
    });

    refresh(); renderHistory(); initTilt(); applySwitches();

    $$('.nav-item').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.go); }); });

    $$('[data-quick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = b.dataset.quick; vibrate(10);
        if (q === 'excel') exportExcel();
        else if (q === 'share') shareText(buildReport(compute()));
        else go(q);
      });
    });

    FIELDS.forEach(function (f) {
      var el = $('#f-' + f);
      if (!el) return;
      el.addEventListener('input', function () {
        if (f === 'dist') el.dataset.manual = el.value ? '1' : '';
        refresh();
      });
      el.addEventListener('change', refresh);
    });

    // per-field mic
    $$('.mic').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.mic;
        if (btn.classList.contains('on')) { btn.classList.remove('on'); stopRecognition(); return; }
        vibrate(12);
        btn.classList.add('on');
        status('در حال گوش دادن… صحبت کنید');
        startRecognition({
          continuous: false,
          onPartial: function (t) { status(t); },
          onFinal: function (t) {
            btn.classList.remove('on'); status('');
            var el = $('#f-' + id), txt = normText(t);
            if (NUMERIC[id]) {
              var p = parseFields(txt), v = p.out[id];
              if (v == null) { var ns = parseNumbers(txt); if (ns.length) v = ns[ns.length - 1].v; }
              if (v == null) { toast('عدد تشخیص داده نشد'); return; }
              el.value = String((id === 'fuel' || id === 'loaded') ? Math.round(v * 10) / 10 : Math.round(v));
            } else {
              el.value = (el.tagName === 'TEXTAREA' && el.value ? el.value + ' ' : '') + txt;
            }
            if (id === 'dist') el.dataset.manual = '1';
            refresh(); toast('ثبت شد ✓'); vibrate(16);
          },
          onError: function (code) { btn.classList.remove('on'); status(errMsg(code)); toast('دوباره تلاش کنید'); }
        });
      });
    });

    $$('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = buildReport(compute()), a = b.dataset.act; vibrate(10);
        if (a === 'copy') copyText(t);
        else if (a === 'wa') sendToManager(t);
        else if (a === 'share') shareText(t);
        else if (a === 'file') saveFile(t);
        else if (a === 'excel') exportExcel();
        else if (a === 'clear') clearForm();
      });
    });

    $('#btn-save').addEventListener('click', function () {
      var r = recordReport();
      if (r) speak('گزارش ثبت شد. امتیاز عملکرد امروز ' + fmt(compute().score) + ' از صد است.');
    });
    $('#btn-excel').addEventListener('click', function () { exportExcel(); });
    $('#btn-excel-2').addEventListener('click', function () { exportExcel(); });
    $('#btn-excel-3').addEventListener('click', function () { exportExcel(); });
    $('#btn-wa-manager').addEventListener('click', function () { sendToManager(buildReport(compute())); });
    $('#btn-preview').addEventListener('click', function () {
      go('report');
      $('#preview').scrollIntoView({ behavior: 'smooth', block: 'center' });
      shareText(buildReport(compute()));
    });
    $('#btn-export-all').addEventListener('click', function () {
      if (!S.reports.length) { toast('گزارشی برای خروجی نیست'); return; }
      var txt = S.reports.map(function (r) {
        return '◾ ' + r.dateFa + ' — ' + r.time + '\n' +
          'مسافت: ' + fmt(r.dist) + ' کیلومتر | سوخت: ' + fmt(r.fuel, 1) + ' لیتر | مصرف: ' + fmt(r.cons, 1) + ' لیتر/۱۰۰کم\n' +
          'بارگیری: ' + fmt(r.loaded, 1) + ' لیتر | خودرو: ' + fmt(r.served) + ' | سفر: ' + fmt(r.trips) + ' | امتیاز: ' + fmt(r.score) + '\n' +
          'کارها: ' + (r.fields.tasks || '—') + '\nمشکلات: ' + (r.fields.issues || 'ندارد') + '\n';
      }).join('\n');
      saveFile(txt);
    });
    $('#btn-reset').addEventListener('click', function () {
      if (!window.confirm('همهٔ گزارش‌ها و تنظیمات پاک شود؟')) return;
      S.reports = []; S.draft = {};
      S.profile = { name: '', plate: '', price: 1500, target: 35, interval: 10000, tank: 0, manager: '' };
      save(); clearForm(); renderHistory();
      ['s-name', 's-plate', 's-manager', 's-tank'].forEach(function (id) { $('#' + id).value = ''; });
      $('#s-price').value = 1500; $('#s-interval').value = 10000; $('#s-target').value = 35;
      toast('همهٔ داده‌ها پاک شد');
    });

    document.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.rc') : null;
      if (card && card.dataset.idx != null) loadRecord(+card.dataset.idx);
    });

    var map = { 's-name': 'name', 's-plate': 'plate', 's-price': 'price', 's-interval': 'interval', 's-target': 'target', 's-tank': 'tank', 's-manager': 'manager' };
    Object.keys(map).forEach(function (id) {
      var el = $('#' + id);
      el.addEventListener('input', function () {
        var k = map[id];
        S.profile[k] = (k === 'name' || k === 'plate') ? el.value.trim() : (k === 'manager' ? el.value.replace(/\D/g, '') : num(el.value));
        if (k === 'name') $('#f-name').value = S.profile.name;
        if (k === 'plate') $('#f-plate').value = S.profile.plate;
        if (k === 'price' && !$('#f-price').value) $('#f-price').value = S.profile.price;
        save(); refresh();
      });
    });

    // switches
    [['sw-read', 'readQuestions'], ['sw-auto', 'autoListen'], ['sw-speak', 'speak'], ['sw-haptic', 'haptic'], ['sw-autosave', 'autosave']].forEach(function (p) {
      var el = $('#' + p[0]);
      if (!el) return;
      el.addEventListener('click', function () {
        var cur = S.settings[p[1]] !== false;
        S.settings[p[1]] = !cur;
        save(); applySwitches(); vibrate(10);
        toast(S.settings[p[1]] ? 'فعال شد' : 'غیرفعال شد');
      });
    });
    $('#btn-sound').addEventListener('click', function () {
      S.settings.speak = S.settings.speak === false;
      save(); applySwitches(); vibrate(10);
      if (S.settings.speak) speak('صدا روشن است');
      toast(S.settings.speak ? 'پاسخ صوتی روشن است' : 'پاسخ صوتی خاموش است');
    });

    // sheets
    $('#btn-interview').addEventListener('click', function () { openInterview(0); });
    $('#fab-mic').addEventListener('click', function () { openInterview(0); });
    $('#iv-close').addEventListener('click', function () { closeInterview(); });
    $('#iv-stop').addEventListener('click', function () { closeInterview(); });
    $('#iv-repeat').addEventListener('click', function () {
      stopRecognition(); IV.listening = false;
      var q = QUESTIONS[IV.i];
      speak(questionText(q), function () { if (IV.active && S.settings.autoListen !== false) ivListen(); });
      setOrb('speaking');
    });
    $('#iv-skip').addEventListener('click', function () {
      stopRecognition(); IV.listening = false;
      IV.i++; renderStep();
    });
    $('#iv-prev').addEventListener('click', function () {
      stopRecognition(); IV.listening = false;
      IV.i = Math.max(0, IV.i - 1); renderStep();
    });
    $('#iv-mic').addEventListener('click', function () { ivListen(); });
    $('#iv-answer-btn').addEventListener('click', function () { ivListen(); });

    $('#btn-sheet-close').addEventListener('click', closeSheet);
    $('#sheet-backdrop').addEventListener('click', closeSheet);
    $('#composer').addEventListener('submit', function (e) { e.preventDefault(); askAssistant($('#chat-input').value); });
    $('#chat-mic').addEventListener('click', function () {
      var m = $('#chat-mic');
      if (Rec.active) { stopRecognition(); m.classList.remove('on'); return; }
      m.classList.add('on');
      startRecognition({
        continuous: false,
        onPartial: function (t) { $('#chat-input').value = t; },
        onFinal: function (t) { m.classList.remove('on'); $('#chat-input').value = t; askAssistant(t); },
        onError: function () { m.classList.remove('on'); }
      });
    });

    var CHIPS = ['گزارش گفت‌وگویی', '۲۱۰ کیلومتر رفتم', 'امتیاز امروز چنده؟', 'خروجی اکسل', 'تا سرویس بعدی چقدر مونده؟', 'تحلیل هفته'];
    $('#chips').innerHTML = CHIPS.map(function (c) { return '<button type="button">' + c + '</button>'; }).join('');
    $$('#chips button').forEach(function (b) { b.addEventListener('click', function () { askAssistant(b.textContent); }); });

    setTimeout(function () {
      addBub('سلام 👋 من دستیار شما هستم. برای گزارش بدون تایپ، «گزارش گفت‌وگویی» را بزنید؛ سؤال‌ها را بلند می‌خوانم و پاسخ شما را ثبت می‌کنم.', 'ai');
    }, 900);

    setTimeout(function () {
      var s = $('#splash');
      if (s) { s.classList.add('hide'); setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 700); }
    }, 1250);

    window.addEventListener('resize', function () { drawChart(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  }

  function applySwitches() {
    [['sw-read', 'readQuestions'], ['sw-auto', 'autoListen'], ['sw-speak', 'speak'], ['sw-haptic', 'haptic'], ['sw-autosave', 'autosave']].forEach(function (p) {
      var el = $('#' + p[0]);
      if (!el) return;
      var on = S.settings[p[1]] !== false;
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var sb = $('#btn-sound'), on = S.settings.speak !== false;
    if (!sb) return;
    sb.classList.toggle('off', !on);
    sb.innerHTML = '<svg><use href="#' + (on ? 'i-sound' : 'i-sound-off') + '"/></svg>';
  }

  window.__back = function () {
    if ($('#interview').classList.contains('open')) { closeInterview(); return true; }
    if ($('#assistant').classList.contains('open')) { closeSheet(); return true; }
    var active = $('.view.is-active');
    if (active && active.dataset.view !== 'home') { go('home'); return true; }
    return false;
  };

  window.__startDriverApp = boot;
  function tryBoot() { if (document.getElementById('app')) boot(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryBoot);
  else tryBoot();
})();
