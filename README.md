# Camunda-8-Prozesse aus natürlicher Sprache

Ein Template. Du beschreibst in einer Claude-Code-Session, was passieren soll — daraus entsteht
eine **Prozess-Beschreibung** (`processes/<name>.prozess.yaml`), und ein Renderer erzeugt das
**Diagramm** (`.bpmn`), berechnet das Layout und prüft es, bevor es geschrieben wird.

Der Desktop Modeler steht offen daneben und lädt beim Fokuswechsel von selbst nach.

## Loslegen

```bash
npm install                                              # bündelt dabei den Camunda-Linter
npm run prozess -- processes/smoke-test.prozess.yaml     # erzeugt processes/smoke-test.bpmn
npm test
```

Danach `processes/smoke-test.*` löschen oder als Vorlage weiterbenutzen.

Im Normalfall tippst du keinen dieser Befehle selbst. Sag in der Session einfach, was passieren
soll — der Skill `prozess-beschreibung` erklärt dem Agenten den Rest:

> „Bau mir einen Urlaubsantrag: Mitarbeiter stellt Antrag, Vorgesetzter prüft. Bei mehr als zehn
> Tagen muss zusätzlich die Geschäftsführung freigeben, sonst direkt bestätigen."

## Das Prinzip

| | gehört | |
| --- | --- | --- |
| **Struktur** | der Prozess-Beschreibung | Schritte, Verzweigungen, Bedingungen, Job-Types |
| **Layout** | dir | Positionen und Kantenverläufe. Was du im Modeler verschiebst, bleibt liegen |
| **Namen** | dem Glossar in `CONTEXT.md` | ein eingetragener technischer Name gewinnt gegen jeden Vorschlag |

Änderst du im Modeler die **Struktur**, wird nichts überschrieben: der Lauf hält an und benennt
jede Abweichung (**Drift**). Du entscheidest, ob sie übernommen oder verworfen wird.
Zurückübersetzt wird nie — es gibt keinen Weg vom Diagramm zurück zur Beschreibung (ADR 0002).

## Die Form

```yaml
prozess: urlaub              # technischer Name, wird die Prozess-ID
name: Urlaubsantrag          # optional, der lesbare Name
start:
  eingang: [Urlaubstage]     # was beim Start von außen hereinkommt
ablauf:
  - mensch: Antrag prüfen         # ein User Task
    erzeugt: Abweichung           # unter diesem Namen läuft das Ergebnis weiter
  - system: Resturlaub buchen     # ein Service Task …
    job-type: resturlaub-buchen   # … der einen Job-Type tragen muss
  - frage: Mehr als zehn Tage?    # ein exklusives Gateway
    wenn: =urlaubstage > 10       # FEEL-Bedingung, immer mit `=`
    dann:
      - mensch: Freigabe Geschäftsführung
    sonst:
      - mensch: Bestätigen
  - ende: Fertig                  # muss der letzte Schritt sein
```

Dazu: `marke:`/`weiter-bei:` für Rücksprünge, verschachtelte Verzweigungen, Durchfallen hinter
den `frage:`-Block. Alles Weitere steht in `.claude/skills/prozess-beschreibung/SKILL.md` — das
ist zugleich die vollständige Referenz der Form.

## Die zwei Befehle

```bash
npm run prozess -- processes/<name>.prozess.yaml
    [--diagramm <pfad>]        # woandershin schreiben
    [--layout-neu]             # verschobene Positionen wegwerfen, Layout neu rechnen
    [--drift-verwerfen]        # trotz Handänderung erzeugen und sie überschreiben
    [--glossar <pfad.md>]      # andere Glossardatei (Voreinstellung CONTEXT.md)
    [--plattform-version 8.9.0]

npm run deploy -- <name> [--profil <name>]
```

Deployen passiert **nur auf ausdrücklichen Zuruf**. Kein Erzeugen wartet darauf, kein Lauf
schlägt fehl, weil kein Cluster läuft. Es läuft über die offizielle CLI `c8ctl`
(`npm install -g @camunda8/cli`); eigene REST-Aufrufe werden ausdrücklich nicht geschrieben.

## Was ein Lauf prüft

1. **Schema** — ein unbekannter Schlüssel wird abgelehnt, nicht geraten. *Fehler*
2. **Drift** — die Signatur im vorhandenen Diagramm gegen dessen tatsächliche Struktur. *Hält an*
3. **Glossar** — bekannter Begriff gewinnt, neuer wird nachgetragen und berichtet. *Warnung*
4. **FEEL** — jeder `wenn:`-Ausdruck wird als Ausdruck gelesen. *Fehler*
5. **Variablen** — jede benutzte Variable gegen die, die es gibt. *Warnung*
6. **Linter** — der echte Camunda-8-Kompatibilitätslinter, derselbe wie im Desktop Modeler,
   dazu Gateways ohne Standardpfad und unerreichbare Elemente. *Fehler + Warnung*

Ein Fehler heißt: es entsteht kein Diagramm, das alte bleibt unverändert liegen.

## Grenzen

- **Zuständigkeiten** (`gruppe:` an einem `mensch:`-Schritt) gibt es nicht — der Schlüssel wird
  abgelehnt statt ersatzweise gerendert.
- **Formulare** sind out of scope. Die Linter-Warnung dazu bleibt stehen.
- **Kein Rückparsen**, **kein BPMN von Hand**, **nie ungefragt deployen**.

## Voraussetzungen

- Node 24+ (führt die `.ts`-Dateien direkt aus, kein Build-Schritt)
- Camunda Desktop Modeler — optional, als Anzeige daneben
- `c8ctl` — nur zum Deployen

## Wo was steht

| | |
| --- | --- |
| `.claude/skills/prozess-beschreibung/` | die Arbeitsteilung zwischen Agent und Renderer — und die Referenz der Form |
| `CONTEXT.md` | Domänensprache und Glossar. Neue technische Namen landen hier |
| `docs/adr/` | die vier Entscheidungen mit Begründung |
| `src/` | der Renderer |
