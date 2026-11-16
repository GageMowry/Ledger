export {}

declare global {
  const __APP_VERSION__: string

  // Minimal Node global used only by vite.config.ts.
  const process: { env: Record<string, string | undefined> }
}
