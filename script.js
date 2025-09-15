function openTab(tabName) {
  const contents = document.getElementsByClassName("tabcontent");
  for (let c of contents) c.style.display = "none";
  document.getElementById(tabName).style.display = "block";
}

// Example: fetch ORCID works
async function loadPublications() {
  const orcid = "0000-0001-5375-2335"; // your ORCID
  const url = `https://pub.orcid.org/v3.0/${orcid}/works`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await res.json();
  const list = document.getElementById("pub-list");
  data.group.slice(0, 10).forEach(work => {
    const title = work["work-summary"][0].title.title.value;
    const year = work["work-summary"][0]["publication-date"]?.year?.value || "";
    const li = document.createElement("li");
    li.textContent = `${title} (${year})`;
    list.appendChild(li);
  });
}

loadPublications();
