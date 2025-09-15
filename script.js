// ======= CONFIG — change these to yours =======
const CONFIG = {
  ORCID: "0000-0001-5375-2335",
  GITHUB_USERNAME: "your-github-username-here",
  // If you have a Web of Science / Publons profile, you can hard-set your peer review count:
  WOS_PEER_REVIEWS_OVERRIDE: null, // e.g., 24
  // Optional OSF username to fetch public projects later (needs CORS support on OSF endpoints)
  OSF_USERNAME: null
};
// ==============================================

const els = {
  tabs: document.querySelectorAll(".tab"),
  underline: document.querySelector(".tab-underline"),
  panels: document.querySelectorAll(".panel"),
  pubList: document.getElementById("pub-list"),
  preList: document.getElementById("preprint-list"),
  yearFilter: document.getElementById("pub-year-filter"),
  sortSel: document.getElementById("pub-sort"),
  latestHighlight: document.getElementById("latest-highlight"),
  countPubs: document.getElementById("count-pubs"),
  countPreprints: document.getElementById("count-preprints"),
  totalCitations: document.getElementById("total-citations"),
  hIndex: document.getElementById("h-index"),
  wosPeerReviews: document.getElementById("wos-peer-reviews"),
  ghAvatar: document.getElementById("gh-avatar"),
  orcidLink: document.getElementById("orcidLink"),
  orcidLink2: document.getElementById("orcidLink2"),
  githubLink: document.getElementById("githubLink"),
};

document.getElementById("year").textContent = new Date().getFullYear();
document.body.setAttribute("data-theme","light");

// Header links
els.orcidLink.href = `https://orcid.org/${CONFIG.ORCID}`;
els.orcidLink.textContent = `ORCID ${CONFIG.ORCID}`;
els.orcidLink2.href = `https://orcid.org/${CONFIG.ORCID}`;
els.orcidLink2.textContent = CONFIG.ORCID;
els.githubLink.href = `https://github.com/${CONFIG.GITHUB_USERNAME}`;
els.githubLink.textContent = CONFIG.GITHUB_USERNAME || "GitHub";

// Tabs UX
let activeTabBtn = document.querySelector(".tab.active");
function moveUnderline() {
  const r = activeTabBtn.getBoundingClientRect();
  const pr = activeTabBtn.parentElement.getBoundingClientRect();
  const left = r.left - pr.left + 8;
  const width = r.width - 16;
  els.underline.style.transform = `translateX(${left}px)`;
  els.underline.style.width = `${width}px`;
}
moveUnderline();
window.addEventListener("resize", moveUnderline);
document.querySelectorAll(".tabs .tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    if(btn===activeTabBtn) return;
    activeTabBtn.classList.remove("active");
    btn.classList.add("active");
    activeTabBtn = btn; moveUnderline();
    const tab = btn.dataset.tab;
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
    document.getElementById(tab).classList.add("active");
  });
});

// Theme picker
document.querySelectorAll(".theme-picker button").forEach(b=>{
  b.addEventListener("click", ()=> document.body.setAttribute("data-theme", b.dataset.theme));
});

// GitHub avatar
async function loadGitHubAvatar(){
  if(!CONFIG.GITHUB_USERNAME) return;
  try{
    const r = await fetch(`https://api.github.com/users/${CONFIG.GITHUB_USERNAME}`);
    const j = await r.json();
    if(j.avatar_url) els.ghAvatar.src = j.avatar_url;
  }catch(_){}
}
loadGitHubAvatar();

// Helper: sleep
const wait = (ms)=> new Promise(r=>setTimeout(r,ms));

// === ORCID -> Crossref/OpenAlex pipeline ===
let PUBS = [];     // journal-articles
let PREPRINTS = []; // preprints

async function getORCIDWorks(orcid){
  const r = await fetch(`https://pub.orcid.org/v3.0/${orcid}/works`, {headers:{Accept:"application/json"}});
  if(!r.ok) throw new Error("ORCID fetch failed");
  return r.json();
}

function extractExternalId(externalIds, type){
  const ids = externalIds?.["external-id"] || [];
  const found = ids.find(x => (x["external-id-type"]||"").toLowerCase()===type);
  return found?.["external-id-value"] || null;
}

function extractDOI(summary){
  const ext = summary["external-ids"];
  let doi = extractExternalId(ext,"doi");
  if(doi) doi = doi.replace(/^doi:/i,"").trim();
  return doi;
}

function workType(summary){
  return (summary?.type || "").toLowerCase();
}

function pubYear(summary){
  return summary?.["publication-date"]?.year?.value || null;
}

async function enrichWithCrossref(item){
  if(!item.doi) return item;
  const doiEnc = encodeURIComponent(item.doi);
  try{
    const r = await fetch(`https://api.crossref.org/works/${doiEnc}`);
    if(!r.ok) return item;
    const m = (await r.json()).message;
    item.journal = (m["container-title"]||[])[0] || item.journal;
    item.title = (Array.isArray(m.title) ? m.title[0] : m.title) || item.title;
    item.published = (m["issued"]?.["date-parts"]?.[0]||[])[0] || item.published;
    item.citations = m["is-referenced-by-count"] ?? item.citations;
    item.url = m.URL || item.url;
  }catch(_){}
  return item;
}

async function getOpenAlexAuthorByORCID(orcid){
  try{
    const r = await fetch(`https://api.openalex.org/authors/https://orcid.org/${orcid}`);
    if(!r.ok) return null;
    return r.json();
  }catch(_){ return null; }
}

function isBioOrMedRxiv(doi){
  return typeof doi === "string" && doi.startsWith("10.1101/");
}

function makeCardHTML(it){
  const venue = it.journal ? ` · <span class="meta">${it.journal}</span>` : "";
  const cites = Number.isFinite(it.citations) ? `<span class="badge">Citations: ${it.citations}</span>` : "";
  const year = it.published ? `<span class="badge">Year: ${it.published}</span>` : "";
  const doi = it.doi ? `<a href="https://doi.org/${it.doi}" target="_blank" rel="noopener">DOI</a>` : "";
  const badges = [
    it.type==="preprint" ? (isBioOrMedRxiv(it.doi) ? "bioRxiv/medRxiv" : "Preprint") : "Journal article",
    cites && `Cited`,
  ].filter(Boolean);
  return `
    <article class="item">
      <h4><a href="${it.url || (it.doi ? `https://doi.org/${it.doi}` : "#")}" target="_blank" rel="noopener">${it.title || "Untitled"}</a></h4>
      <div class="meta">${[it.authors || "", it.published || "", venue].filter(Boolean).join(" ")}</div>
      <div class="badges">
        ${badges.map(b=>`<span class="badge">${b}</span>`).join("")}
        ${year}${cites}
      </div>
      <div>${doi}</div>
    </article>
  `;
}

function renderList(container, items){
  container.classList.remove("skeleton");
  container.innerHTML = items.map(makeCardHTML).join("");
}

function uniqueYears(items){
  return [...new Set(items.map(x=>x.published).filter(Boolean))].sort((a,b)=>b-a);
}

function applyPubFilters(){
  let arr = [...PUBS];
  const y = els.yearFilter.value;
  if(y) arr = arr.filter(x=>String(x.published)===y);
  const sort = els.sortSel.value;
  if(sort==="year-desc") arr.sort((a,b)=> (b.published||0)-(a.published||0));
  if(sort==="year-asc") arr.sort((a,b)=> (a.published||0)-(b.published||0));
  if(sort==="cites-desc") arr.sort((a,b)=> (b.citations||0)-(a.citations||0));
  if(sort==="cites-asc") arr.sort((a,b)=> (a.citations||0)-(b.citations||0));
  renderList(els.pubList, arr);
}

// Load pipeline
(async function init(){
  try{
    // ORCID works
    const data = await getORCIDWorks(CONFIG.ORCID);
    const groups = data.group || [];
    const works = groups.map(g => g["work-summary"]?.[0]).filter(Boolean);

    // Separate types
    const jArticles = works.filter(w => workType(w)==="journal-article");
    const preprints = works.filter(w => workType(w)==="preprint");

    // Normalize items
    const norm = (w, type)=>({
      type,
      title: w.title?.title?.value || "",
      published: pubYear(w),
      doi: extractDOI(w),
      url: w.url || null,
      journal: w["journal-title"]?.value || null,
      authors: "", // ORCID summary doesn't always include; can enrich from Crossref
      citations: null
    });

    PUBS = jArticles.map(w => norm(w,"journal"));
    PREPRINTS = preprints.map(w => norm(w,"preprint"));

    // Enrich all with Crossref
    await Promise.all(PUBS.map(enrichWithCrossref));
    await Promise.all(PREPRINTS.map(enrichWithCrossref));

    // Basic metrics
    els.countPubs.textContent = PUBS.length;
    els.countPreprints.textContent = PREPRINTS.length;

    // Latest highlight (most recent pub or preprint)
    const latest = [...PUBS, ...PREPRINTS].sort((a,b)=> (b.published||0)-(a.published||0))[0];
    if(latest){
      els.latestHighlight.innerHTML = `<li><a href="${latest.url || (latest.doi?`https://doi.org/${latest.doi}`:'#')}" target="_blank" rel="noopener">${latest.title}</a> (${latest.published||'—'})</li>`;
    }

    // Build year filter
    const years = uniqueYears(PUBS);
    els.yearFilter.innerHTML = `<option value="">All</option>` + years.map(y=>`<option>${y}</option>`).join("");
    els.yearFilter.addEventListener("change", applyPubFilters);
    els.sortSel.addEventListener("change", applyPubFilters);

    // Render
    applyPubFilters();
    renderList(els.preList, PREPRINTS);

    // Totals (Crossref)
    const totalCites = [...PUBS, ...PREPRINTS].reduce((s,x)=> s + (x.citations||0), 0);
    els.totalCitations.textContent = totalCites;

    // OpenAlex h-index
    const author = await getOpenAlexAuthorByORCID(CONFIG.ORCID);
    if(author?.summary_stats?.h_index != null){
      els.hIndex.textContent = author.summary_stats.h_index;
    }

    // Web of Science peer reviews
    if(CONFIG.WOS_PEER_REVIEWS_OVERRIDE != null){
      els.wosPeerReviews.textContent = CONFIG.WOS_PEER_REVIEWS_OVERRIDE;
    }else{
      // No free public API; show "—" and explain in Metrics notes.
      els.wosPeerReviews.textContent = "—";
    }

  }catch(err){
    console.error(err);
    els.pubList.classList.remove("skeleton");
    els.preList.classList.remove("skeleton");
    els.pubList.innerHTML = `<p>Could not load publications from ORCID. Check your ORCID in <code>script.js</code>.</p>`;
  }
})();

// Optional: OSF fetch (when you add your username)
async function loadOSFProjects(username){
  // Placeholder — OSF has CORS-friendly API on some endpoints. You can implement here later.
  // If you provide your OSF username, I can wire this for you.
}

// Nice: change underline to match active tab on first paint
await wait(50); moveUnderline();
