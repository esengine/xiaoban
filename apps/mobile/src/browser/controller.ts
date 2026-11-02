import type { BrowserAction, BrowserPage } from "@xiaoban/protocol";

export interface BrowserHandle {
  run(action: BrowserAction): Promise<BrowserPage>;
}

let current: BrowserHandle | null = null;
const waiters: Array<(handle: BrowserHandle) => void> = [];

export function registerBrowser(handle: BrowserHandle): () => void {
  current = handle;
  for (const waiter of waiters.splice(0)) waiter(handle);
  return () => {
    if (current === handle) current = null;
  };
}

export function activeBrowser(): BrowserHandle | null {
  return current;
}

export function browserReady(timeoutMs: number): Promise<BrowserHandle | null> {
  if (current) return Promise.resolve(current);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const at = waiters.indexOf(wake);
      if (at >= 0) waiters.splice(at, 1);
      resolve(null);
    }, timeoutMs);
    const wake = (handle: BrowserHandle) => {
      clearTimeout(timer);
      resolve(handle);
    };
    waiters.push(wake);
  });
}

export function failedPage(message: string): BrowserPage {
  return { url: "", title: "", text: "", elements: [], sensitive: false, error: message };
}
