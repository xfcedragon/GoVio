/**
 * Receipt photos live in IndexedDB on this browser only.
 * The ledger in localStorage stores the receipt id, not the bytes.
 * Clearing site data removes both. Nothing is uploaded.
 */

const DB_NAME = "skippilot.receipts.v1"
const STORE = "images"

/** Large photos are refused before they can fill the browser quota. */
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024

export type StoredReceiptImage = {
  blob: Blob
  name: string
  type: string
  hash: string
  savedAt: string
}

export type ImageSaveResult =
  | { ok: true; hash: string }
  | { ok: false; reason: "unavailable" | "too-large" | "quota" | "failed" }

type ImageRow = StoredReceiptImage

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("unavailable"))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("failed"))
  })
}

export async function hashBlob(blob: Blob): Promise<string | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return null
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  } catch {
    return null
  }
}

function quotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
}

export async function putReceiptImage(id: string, file: Blob, name: string): Promise<ImageSaveResult> {
  if (file.size > MAX_RECEIPT_BYTES) return { ok: false, reason: "too-large" }
  const hash = await hashBlob(file)
  if (!hash) return { ok: false, reason: "failed" }
  try {
    const db = await openDb()
    const row: ImageRow = {
      blob: file,
      name: name.slice(0, 120),
      type: file.type || "application/octet-stream",
      hash,
      savedAt: new Date().toISOString(),
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error("failed"))
      tx.onabort = () => reject(tx.error ?? new Error("failed"))
      tx.objectStore(STORE).put(row, id)
    })
    db.close()
    return { ok: true, hash }
  } catch (error) {
    if (error instanceof Error && error.message === "unavailable") return { ok: false, reason: "unavailable" }
    if (quotaError(error)) return { ok: false, reason: "quota" }
    return { ok: false, reason: "failed" }
  }
}

export async function getReceiptImage(id: string): Promise<StoredReceiptImage | null> {
  try {
    const db = await openDb()
    const row = await new Promise<ImageRow | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly")
      const request = tx.objectStore(STORE).get(id)
      request.onsuccess = () => resolve(request.result as ImageRow | undefined)
      request.onerror = () => reject(request.error ?? new Error("failed"))
    })
    db.close()
    if (!row || !(row.blob instanceof Blob)) return null
    return row
  } catch {
    return null
  }
}

export async function deleteReceiptImage(id: string): Promise<boolean> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error("failed"))
      tx.objectStore(STORE).delete(id)
    })
    db.close()
    return true
  } catch {
    return false
  }
}

export async function clearReceiptImages(): Promise<boolean> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error("failed"))
      tx.objectStore(STORE).clear()
    })
    db.close()
    return true
  } catch {
    return false
  }
}
