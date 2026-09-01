/**
 * Mock for @tauri-apps/plugin-store
 *
 * This mock is used in web/dev builds where the actual Tauri plugin is not available.
 * The actual Tauri plugin only exists in the compiled desktop app.
 */

export async function load(_path: string, _options?: { autoSave?: boolean }): Promise<Store> {
  return new Store();
}

export class Store {
  private data: Record<string, unknown> = {};

  async get<T>(key: string): Promise<T | null> {
    return (this.data[key] as T) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data[key] = value;
  }

  async delete(key: string): Promise<void> {
    delete this.data[key];
  }

  async save(): Promise<void> {
    // No-op in mock
  }
}
