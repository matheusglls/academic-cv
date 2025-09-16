// ===== CONFIG =====
const CONFIG = {
  // Preferred: your OpenAlex author ID (more complete than ORCID filter)
  OPENALEX_AUTHOR_ID: "A5058545919",
  // Also keep ORCID as a fallback
  ORCID: "0000-0001-5375-2335",
  // Profile
  GITHUB_USERNAME: "matheusglls",
  // Data
  OSF_NODES: ["5k9yv"],
  // Recommended for OpenAlex reliability
  MAILTO: "matheusgallasl@gmail.com"
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

  // Footer year + header chip links (chip text is fixed: "ORCID" and "GitHub")
  document.getElementById("year").textContent = new Date().getFullYear();
  els.orcidLink.href = `https://orcid.org/${CONFIG.ORCID}`;
  els.orcidLink.textContent = "ORCID";
  els.orcidLink2.href = `https://orcid.org/${CONFIG.ORCID}`;
  els.orcidLink2.textContent = CONFIG.ORCID;
  els.githubLink.href = `https://github.com/${CONFIG.GITHUB_USERNAME}`;
  els.githubLink.textContent = "GitHub";

  // Tabs
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

  // GitHub avatar
  fetch(`https://api.github.com/users/${CONFIG.GITHUB_USERNAME}`)
    .then(r=>r.json())
    .then(j=>{ if(j.avatar_url) els.ghAvatar.src = j.avatar_url; })
    .catch(()=>{});

  // ---------- Helpers ----------
  const yearOf = y => Number.isFinite(y) ? y : null;
  const isBioOrMed = v => /bioRxiv|medRxiv/i.test(v || "");
  const isProtocolsDoi = doi => typeof doi === "string" && doi.toLowerCase().includes("10.17504/protocols.io");

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
  const render = (el, arr, emptyMsg="No items found.")=>{
    el.classList.remove("skeleton");
    el.innerHTML = arr.length ? arr.map(makeCard).join("") : `<p class="muted">${emptyMsg}</p>`;
  };
  const uniqueYears = arr => [...new Set(arr.map(x=>x.year).filter(Boolean))].sort((a,b)=>b-a);

  // ---------- Primary: OpenAlex ----------
  async function getOpenAlexWorks(){
    const out = [];
    let cursor = "*";
    const mail = encodeURIComponent(CONFIG.MAILTO || "openalex@example.com");
    const authorFilter = CONFIG.OPENALEX_AUTHOR_ID
      ? `author.id:${CONFIG.OPENALEX_AUTHOR_ID}`
      : `author.orcid:${CONFIG.ORCID}`;
    const base = `https://api.openalex.org/works?filter=${authorFilter}&per-page=200&mailto=${mail}&select=title,publication_year,type,display_name,authorships,host_venue,best_oa_location,primary_location,doi,cited_by_count`;
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
    const url = w.best_oa_location?.url
             || w.primary_location?.landing_page_url
             || (w.doi ? `https://doi.org/${w.doi}` : "#");
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

  // bioRxiv ORCID merge guard — add anything OpenAlex missed
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

  // ---------- Fallback: ORCID -> Crossref ----------
  async function getORCIDWorks(orcid){
    const r = await fetch(`https://pub.orcid.org/v3.0/${orcid}/works`, {headers:{Accept:"application/json"}});
    if(!r.ok) throw new Error("ORCID fetch failed");
    return r.json();
  }
  function extId(externalIds, type){
    const ids = externalIds?.["external-id"] || [];
    const found = ids.find(x => (x["external-id-type"]||"").toLowerCase()===type);
    return found?.["external-id-value"] || null;
  }
  async function crossrefEnrich(item){
    if(!item.doi) return item;
    const doiEnc = encodeURIComponent(item.doi);
    try{
      const r = await fetch(`https://api.crossref.org/works/${doiEnc}`);
      if(!r.ok) return item;
      const m = (await r.json()).message;
      item.venue = (m["container-title"]||[])[0] || item.venue;
      item.title = (Array.isArray(m.title) ? m.title[0] : m.title) || item.title;
      item.year = (m["issued"]?.["date-parts"]?.[0]||[])[0] || item.year;
      item.citations = m["is-referenced-by-count"] ?? item.citations;
      item.url = m.URL || item.url;
      const authorNames = (m.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(" ")).filter(Boolean);
      if(authorNames.length) item.authors = authorNames.join(", ");
    }catch(_){}
    return item;
  }

  // ---------- OSF ----------
  async function osfNode(nodeId){
    try{ const r = await fetch(`https://api.osf.io/v2/nodes/${nodeId}/`); if(!r.ok) return null; return (await r.json()).data; }
    catch(_){ return null; }
  }
  async function osfChildren(nodeId){
    try{ const r = await fetch(`https://api.osf.io/v2/nodes/${nodeId}/children/`); if(!r.ok) return []; return (await r.json()).data || []; }
    catch(_){ return []; }
  }

  // ---------- Publications filters ----------
  function applyPubFilters(){
    let arr = [...PUBS];
    const y = els.yearFilter.value;
    if(y) arr = arr.filter(x=>String(x.year)===y);
    const s = els.sortSel.value;
    if(s==="year-desc") arr.sort((a,b)=> (b.year||0)-(a.year||0));
    if(s==="year-asc")  arr.sort((a,b)=> (a.year||0)-(b.year||0));
    if(s==="cites-desc")arr.sort((a,b)=> (b.citations||0)-(a.citations||0));
    if(s==="cites-asc") arr.sort((a,b)=> (a.citations||0)-(b.citations||0));
    render(els.pubList, arr, "No publications yet.");
  }

  // ---------- State ----------
  let PUBS = [], PREPRINTS = [], PROTOCOLS = [];

  // ---------- Init ----------
  (async function init(){
    try{
      // OpenAlex first
      let works = [];
      try{
        const raw = await getOpenAlexWorks();
        works = raw.map(normFromOpenAlex);
      }catch(_){ works = []; }

      // Fallback if needed
      if(works.length === 0){
        try{
          const data = await getORCIDWorks(CONFIG.ORCID);
          const groups = data.group || [];
          const summaries = groups.map(g => g["work-summary"]?.[0]).filter(Boolean);

          const norm = (w, type)=>({
            type,
            title: w.title?.title?.value || "",
            year: w?.["publication-date"]?.year?.value || null,
            doi: (()=>{ let d = extId(w["external-ids"],"doi"); return d ? d.replace(/^doi:/i,"").trim().toLowerCase() : null; })(),
            url: w.url || null,
            venue: w["journal-title"]?.value || null,
            authors: "",
            citations: null,
            badges: []
          });

          const jArts = summaries
            .filter(w => (w?.type||"").toLowerCase()==="journal-article")
            .map(w=>norm(w,"journal"));
          const pres  = summaries
            .filter(w => (w?.type||"").toLowerCase()==="preprint")
            .map(w=>norm(w,"preprint"));
          const prots = summaries
            .map(w=>norm(w,"journal"))
            .filter(x=> isProtocolsDoi(x.doi))
            .map(x=>({...x, type:"protocol"}));

          await Promise.all(jArts.map(crossrefEnrich));
          await Promise.all(pres.map(crossrefEnrich));
          await Promise.all(prots.map(crossrefEnrich));

          jArts.forEach(x=>x.badges=["Journal article"]);
          pres.forEach(x=> x.badges=[/^10\.1101\//.test(x.doi||"") ? "bioRxiv/medRxiv" : "Preprint"]);
          prots.forEach(x=> x.badges=["Protocol"]);

          works = [...jArts, ...pres, ...prots];
        }catch(_){
          works = [];
        }
      }

      // Split
      PROTOCOLS = works.filter(w=>w.type==="protocol");
      PREPRINTS = works.filter(w=>w.type==="preprint");
      PUBS      = works.filter(w=>w.type==="journal");

      // Merge extra bioRxiv items
      try{
        const bx = await getBiorxivPreprints(CONFIG.ORCID);
        const existingDois = new Set(PREPRINTS.map(p=>p.doi));
        bx.forEach(p=>{ if(p.doi && !existingDois.has(p.doi)) PREPRINTS.push(p); });
      }catch(_){}

      // Metrics
      els.countPubs.textContent = PUBS.length;
      els.countPreprints.textContent = PREPRINTS.length;
      els.countProtocols.textContent = PROTOCOLS.length;

      // Author-level metrics (h-index, total citations)
      try{
        const mail = encodeURIComponent(CONFIG.MAILTO || "openalex@example.com");
        const authorURL = CONFIG.OPENALEX_AUTHOR_ID
          ? `https://api.openalex.org/authors/${CONFIG.OPENALEX_AUTHOR_ID}?mailto=${mail}`
          : `https://api.openalex.org/authors/https://orcid.org/${CONFIG.ORCID}?mailto=${mail}`;
        const a = await fetch(authorURL).then(r=>r.json());
        if (a?.summary_stats?.h_index != null) document.getElementById("h-index").textContent = a.summary_stats.h_index;
        if (typeof a?.cited_by_count === "number") els.totalCitations.textContent = a.cited_by_count;
        else els.totalCitations.textContent = [...PUBS, ...PREPRINTS, ...PROTOCOLS].reduce((s,x)=> s + (x.citations||0), 0);
      }catch(_){
        els.totalCitations.textContent = [...PUBS, ...PREPRINTS, ...PROTOCOLS].reduce((s,x)=> s + (x.citations||0), 0);
      }

      // Render
      const years = uniqueYears(PUBS);
      els.yearFilter.innerHTML = `<option value="">All</option>` + years.map(y=>`<option>${y}</option>`).join("");
      els.yearFilter.addEventListener("change", applyPubFilters);
      els.sortSel.addEventListener("change", applyPubFilters);
      applyPubFilters();

      render(els.preList, PREPRINTS.sort((a,b)=> (b.year||0)-(a.year||0)), "No preprints yet.");
      render(els.protocolList, PROTOCOLS.sort((a,b)=> (b.year||0)-(a.year||0)), "No protocols yet.");

      // Latest highlight
      const latest = [...PUBS, ...PREPRINTS, ...PROTOCOLS].sort((a,b)=> (b.year||0)-(a.year||0))[0];
      if(latest){
        els.latestHighlight.innerHTML = `<li><a href="${latest.url}" target="_blank" rel="noopener">${latest.title}</a> (${latest.year||"—"})</li>`;
      }

      // OSF projects/components
      const osfItems = [];
      for(const node of CONFIG.OSF_NODES){
        try{
          const main = await osfNode(node);
          if(main){
            osfItems.push({
              title: main.attributes.title || "OSF Project",
              url: `https://osf.io/${node}`,
              desc: main.attributes.description || "",
              badge: "OSF Project"
            });
          }
          const kids = await osfChildren(node);
          kids.forEach(k=>{
            osfItems.push({
              title: k.attributes.title,
              url: `https://osf.io/${k.id}`,
              desc: k.attributes.description || "",
              badge: "Component"
            });
          });
        }catch(_){}
      }
      els.projectList.classList.remove("skeleton");
      els.projectList.innerHTML = osfItems.length ? osfItems.map(i=>`
        <li class="item">
          <h4><a href="${i.url}" target="_blank" rel="noopener">${i.title}</a></h4>
          ${i.desc ? `<div class="meta">${i.desc}</div>` : ""}
          <div class="badges"><span class="badge">${i.badge}</span></div>
        </li>`).join("") : `<p class="muted">No OSF projects to display.</p>`;

    }catch(err){
      console.error(err);
      // Ensure UI never stays in "loading"
      [els.pubList, els.preList, els.protocolList, els.projectList].forEach(el=>{
        el.classList.remove("skeleton");
      });
      els.pubList.innerHTML = `<p class="muted">Could not load publications right now.</p>`;
      els.preList.innerHTML = `<p class="muted">Could not load preprints right now.</p>`;
      els.protocolList.innerHTML = `<p class="muted">Could not load protocols right now.</p>`;
      els.projectList.innerHTML = `<p class="muted">Could not load OSF projects right now.</p>`;
    }
  })();
});
