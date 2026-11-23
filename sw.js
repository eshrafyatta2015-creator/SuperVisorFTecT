/* Service Worker — تخزين هيكل التطبيق للعمل دون اتصال */
const VERSION = 'sup-v1.0.3';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'data/teachers.csv'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(c =>
      // جلب بدون الاعتماد على ذاكرة HTTP حتى لا تُعاد الملفات القديمة
      Promise.all(SHELL.map(u =>
        fetch(u, { cache: 'no-store' }).then(res => {
          if (!res.ok) throw new Error('install fetch failed: ' + u);
          return c.put(u, res);
        })
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // بيانات الجدول: نجذبها من الشبكة مع الرجوع للنسخة المخزّنة
  if (url.hostname === 'docs.google.com') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // بقية الملفات: الأولاً من الذاكرة، ثم الشبكة
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
