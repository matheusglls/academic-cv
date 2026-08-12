# Matheus Gallas Lopes — academic website

Static academic website configured for GitHub Pages.

## Replace the current repository

Copy every file and folder in this package to the root of the `academic-cv` repository. The root must contain `index.html`, `style.css`, `script.js`, `data`, `scripts`, and `.github`.

## Required OpenAlex secret

Create a free OpenAlex API key. In the GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**. Name it `OPENALEX_API_KEY` and paste the key as its value.

## GitHub Pages setting

Open **Settings → Pages → Build and deployment** and select **GitHub Actions** as the source.

## Publish

Commit and push all files to `main`. Then open **Actions**, select **Update publications and deploy Pages**, and choose **Run workflow**. The workflow also runs every Monday.

## Scholarly output rules

- OpenAlex author: `A5058545919`
- ORCID: `0000-0001-5375-2335`
- Uses current OpenAlex fields: `primary_location`, `publication_date`, and current work types.
- Protocols.io DOIs are labeled `Protocol`.
- OSF registrations under node `5k9yv` are labeled `Registration`.
- Conference records are shown only when OpenAlex explicitly identifies `conference-paper` or `conference-abstract`.
- Records are deduplicated by DOI or canonical identifier.
- The four latest outputs are selected automatically by full publication date.
