import { mkdir, writeFile } from "node:fs/promises";
const AUTHOR = "A5058545919",
  ORCID = "0000-0001-5375-2335",
  OSF_NODE = "5k9yv",
  apiKey = process.env.OPENALEX_API_KEY;
const labels = {
  article: "Journal article",
  review: "Journal article",
  preprint: "Preprint",
  "conference-paper": "Other output",
  "conference-abstract": "Exclude",
  dataset: "Data / code",
  software: "Data / code",
  book: "Other output",
  "book-chapter": "Other output",
};
const works = [];
let cursor = "*";
const select =
  "id,title,publication_date,publication_year,type,authorships,primary_location,locations,doi,ids";
do {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("filter", `author.id:${AUTHOR}`);
  url.searchParams.set("per_page", "200");
  url.searchParams.set("cursor", cursor);
  url.searchParams.set("select", select);
  if (apiKey) url.searchParams.set("api_key", apiKey);
  const r = await fetch(url);
  if (!r.ok) {
    console.warn(`OpenAlex unavailable (${r.status})`);
    break;
  }
  const j = await r.json();
  works.push(...j.results);
  cursor = j.meta?.next_cursor || "";
} while (cursor);
const normalized = works.map((w) => {
  const doi = (w.doi || "").toLowerCase();
  const protocol = doi.includes("10.17504/protocols.io");
  return {
    id: w.id,
    date: w.publication_date || `${w.publication_year}-01-01`,
    year: w.publication_year,
    type: protocol ? "Protocol" : labels[w.type] || "Other output",
    title: w.title || "Untitled",
    authors: (w.authorships || [])
      .map((a) => a.author?.display_name)
      .filter(Boolean)
      .join(", "),
    venue: w.primary_location?.source?.display_name || "",
    url: w.doi || w.primary_location?.landing_page_url || w.id,
    doi,
  };
});
async function europePmc() {
  const out = [];
  let page = 1;
  while (page <= 10) {
    const u = new URL(
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
    );
    u.searchParams.set("query", `AUTHORID:${ORCID} OR AUTH:\"Gallas-Lopes M\"`);
    u.searchParams.set("format", "json");
    u.searchParams.set("pageSize", "1000");
    u.searchParams.set("page", String(page));
    const r = await fetch(u);
    if (!r.ok) break;
    const j = await r.json();
    for (const x of j.resultList?.result || []) {
      const doi = (x.doi || "").toLowerCase();
      out.push({
        id: `epmc:${x.id}`,
        date: x.firstPublicationDate || `${x.pubYear}-01-01`,
        year: Number(x.pubYear),
        type: x.pubTypeList?.pubType?.includes("preprint")
          ? "Preprint"
          : "Journal article",
        title: x.title || "Untitled",
        authors: x.authorString || "",
        venue: x.journalTitle || "",
        url: doi
          ? `https://doi.org/${doi}`
          : `https://europepmc.org/article/${x.source}/${x.id}`,
        doi,
      });
    }
    if ((j.hitCount || 0) <= page * 1000) break;
    page++;
  }
  return out;
}
async function crossrefByOrcid() {
  const out = [];
  let cursor = "*";
  for (let page = 0; page < 10; page++) {
    const u = new URL("https://api.crossref.org/works");
    u.searchParams.set("filter", `orcid:${ORCID}`);
    u.searchParams.set("rows", "1000");
    u.searchParams.set("cursor", cursor);
    u.searchParams.set("mailto", "matheusgallasl@gmail.com");
    const r = await fetch(u);
    if (!r.ok) break;
    const j = await r.json();
    for (const x of j.message?.items || []) {
      const doi = (x.DOI || "").toLowerCase();
      const protocol = doi.includes("10.17504/protocols.io");
      const crossType =
        x.type === "proceedings-article"
          ? "Conference paper"
          : x.type === "dataset"
            ? "Data / code"
            : x.type === "posted-content"
              ? "Preprint"
              : "Journal article";
      const parts =
        x.published?.["date-parts"]?.[0] ||
        x.created?.["date-parts"]?.[0] ||
        [];
      const date = [
        parts[0] || 0,
        String(parts[1] || 1).padStart(2, "0"),
        String(parts[2] || 1).padStart(2, "0"),
      ].join("-");
      out.push({
        id: `crossref:${doi}`,
        date,
        year: parts[0],
        type: protocol ? "Protocol" : crossType,
        title: (x.title || [])[0] || "Untitled",
        authors: (x.author || [])
          .map((a) => [a.given, a.family].filter(Boolean).join(" "))
          .join(", "),
        venue: (x["container-title"] || [])[0] || "",
        url: doi ? `https://doi.org/${doi}` : x.URL || "",
        doi,
      });
    }
    const next = j.message?.["next-cursor"];
    if (!next || next === cursor) break;
    cursor = next;
  }
  return out;
}
async function biorxiv() {
  const out = [];
  const r = await fetch(`https://api.biorxiv.org/details/orcid/${ORCID}/0`);
  if (!r.ok) return out;
  const j = await r.json();
  for (const x of j.collection || []) {
    const doi = (x.doi || "").toLowerCase();
    out.push({
      id: `biorxiv:${doi}`,
      date: x.date,
      year: Number((x.date || "").slice(0, 4)),
      type: "Preprint",
      title: x.title,
      authors: x.authors || "",
      venue: x.server || "bioRxiv",
      url: `https://doi.org/${doi}`,
      doi,
    });
  }
  return out;
}
async function osfRegistrations(node) {
  const out = [];
  let next = `https://api.osf.io/v2/nodes/${node}/registrations/?page[size]=100`;
  while (next) {
    const r = await fetch(next);
    if (!r.ok) break;
    const j = await r.json();
    for (const x of j.data || [])
      out.push({
        id: `osf:${x.id}`,
        date: x.attributes?.date_registered || x.attributes?.date_created,
        year: Number(
          (
            x.attributes?.date_registered ||
            x.attributes?.date_created ||
            ""
          ).slice(0, 4),
        ),
        type: "Preregistration",
        title: x.attributes?.title || "OSF registration",
        authors: "Matheus Gallas-Lopes and collaborators",
        venue: "Open Science Framework",
        url: `https://osf.io/${x.id}/`,
        doi: "",
      });
    next = j.links?.next || "";
  }
  return out;
}
normalized.push(
  ...(await crossrefByOrcid()),
  ...(await biorxiv()),
  ...(await europePmc()),
  ...(await osfRegistrations(OSF_NODE)),
);
const clean = (s) =>
  String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
function classify(x) {
  const t = x.title.toLowerCase(),
    v = (x.venue || "").toLowerCase(),
    d = x.doi || "";
  if (x.type === "Exclude") return "Exclude";
  if (d.includes("10.17504/protocols.io")) return "Protocol";
  if (/10\.(1101|64898|31222|2139)\//.test(d)) return "Preprint";
  if (x.type === "Preregistration") return "Preregistration";
  if (
    d.includes("10.17605/osf.io") ||
    v.includes("open mind") ||
    v === "open science framework"
  ) {
    if (/data|dataset|code|material|repository/.test(t)) return "Data / code";
    if (
      /prereg|pre-reg|registration|replication study|experiment/.test(t) ||
      v.includes("open mind")
    )
      return "Preregistration";
    return "Exclude";
  }
  return x.type === "Review" ? "Journal article" : x.type;
}
const seen = new Set(),
  deduped = normalized
    .map((x) => ({
      ...x,
      title: clean(x.title),
      authors: clean(x.authors),
      doi: (x.doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//, ""),
    }))
    .map((x) => ({ ...x, type: classify(x) }))
    .filter((x) => {
      if (!x.title || x.type === "Exclude") return false;
      const titleKey = x.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const key = x.doi ? `doi:${x.doi}` : `title:${titleKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
if (!deduped.length)
  throw new Error(
    "No outputs were retrieved; refusing to overwrite the current data file.",
  );
await mkdir("data", { recursive: true });
await writeFile(
  "data/publications.json",
  JSON.stringify(
    { generated_at: new Date().toISOString(), outputs: deduped },
    null,
    2,
  ) + "\n",
);
console.log(`Wrote ${deduped.length} unique outputs`);
const people = new Map(),
  countries = new Map();
for (const w of works) {
  const workCountries = new Set();
  for (const a of w.authorships || []) {
    const id = a.author?.id,
      name = a.author?.display_name;
    if (id && name && !/matheus gallas/i.test(name)) {
      const p = people.get(id) || { name, works: 0 };
      p.works++;
      people.set(id, p);
    }
    for (const inst of a.institutions || [])
      if (inst.country_code) workCountries.add(inst.country_code);
  }
  for (const code of workCountries)
    countries.set(code, (countries.get(code) || 0) + 1);
}
const collaborations = {
  generated_at: new Date().toISOString(),
  coauthors: [...people.values()]
    .sort((a, b) => b.works - a.works)
    .slice(0, 30),
  countries: [...countries]
    .sort((a, b) => b[1] - a[1])
    .map(([code, works]) => ({ code, works })),
};
await writeFile(
  "data/collaborations.json",
  JSON.stringify(collaborations, null, 2) + "\n",
);
let hIndex = null,
  totalCitations = null;
try {
  const u = new URL(`https://api.openalex.org/authors/${AUTHOR}`);
  if (apiKey) u.searchParams.set("api_key", apiKey);
  const a = await fetch(u).then((r) => r.json());
  hIndex = a.summary_stats?.h_index ?? null;
  totalCitations = a.cited_by_count ?? null;
} catch {}
const counts = Object.fromEntries(
  [...new Set(deduped.map((x) => x.type))].map((t) => [
    t,
    deduped.filter((x) => x.type === t).length,
  ]),
);
const years = [...new Set(deduped.map((x) => x.year).filter(Boolean))].sort();
const byYear = Object.fromEntries(
  years.map((y) => [
    y,
    {
      journals: deduped.filter(
        (x) => x.year === y && x.type === "Journal article",
      ).length,
      preprints: deduped.filter((x) => x.year === y && x.type === "Preprint")
        .length,
    },
  ]),
);
await writeFile(
  "data/metrics.json",
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      counts,
      h_index: hIndex,
      total_citations: totalCitations,
      by_year: byYear,
    },
    null,
    2,
  ) + "\n",
);
