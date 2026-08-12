const state = { outputs: [], filter: "Journal article", visible: 5 };
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
const card = (o, i) =>
  `<a class="latest-item" href="${esc(o.url)}" target="_blank" rel="noopener"><span class="number">0${i + 1}</span><small>${esc(o.type)} · ${esc(o.year)}</small><h3>${esc(o.title)}</h3><span>${esc(o.venue || "")} ↗</span></a>`;
const row = (o) =>
  `<article class="publication"><div><small>${esc(o.type)}</small><span>${esc(o.year)}</span></div><h3>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.title)}</a>` : esc(o.title)}</h3><p>${esc(o.authors)}</p><p>${esc(o.venue || "")}</p></article>`;
function render() {
  const latest = state.outputs
    .filter((o) => o.type === "Journal article" || o.type === "Preprint")
    .slice(0, 4);
  document.querySelector("#latest").innerHTML = latest.map(card).join("");
  const order = [
      "Journal article",
      "Preprint",
      "Protocol",
      "Preregistration",
      "Data / code",
      "All",
    ],
    present = new Set(state.outputs.map((o) => o.type)),
    types = order.filter((t) => t === "All" || present.has(t));
  document.querySelector("#filters").innerHTML = types
    .map(
      (t) =>
        `<button class="${t === state.filter ? "active" : ""}" data-type="${esc(t)}">${esc(t)}</button>`,
    )
    .join("");
  const shown =
    state.filter === "All"
      ? state.outputs
      : state.outputs.filter((o) => o.type === state.filter);
  const visible = shown.slice(0, state.visible);
  document.querySelector("#publication-list").innerHTML = visible.map(row).join("") +
    (shown.length > visible.length ? `<button class="show-more" id="show-more">Show more <span>${shown.length - visible.length} remaining</span></button>` : "");
  document.querySelector("#show-more")?.addEventListener("click", () => {
    state.visible += 5;
    render();
  });
  document.querySelectorAll("[data-type]").forEach(
    (b) =>
      (b.onclick = () => {
        state.filter = b.dataset.type;
        state.visible = 5;
        render();
      }),
  );
}
fetch("data/publications.json", { cache: "no-cache" })
  .then((r) => {
    if (!r.ok) throw Error();
    return r.json();
  })
  .then((data) => {
    state.outputs = data.outputs || [];
    render();
  })
  .catch(() => {
    document.querySelector("#latest").innerHTML =
      "<p>Research outputs are temporarily unavailable.</p>";
    document.querySelector("#publication-list").innerHTML =
      "<p>Research outputs are temporarily unavailable.</p>";
  });
const coords = {
  AR: [-38.4, -63.6],
  AU: [-25.3, 133.8],
  AZ: [40.1, 47.6],
  BE: [50.5, 4.5],
  BR: [-14.2, -51.9],
  CA: [56.1, -106.3],
  CH: [46.8, 8.2],
  CL: [-35.7, -71.5],
  CN: [35.9, 104.2],
  DE: [51.2, 10.4],
  ES: [40.5, -3.7],
  FR: [46.2, 2.2],
  GB: [55.4, -3.4],
  IE: [53.1, -8.2],
  IT: [41.9, 12.6],
  LU: [49.8, 6.1],
  NL: [52.1, 5.3],
  PT: [39.4, -8.2],
  RU: [61.5, 105.3],
  US: [37.1, -95.7],
};
function drawCountryRanking(data) {
  const el = document.querySelector("#country-ranking");
  if (!el) return;
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const top = (data.countries || []).slice(0, 7);
  const max = Math.max(1, ...top.map((x) => x.works));
  el.innerHTML = top.map((x) => `<div class="country-row"><div><span>${esc(names.of(x.code) || x.code)}</span><strong>${x.works}</strong></div><i><b style="width:${(x.works / max) * 100}%"></b></i></div>`).join("");
}
function drawMap(data) {
  if (!window.L) return;
  const map = L.map("world-map", { scrollWheelZoom: false }).setView(
    [15, 0],
    1,
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 6,
    attribution: "© OpenStreetMap",
  }).addTo(map);
  data.countries.forEach((x) => {
    if (!coords[x.code]) return;
    L.circleMarker(coords[x.code], {
      radius: 5 + Math.sqrt(x.works) * 1.5,
      color: "#175642",
      weight: 1,
      fillColor: "#2f8065",
      fillOpacity: 0.72,
    })
      .addTo(map)
      .bindTooltip(`${esc(x.code)} · ${x.works} collaborative outputs`);
  });
}
fetch("data/collaborations.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((data) => {
    drawCountryRanking(data);
    drawMap(data);
  })
  .catch(() => {});
function drawYears(byYear) {
  const el = document.querySelector("#year-chart");
  if (!el) return;
  const entries = Object.entries(byYear).filter(([y]) => +y >= 2018),
    max = Math.max(
      1,
      ...entries.flatMap(([, v]) => [v.journals || 0, v.preprints || 0]),
    );
  el.innerHTML = entries
    .map(
      ([year, v]) =>
        `<div class="year"><div class="bars"><i class="journal" style="height:${((v.journals || 0) / max) * 100}%" title="${v.journals || 0} journal articles"></i><i class="preprint" style="height:${((v.preprints || 0) / max) * 100}%" title="${v.preprints || 0} preprints"></i></div><span>${year}</span></div>`,
    )
    .join("");
}
fetch("data/metrics.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((m) => {
    const set = (id, v) =>
      document.querySelector(id)?.replaceChildren(v ?? "—");
    set("#metric-journals", m.counts?.["Journal article"]);
    set("#metric-preprints", m.counts?.Preprint);
    set("#metric-protocols", m.counts?.Protocol);
    set("#metric-registrations", m.counts?.Preregistration);
    set("#metric-h", m.h_index);
    set("#metric-citations", Number.isFinite(m.total_citations) ? m.total_citations.toLocaleString() : "—");
    drawYears(m.by_year || {});
  })
  .catch(() => {});
const menu = document.querySelector("#menu"),
  nav = document.querySelector("#nav");
menu.onclick = () => {
  const open = menu.getAttribute("aria-expanded") === "true";
  menu.setAttribute("aria-expanded", String(!open));
  nav.classList.toggle("open", !open);
};
nav.querySelectorAll("a").forEach(
  (a) =>
    (a.onclick = () => {
      nav.classList.remove("open");
      menu.setAttribute("aria-expanded", "false");
    }),
);
