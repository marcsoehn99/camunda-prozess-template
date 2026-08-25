# camundatest

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, used verbatim as `Status:` values in issue files. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Prozesse formen

Prozesse werden als Prozess-Beschreibung (`processes/<name>.prozess.yaml`) gepflegt; das
Diagramm erzeugt `npm run prozess -- <datei>`. Siehe `.claude/skills/prozess-beschreibung/`.
`.bpmn`-Dateien werden nie von Hand bearbeitet (ADR 0002).
