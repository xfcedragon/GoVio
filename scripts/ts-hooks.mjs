import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import { fileURLToPath } from "node:url"

const srcRoot = new URL("../src/", import.meta.url)

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const url = new URL(`${specifier.slice(2)}.ts`, srcRoot)
    return { url: url.href, shortCircuit: true }
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[a-z0-9]+$/i.test(specifier) &&
    context.parentURL?.endsWith(".ts")
  ) {
    return nextResolve(`${specifier}.ts`, context)
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts")) return nextLoad(url, context)
  const source = await readFile(fileURLToPath(url), "utf8")
  return {
    format: "module",
    source: stripTypeScriptTypes(source, { mode: "strip" }),
    shortCircuit: true,
  }
}
