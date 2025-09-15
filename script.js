// ===== CONFIG =====
const CONFIG = {
  ORCID: "0000-0001-5375-2335",
  GITHUB_USERNAME: "matheusglls",
  WOS_PEER_REVIEWS_OVERRIDE: null,  // set a number if you want it shown
  OSF_NODES: ["5k9yv"]
};
// ==================

document.addEventListener("DOMContentLoaded", () => {
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
    countBiorxiv: document.getElementById("count-biorxiv"),
    totalCitations: document.getElementById("total-citations"),
    hIndex: document.getElementById("h-index"),
    wosPeerReviews: document.getElementById("wos-peer-reviews"),
    ghAvatar: document.getElementById("gh-avatar"),
    orcidLink: document.getElementById("orcidLink"),
    orcidLink2: document.getElementById("orcidLink2"),
    githubLink: document.getElementById("githubLink"),
    projectList: document.getElementById("project-list")
  };

  // footer year
  document.getElementById("year").textContent = new Date().getFullYear();

  // header links (this is why your chips were blank before)
  els.orcidLink.href = `https://orcid.org/${CONFIG.ORCID}`;
  els.orcidLink.textContent = `ORCID ${CONFIG.ORCID}`;
  els.orcidLink2.href = `https://orcid.org/${CONFIG.ORCID}`;
  els.orcidLink2.textContent = CONFIG.ORCID;
  els.githubLink.href = `https://github.com/${CONFIG.GITHUB_USERNAME}`;
  els.githubLink.textContent = CONFIG.GITHUB_USERNAME;

  // tabs (this didn't work before because JS crashed on top-level await)
  let activeTabBtn = document.querySelector(".tab.active");
  function moveUnderline() {
    const r = activeTabBtn.getBoundingClientRect();
    const pr = activeTabBtn.parentElement.getBoundingClientRect();
    const left = r.left - pr.left + 8;
    const width = r.width - 16;
    els.underline.style.transform = `translateX(${left}px)`;
    els.underline.style.width = `${width}px`;
  }
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
  setTimeout(moveUnderline, 60);

  // GitHub avatar
  fetch(`https://api.github.com/users/${CONFIG.GITHUB_USERNAME}`)
    .then(r=>r.json())
    .then(j=>{ if(j.avatar_url) els.ghAvatar.src = j.avatar_url; })
    .catch(()=>{});

  // ---------- Data pipeline ----------
  let PUBS = [], PREPRINTS = [];

  const extId = (externalIds, type) => {
    const ids = externalIds?.["external-id"] || [];
    const found = ids.find(x => (x["external-id-type"]||"").toLowerCase()===type);
    return found?.["external-id-value"] || null;
  };
  const workType = w => (w?.type || "").toLowerCase();
  const pubYear = w => w?.["publication-date"]?.year?.value || null;
  const isBio = doi => typeof doi==="string" && doi.startsWith("10.1101/");

  const makeCardHTML = it => {
    const venue = it.journal ? ` · <span class="meta">${it.journal}</span>` : "";
    const cites = Number.isFinite(it.citations) ? `<span class="badge">Citations: ${it.citations}</span>` : "";
    const year = it.published ? `<span class="badge">Year: ${it.published}</span>` : "";
    const doi = it.doi ? `<a href="https://doi.org/${it.doi}" target="_blank" rel="noopener">DOI</a>` : "";
    const badges = [ it.type==="preprint" ? (it.is_bio ? "bioRxiv/medRxiv" : "Preprint") : "Journal article" ];
    return `
      <article class="item">
        <h4><a href="${it.url || (it.doi ? `https://doi.org/${it.doi}` : "#")}" target="_blank" rel="noopener">${it.title || "Untitled"}</a></h4>
        <div class="meta">${[it.authors || "", it.published || "", venue].filter(Boolean).join(" ")}</div>
        <div class="badges">${badges.map(b=>`<span class="badge">${b}</span>`).join("")}${year}${cites}</div>
        <div>${doi}</div>
      </article>`;
  };
  const renderList = (el, items)=>{ el.classList.remove("skeleton"); el.innerHTML = items.map(makeCardHTML).join(""); };
  const uniqueYears = items => [...new Set(items.map(x=>x.published).filter(Boolean))].sort((a,b)=>b-a);

  async function getORCIDWorks(orcid){
    const r = await fetch(`https://pub.orcid.org/v3.0/${orcid}/works`, {headers:{Accept:"application/json"}});
    if(!r.ok) throw new Error("ORCID fetch failed");
    return r.json();
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
      const authorNames = (m.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(" ")).filter(Boolean);
      if(authorNames.length) item.authors = authorNames.join(", ");
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
  async function getBioRxivDoisByORCID(orcid){
    const dois = new Set();
    try{
      const r = await fetch(`https://api.biorxiv.org/details/orcid/${orcid}/0`);
      if(!r.ok) return dois;
      const j = await r.json();
      (j.collection||[]).forEach(x=>{ if(x.doi) dois.add(x.doi.toLowerCase()); });
    }catch(_){}
    return dois;
  }
  async function getOSFNodeSummary(nodeId){
    try{
      const r = await fetch(`https://api.osf.io/v2/nodes/${nodeId}/`);
      if(!r.ok) return null;
      const j = await r.json();
      return j.data;
    }catch(_){ return null; }
  }
  async function getOSFChildren(nodeId){
    try{
      const r = await fetch(`https://api.osf.io/v2/nodes/${nodeId}/children/`);
      if(!r.ok) return [];
      const j = await r.json();
      return j.data || [];
    }catch(_){ return []; }
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

  // run everything
  (async function init(){
    try{
      const data = await getORCIDWorks(CONFIG.ORCID);
      const groups = data.group || [];
      const works = groups.map(g => g["work-summary"]?.[0]).filter(Boolean);

      const jArticles = works.filter(w => workType(w)==="journal-article");
      const preprints = works.filter(w => workType(w)==="preprint");

      const norm = (w, type)=>({
        type,
        title: w.title?.title?.value || "",
        published: pubYear(w),
        doi: (()=>{ let d = extId(w["external-ids"],"doi"); return d ? d.replace(/^doi:/i,"").trim() : null; })(),
        url: w.url || null,
        journal: w["journal-title"]?.value || null,
        authors: "",
        citations: null,
        is_bio: false
      });

      PUBS = jArticles.map(w => norm(w,"journal"));
      PREPRINTS = preprints.map(w => norm(w,"preprint"));

      const bioDois = await getBioRxivDoisByORCID(CONFIG.ORCID);
      PREPRINTS.forEach(p=>{
        p.is_bio = isBio(p.doi) || (p.doi && bioDois.has(p.doi.toLowerCase()));
      });

      await Promise.all(PUBS.map(enrichWithCrossref));
      await Promise.all(PREPRINTS.map(enrichWithCrossref));

      els.countPubs.textContent = PUBS.length;
      els.countPreprints.textContent = PREPRINTS.length;
      els.countBiorxiv.textContent = PREPRINTS.filter(p=>p.is_bio).length;

      const totalCites = [...PUBS, ...PREPRINTS].reduce((s,x)=> s + (x.citations||0), 0);
      els.totalCitations.textContent = totalCites;

      const openalex = await getOpenAlexAuthorByORCID(CONFIG.ORCID);
      if(openalex?.summary_stats?.h_index != null){
        els.hIndex.textContent = openalex.summary_stats.h_index;
      }

      if(CONFIG.WOS_PEER_REVIEWS_OVERRIDE != null){
        els.wosPeerReviews.textContent = CONFIG.WOS_PEER_REVIEWS_OVERRIDE;
      } else {
        els.wosPeerReviews.textContent = "—";
      }

      const years = uniqueYears(PUBS);
      els.yearFilter.innerHTML = `<option value="">All</option>` + years.map(y=>`<option>${y}</option>`).join("");
      els.yearFilter.addEventListener("change", applyPubFilters);
      els.sortSel.addEventListener("change", applyPubFilters);
      applyPubFilters();

      renderList(els.preList, PREPRINTS);

      const latest = [...PUBS, ...PREPRINTS].sort((a,b)=> (b.published||0)-(a.published||0))[0];
      if(latest){
        els.latestHighlight.innerHTML = `<li><a href="${latest.url || (latest.doi?`https://doi.org/${latest.doi}`:'#')}" target="_blank" rel="noopener">${latest.title}</a> (${latest.published||'—'})</li>`;
      }

      // OSF project(s)
      const osfItems = [];
      for(const node of CONFIG.OSF_NODES){
        const main = await getOSFNodeSummary(node);
        if(main){
          osfItems.push({ title: main.attributes.title || "OSF Project", url: `https://osf.io/${node}`, desc: main.attributes.description || "", badge: "OSF Project" });
          const kids = await getOSFChildren(node);
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
      els.pubList.classList.remove("skeleton");
      els.preList.classList.remove("skeleton");
      els.projectList.classList.remove("skeleton");
      els.pubList.innerHTML = `<p>Could not load publications from ORCID. Check your ORCID in <code>script.js</code>.</p>`;
      els.preList.innerHTML = `<p>Could not load preprints.</p>`;
      els.projectList.innerHTML = `<p>Could not load OSF projects.</p>`;
    }
  })();
});
