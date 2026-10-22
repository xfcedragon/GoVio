import * as SecureStore from "expo-secure-store"

const CHUNK = 1800

function countKey(key: string) {
  return `${key}.chunk-count`
}

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED }

async function removeKey(key: string) {
  try {
    await SecureStore.deleteItemAsync(key, options)
  } catch {
    // A missing key is already gone. Some platforms reject that delete.
  }
}

/**
 * Supabase sessions can exceed the historical ~2048 byte keychain limit.
 * Values are split across Secure Store keys. Tokens are not written to AsyncStorage.
 */
export const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(countKey(key), options)
    if (!countRaw) return SecureStore.getItemAsync(key, options)
    const count = Number(countRaw)
    if (!Number.isInteger(count) || count <= 0) return null
    const parts: string[] = []
    for (let index = 0; index < count; index += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${index}`, options)
      if (part == null) return null
      parts.push(part)
    }
    return parts.join("")
  },
  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key)
    const count = Math.max(1, Math.ceil(value.length / CHUNK))
    for (let index = 0; index < count; index += 1) {
      await SecureStore.setItemAsync(key + "." + index, value.slice(index * CHUNK, (index + 1) * CHUNK), options)
    }
    await SecureStore.setItemAsync(countKey(key), String(count), options)
  },
  async removeItem(key: string): Promise<void> {
    const countRaw = await SecureStore.getItemAsync(countKey(key), options)
    if (countRaw) {
      const count = Number(countRaw)
      if (Number.isInteger(count) && count > 0) {
        for (let index = 0; index < count; index += 1) {
          await removeKey(`${key}.${index}`)
        }
      }
      await removeKey(countKey(key))
    }
    await removeKey(key)
  },
}
