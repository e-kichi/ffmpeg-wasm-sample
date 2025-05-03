// sw.js - Service Worker for FFmpeg.wasm
const CACHE_NAME = 'ffmpeg-webm-converter-v1';

// SharedArrayBuffer を有効にするために必要なヘッダーを設定
const HEADERS = {
  headers: {
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin'
  }
};

// インストール時にキャッシュを初期化
self.addEventListener('install', event => {
  console.log('Service Worker: インストール中');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: キャッシュを開きました');
        // FFmpeg.wasmのCDNファイルをキャッシュ
        return cache.addAll([
          'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.11.0/ffmpeg.min.js'
        ]);
      })
      .then(() => {
        console.log('Service Worker: キャッシュを完了しました');
        return self.skipWaiting();
      })
  );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', event => {
  console.log('Service Worker: アクティベート中');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 古いキャッシュを削除中', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: アクティブ化完了');
      return self.clients.claim();
    })
  );
});

// リクエストを処理して必要なヘッダーを追加
self.addEventListener('fetch', event => {
  // 不要なリクエストを処理しない
  if (event.request.method !== 'GET') return;
  
  // 特定のURLにCOEP/COOPヘッダーを適用
  const url = new URL(event.request.url);
  
  // 同一オリジンのリクエスト（HTMLやJSファイル）に対して処理
  const isLocalResource = url.origin === self.location.origin;
  
  if (isLocalResource) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // レスポンスのクローンを作成
          const newResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers)
          });
          
          // COEP/COOPヘッダーを追加
          newResponse.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
          newResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
          
          return newResponse;
        })
        .catch(error => {
          console.error('Service Worker: フェッチに失敗', error);
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // CDNからのリクエスト（FFmpeg.wasmファイル）
  const isFFmpegResource = event.request.url.includes('cdnjs.cloudflare.com/ajax/libs/ffmpeg');
  
  if (isFFmpegResource) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          return fetch(event.request)
            .then(response => {
              // キャッシュにレスポンスを保存
              const responseToCache = response.clone();
              
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
              
              return response;
            });
        })
    );
    return;
  }
  
  // その他のリクエストはそのまま処理
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
