import { readFile, writeFile } from "node:fs/promises";
const html = await readFile("index.html", "utf8");
const css = await readFile("style.css", "utf8");
const js = await readFile("script.js", "utf8");
const inlined = html
  .replace(
    /<style>[\s\S]*?<\/style>/,
    `<style>\n${css}\n</style>`,
  )
  .replace(
    /<script>\s*const state\s*=[\s\S]*?<\/script>/,
    `<script>\n${js}\n</script>`,
  );
await writeFile("index.html", inlined);
