# Matheus Gallas Lopes — academic website

Academic website in English with a minimal green visual system, responsive layout, filtered scholarly outputs, research areas, collaboration visualizations, and an academic profile.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Publication updates

Use the OpenAlex author ID `A5058545919` and ORCID `0000-0001-5375-2335`. Store the OpenAlex API key as a deployment secret named `OPENALEX_API_KEY`; never add it to browser code or commit it to the repository.

The update process must request `publication_date`, `type`, `primary_location`, `locations`, `authorships`, `doi`, `ids`, and citation data. It must paginate until `next_cursor` is null, deduplicate by DOI and canonical identifiers, and classify each record once.

Current OpenAlex types should be preserved when meaningful, including `article`, `review`, `preprint`, `conference-paper`, `conference-abstract`, `dataset`, and `software`. Protocols.io DOIs are classified as protocols. OSF registrations are classified from their registration metadata and must not also appear as preprints.

Conference outputs appear only when OpenAlex or Crossref explicitly classifies them as conference papers or conference abstracts.

The four latest outputs are selected automatically using full publication dates, not publication years alone.
