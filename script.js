// ===== CONFIG =====
const CONFIG = {
  ORCID: "0000-0001-5375-2335",
  GITHUB_USERNAME: "matheusglls",
  OSF_NODES: ["5k9yv"]
};
// ==================

document.addEventListener("DOMContentLoaded", () => {
  const els = {
    tabs: document.querySelectorAll(".tab"),
    panels: document.querySelectorAll(".panel"),
    pubList: document.getElementById("pub-list"),
    preList: document.getElementById("preprint-list"),
    protocolList: document.getElementById("protocol-list"),
    yearFilter: document.getElementById("pub-year-filter"),
    sortSel: document.getElementById("pub-sort"),
    latestHighlight: document.getElementById("latest-highlight"),
    countPubs: document.getElementById("count-pubs"),
    countPreprints: document.getElementById("count-preprints"),
    countProtocols: document.getElementById("count-protocols"),
    totalCitations: document.getElementById("total-citations"),
    ghAvatar: document.getElementById("gh-avatar"),
    orcidLink: document.getElementById("orcidLink"),
    orcidLink2: document.getElementById("orcidLink2"),
    githubLink: document.getElementById("githubLink"),
    projectList: document.getElementById("project-list")
  };

  document.getElementById("year").textContent = new Date().getFullYear();
  els.orcidLink.href = `https://orcid.org/${CONFIG.ORCID}`;
  els.orcidLink.textContent = `ORCID ${CONFIG.ORCID}`;
  els.orcidLink2.href = `https://orcid.org/${CONFIG.ORCID}`;
  els.orcidLink2.textContent = CONFIG.ORCID;
  els.githubLink.href = `https://github.com/${CONFIG.GITHUB_USERNAME}`;
  els.githubLink.textContent = CONFIG.GITHUB_USERNAME;

  // Tabs (CSS handles underline now)
  document.querySelectorAll(".tabs .tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const active = document.querySelector(".tabs .tab.active");
      if(btn===active) return;
      active.classList.remove("active");
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
      document.getElementById(tab).classList.add("active");
    });
  });

  // Avatar (GitHub)
  fetch(`https://api.github.com/users/${CONFIG.GITHUB_USERNAME}`)
    .then(r=>r.json()).then(j=>{ if(j.avatar_url) els.ghAvatar.src = j.avatar_url; }).catch(()=>{});

  // ---- Data helpers ----
  let PUBS = [], PREPRINTS = [], PROTOCOLS = [];
  const isBioOrMed = v => /bioRxiv|medRxiv/i.test(v || "");
  const isProtocolsDoi = doi => typeof doi === "string" && doi.toLowerCase().includes("10.17504/protocols.io");
  const yearOf = y => Number.isFinite(y) ? y : null;

  const makeCard = it => {
    const venue = it.venue ? ` · <span class="meta">${it.venue}</span>` : "";
    const cites = Number.isFinite(it.citations) ? `<span class="badge">Citations: ${it.citations}</span>` : "";
    const year = it.year ? `<span class="badge">Year: ${it.year}</span>` : "";
    const badges = it.badges?.length ? it.badges.map(b=>`<span class="badge">${b}</span>`).join("") : "";
    return `<article class="item">
      <h4><a href="${it.url}" target="_blank" rel="noopener">${it.title || "Untitled"}</a></h4>
      <div class="meta">${[it.authors || "", it.year || "", venue].filter(Boolean).join(" ")}</div>
      <div class="badges">${badges}${year}${cites}</div>
    </article>`;
  };
  const render = (el, arr)=>{ el.classList.remove("skeleton"); el.innerHTML = arr.map(makeCard).join(""); };
  const uniqueYears = arr => [...new Set(arr.map(x=>x.year).filter(Boolean))].sort((a,b)=>b-a);

  // OpenAlex works for an ORCID (cursor pagination)
  async function getOpenAlexWorks(orcid){
    const out = [];
    let cursor = "*";
    const base = `https://api.openalex.org/works?filter=author.orcid:${orcid}&per-page=200&select=title,publication_year,type,display_name,authorships,host_venue,best_oa_location,primary_location,doi,cited_by_count`;
    for(let i=0;i<5;i++){
      const r = await fetch(`${base}&cursor=${encodeURIComponent(cursor)}`);
      if(!r.ok) break;
      const j = await r.json();
      (j.results||[]).forEach(w=> out.push(w));
      if(!j.meta?.next_cursor) break;
      cursor = j.meta.next_cursor;
    }
    return out;
  }
  function normFromOpenAlex(w){
    const url = w.best_oa_location?.url || w.primary_location?.landing_page_url || (w.doi ? `https://doi.org/${w.doi}` : "#");
    const venue = w.host_venue?.display_name || null;
    const authors = (w.authorships||[]).map(a=>a.author?.display_name).filter(Boolean).join(", ");
    const title = w.title || w.display_name;
    const year = yearOf(w.publication_year);
    const doi = (w.doi || "").toLowerCase();
    const isProtocol = isProtocolsDoi(doi);
    const isPreprint = w.type === "posted-content" || isBioOrMed(venue) || /^10\.1101\//.test(doi);
    const type = isProtocol ? "protocol" : (isPreprint ? "preprint" : "journal");
    const badges = [];
    if(isProtocol) badges.push("Protocol");
    else if(isPreprint) badges.push(isBioOrMed(venue) || /^10\.1101\//.test(doi) ? "bioRxiv/medRxiv" : "Preprint");
    else badges.push("Journal article");
    return {type, title, year, doi, url, venue, authors, citations: w.cited_by_count ?? null, badges};
  }

  // bioRxiv by ORCID ⇒ include missing preprints
  async function getBiorxivPreprints(orcid){
    const items = [];
    try{
      const r = await fetch(`https://api.biorxiv.org/details/orcid/${orcid}/0`);
      if(!r.ok) return items;
      const j = await r.json();
      (j.collection||[]).forEach(x=>{
        const doi = (x.doi||"").toLowerCase();
        items.push({
          type:"preprint",
          title:x.title,
          year:yearOf(Number(x.date?.slice(0,4))),
          doi,
          url:`https://doi.org/${x.doi}`,
          venue:"bioRxiv",
          authors:x.authors,
          citations:null,
          badges:["bioRxiv/medRxiv"]
        });
      });
    }catch(_){}
    return items;
  }

  // OSF nodes
  async function osfNode(nodeId){
    try{ const r = await fetch(`https://api.osf.io/v2/nodes/${nodeId}/`); if(!r.ok) return null; return (await r.json()).data; }
    catch(_){ return null; }
  }
  async function osfChildren(nodeId){
    try{ const r = await fetch(`https://api.osf.io/v2/nodes/${nodeId}/children/`); if(!r.ok) return []; return (await r.json()).data || []; }
    catch(_){ return []; }
  }

  function applyPubFilters(){
    let arr = [...PUBS];
    const y = els.yearFilter.value;
    if(y) arr = arr.filter(x=>String(x.year)===y);
    const s = els.sortSel.value;
    if(s==="year-desc") arr.sort((a,b)=> (b.year||0)-(a.year||0));
    if(s==="year-asc")  arr.sort((a,b)=> (a.year||0)-(b.year||0));
    if(s==="cites-desc")arr.sort((a,b)=> (b.citations||0)-(a.citations||0));
    if(s==="cites-asc") arr.sort((a,b)=> (a.citations||0)-(b.citations||0));
    render(els.pubList, arr);
  }

  (async function init(){
    try{
      // OpenAlex-first dataset
      const works = (await getOpenAlexWorks(CONFIG.ORCID)).map(normFromOpenAlex);

      // Split
      PROTOCOLS = works.filter(w=>w.type==="protocol");
      PREPRINTS  = works.filter(w=>w.type==="preprint");
      PUBS       = works.filter(w=>w.type==="journal");

      // Add any bioRxiv items missing from OpenAlex
      const bx = await getBiorxivPreprints(CONFIG.ORCID);
      const existingDois = new Set(PREPRINTS.map(p=>p.doi));
      bx.forEach(p=>{ if(p.doi && !existingDois.has(p.doi)) PREPRINTS.push(p); });

      // Metrics
      els.countPubs.textContent = PUBS.length;
      els.countPreprints.textContent = PREPRINTS.length;
      els.countProtocols.textContent = PROTOCOLS.length;
      els.totalCitations.textContent = works.reduce((s,x)=> s + (x.citations||0), 0);

      // h-index
      try{
        const a = await fetch(`https://api.openalex.org/authors/https://orcid.org/${CONFIG.ORCID}`).then(r=>r.json());
        if(a?.summary_stats?.h_index != null) els.hIndex.textContent = a.summary_stats.h_index;
      }catch(_){}

      // Render lists
      const years = uniqueYears(PUBS);
      els.yearFilter.innerHTML = `<option value="">All</option>` + years.map(y=>`<option>${y}</option>`).join("");
      els.yearFilter.addEventListener("change", applyPubFilters);
      els.sortSel.addEventListener("change", applyPubFilters);
      applyPubFilters();

      render(els.preList, PREPRINTS.sort((a,b)=> (b.year||0)-(a.year||0)));
      render(els.protocolList, PROTOCOLS.sort((a,b)=> (b.year||0)-(a.year||0)));

      // Latest highlight
      const latest = [...PUBS, ...PREPRINTS, ...PROTOCOLS].sort((a,b)=> (b.year||0)-(a.year||0))[0];
      if(latest){
        els.latestHighlight.innerHTML = `<li><a href="${latest.url}" target="_blank" rel="noopener">${latest.title}</a> (${latest.year||"—"})</li>`;
      }

      // OSF project(s)
      const osfItems = [];
      for(const node of CONFIG.OSF_NODES){
        const main = await osfNode(node);
        if(main){
          osfItems.push({ title: main.attributes.title || "OSF Project", url: `https://osf.io/${node}`, desc: main.attributes.description || "", badge: "OSF Project" });
          const kids = await osfChildren(node);
          kids.forEach(k=> osfItems.push({ title: k.attributes.title, url: `https://osf.io/${k.id}`, desc: k.attributes.description || "", badge: "Component" }));
        }
      }
      els.projectList.classList.remove("skeleton");
      els.projectList.innerHTML = osfItems.map(i=>`
        <li class="item">
          <h4><a href="${i.url}" target="_blank" rel="noopener">${i.title}</a></h4>
          ${i.desc ? `<div class="meta">${i.desc}</div>` : ""}
          <div class="badges"><span class="badge">${i.badge}</span></div>
        </li>`).join("");

    }catch(err){
      console.error(err);
      [els.pubList,els.preList,els.protocolList,els.projectList].forEach(el=>{el.classList.remove("skeleton");});
      els.pubList.innerHTML = `<p>Could not load items. Check your network and try again.</p>`;
    }
  })();
});
