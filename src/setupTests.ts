import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

// Node 25 ships a (broken, file-less) global localStorage that shadows jsdom's,
// so tests get a small in-memory Storage, fresh for every test.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});
