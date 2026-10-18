export function mountReadingHtml(html: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "markdown-preview-view markdown-rendered";
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function flushPromises(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
