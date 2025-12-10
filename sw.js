// Service Worker untuk PWA dan caching
const CACHE_NAME = 'kas-rt-cache-v1';
const STATIC_CACHE = [
  '/RT02/',
  '/RT02/index.html',
  '/RT02/style.css',
  '/RT02/script.js',
  '/RT02/balance.json',
  '/RT02/manifest.json'
];

// Install Service Worker
self.addEventListener('install', event => {
  console.log('🛠 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching app shell');
        return cache.addAll(STATIC_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker activated');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑 Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Cache first, then network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Cache balance.json requests
  if (url.pathname.includes('balance.json')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          // Return cached response if available
          if (response) {
            console.log('📦 Serving balance.json from cache');
            return response;
          }
          
          // Otherwise fetch from network
          return fetch(event.request).then(networkResponse => {
            // Cache the new response
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }
  
  // For other requests, try cache first
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

// Background sync untuk update data
self.addEventListener('sync', event => {
  if (event.tag === 'update-balance') {
    console.log('🔄 Background sync: Update balance');
    event.waitUntil(updateBalanceData());
  }
});

async function updateBalanceData() {
  try {
    const response = await fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv');
    const text = await response.text();
    
    // Process data
    const numeric = processNumber(text);
    const formatted = new Intl.NumberFormat('id-ID').format(numeric);
    
    const data = {
      saldo: formatted,
      numeric: numeric,
      timestamp: new Date().toISOString(),
      source: 'background_sync'
    };
    
    // Update cache
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      new Request('/RT02/balance.json'),
      new Response(JSON.stringify(data))
    );
    
    console.log('✅ Background update successful');
    
  } catch (error) {
    console.error('❌ Background update failed:', error);
  }
}

function processNumber(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/Rp\s*/gi, '');
  cleaned = cleaned.replace(/\./g, '');
  cleaned = cleaned.replace(',', '.');
  return parseFloat(cleaned) || 0;
}
