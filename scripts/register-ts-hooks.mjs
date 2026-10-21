import { register } from "node:module"

// Lets `node --test` import this app's TypeScript, including `@/` paths,
// without adding a test runner.
register(new URL("./ts-hooks.mjs", import.meta.url).href, import.meta.url)
