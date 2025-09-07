// NFC 언어 학습기 Service Worker
const CACHE_NAME = 'language-learner-v1.0.0';
const urlsToCache = [
  '/',
  '/scene1.html',
  '/scene2.html',
  '/scene3.html',
  '/scene4.html',
  '/scene5.html',
  '/scene6.html',
  '/manifest.json',
  // 오디오 파일들은 용량이 크므로 선택적으로 캐시
  // '/audio/scene1.mp3',
  // '/audio/scene2.mp3',
  // '/audio/scene3.mp3',
  // '/audio/scene4.mp3',
  // '/audio/scene5.mp3',
  // '/audio/scene6.mp3'
];

// Service Worker 설치
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Cache failed:', error);
      })
  );
  
  // 새 Service Worker를 즉시 활성화
  self.skipWaiting();
});

// Service Worker 활성화
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // 이전 버전의 캐시 삭제
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // 모든 클라이언트에서 새 Service Worker 즉시 적용
  self.clients.claim();
});

// 네트워크 요청 가로채기
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // 오디오 파일 요청 처리
  if (requestUrl.pathname.includes('/audio/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('Serving audio from cache:', requestUrl.pathname);
            return cachedResponse;
          }
          
          // 캐시에 없으면 네트워크에서 가져오고 캐시에 저장
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              console.log('Caching audio file:', requestUrl.pathname);
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((error) => {
            console.error('Audio fetch failed:', error);
            // 오프라인일 때 대체 응답
            return new Response('Audio file not available offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        });
      })
    );
    return;
  }
  
  // HTML 페이지 및 기타 리소스 처리
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // 캐시에서 발견되면 캐시된 버전 반환
        if (cachedResponse) {
          console.log('Serving from cache:', event.request.url);
          
          // 백그라운드에서 최신 버전 가져오기 (stale-while-revalidate)
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, networkResponse.clone());
                });
              }
            })
            .catch(() => {
              // 네트워크 오류 무시 (오프라인 상황)
            });
          
          return cachedResponse;
        }
        
        // 캐시에 없으면 네트워크에서 가져오기
        return fetch(event.request)
          .then((networkResponse) => {
            // 응답이 유효하지 않으면 그대로 반환
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            
            // 응답을 캐시에 저장
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            
            return networkResponse;
          })
          .catch((error) => {
            console.error('Fetch failed:', error);
            
            // 오프라인일 때 기본 페이지 제공
            if (event.request.destination === 'document') {
              return caches.match('/scene1.html');
            }
            
            // 다른 리소스의 경우 간단한 오프라인 응답
            return new Response('Offline - Resource not available', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// 푸시 알림 처리 (필요시)
self.addEventListener('push', (event) => {
  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: '/manifest.json',
      badge: '/manifest.json',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      },
      actions: [
        {
          action: 'explore',
          title: '학습하기',
          icon: '/manifest.json'
        },
        {
          action: 'close',
          title: '닫기'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification('언어 학습기', options)
    );
  }
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'explore') {
    // 학습하기 액션
    event.waitUntil(
      clients.openWindow('/scene1.html')
    );
  } else if (event.action === 'close') {
    // 닫기 액션 - 아무것도 하지 않음
    return;
  } else {
    // 기본 클릭
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// 백그라운드 동기화 (필요시)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // 오프라인에서 저장된 녹음 데이터를 서버로 동기화
      syncRecordings()
    );
  }
});

// 녹음 데이터 동기화 함수
async function syncRecordings() {
  try {
    // localStorage에서 동기화가 필요한 데이터 확인
    const keys = Object.keys(localStorage);
    const recordingKeys = keys.filter(key => key.includes('_recording'));
    
    for (const key of recordingKeys) {
      const data = localStorage.getItem(key);
      if (data) {
        console.log('Syncing recording:', key);
        // 실제 서버 동기화 로직은 여기에 구현
        // await syncToServer(key, data);
      }
    }
    
    console.log('Background sync completed');
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// 캐시 크기 관리
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_AUDIO') {
    // 특정 오디오 파일을 캐시에 미리 저장
    const audioUrl = event.data.url;
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.add(audioUrl);
      })
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    // 캐시 정리
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        return caches.open(CACHE_NAME);
      })
    );
  }
});

// 오류 처리
self.addEventListener('error', (event) => {
  console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker unhandled rejection:', event.reason);
});

// 디버깅을 위한 로그
console.log('Service Worker loaded successfully');

// 주기적 백그라운드 동기화 등록 (실험적 기능)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'content-sync') {
    event.waitUntil(syncRecordings());
  }
});

// 캐시 정리 함수 (용량 관리)
async function cleanOldCache() {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(name => 
    name.startsWith('language-learner-') && name !== CACHE_NAME
  );
  
  await Promise.all(
    oldCaches.map(cacheName => caches.delete(cacheName))
  );
}

// 정기적으로 캐시 정리 (24시간마다)
setInterval(cleanOldCache, 24 * 60 * 60 * 1000);