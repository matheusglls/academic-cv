import{readFile,writeFile}from"node:fs/promises";
const html=await readFile("index.html","utf8");
const css=await readFile("style.css","utf8");
const js=await readFile("script.js","utf8");
const inlined=html.replace('<link rel="stylesheet" href="style.css">',`<style>\n${css}\n</style>`).replace('<script defer src="script.js"></script>',"").replace("</body>",`<script>\n${js}\n</script></body>`);
await writeFile("index.html",inlined);
