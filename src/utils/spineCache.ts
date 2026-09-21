/**
 * Spine 资产浏览器缓存（IndexedDB）
 * - 缓存 skel / atlas / png 文件，key = assetKey
 * - TTL = 24 小时，过期自动失效
 */

const DB_NAME = 'spine_asset_cache'
const STORE_NAME = 'assets'
const TTL_MS = 24 * 60 * 60 * 1000 // 24 小时

interface CachedAsset {
  assetKey: string
  skel: ArrayBuffer
  atlas: string // atlas 是文本
  pngs: Array<{ name: string; data: ArrayBuffer }>
  cachedAt: number // 缓存时间戳
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'assetKey' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function getCached(assetKey: string): Promise<CachedAsset | null> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(assetKey)
      req.onsuccess = () => {
        const item: CachedAsset | undefined = req.result
        if (!item) {
          resolve(null)
          return
        }
        // 检查是否过期
        if (Date.now() - item.cachedAt > TTL_MS) {
          // 删除过期缓存
          const delTx = db.transaction(STORE_NAME, 'readwrite')
          delTx.objectStore(STORE_NAME).delete(assetKey)
          resolve(null)
          return
        }
        resolve(item)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function setCached(item: CachedAsset): Promise<void> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(item)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // 静默失败，不影响正常加载
  }
}

export async function clearExpired(): Promise<void> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAllKeys()
      req.onsuccess = () => {
        const keys: IDBValidKey[] = req.result
        const now = Date.now()
        for (const key of keys) {
          if (typeof key !== 'string') continue
          const getReq = store.get(key)
          getReq.onsuccess = () => {
            const item: CachedAsset | undefined = getReq.result
            if (item && now - item.cachedAt > TTL_MS) {
              store.delete(key)
            }
          }
        }
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    // 静默失败
  }
}

// 页面加载时清理过期缓存（不阻塞主流程）
clearExpired().catch(() => {})
