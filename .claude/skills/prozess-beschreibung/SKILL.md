---
name: prozess-beschreibung
description: Erklärt die Arbeitsteilung zwischen Agent und Renderer für Camunda-8-Prozesse in diesem Repo. Benutzen, sobald ein Prozess erzeugt oder verändert werden soll — „bau mir einen Prozess", „füg nach der Freigabe noch einen Schritt ein", „das Diagramm stimmt nicht", „deploy das jetzt" — und immer, bevor eine `.bpmn`-Datei angefasst oder gegen einen Cluster deployt wird.
---

# Prozesse formen

## Die Arbeitsteilung in einem Satz

**Du schreibst ausschließlich die Prozess-Beschreibung. Das Diagramm erzeugt das Werkzeug.**

## Was du tust

1. Den Satz des Autors in eine Änderung an `processes/<name>.prozess.yaml` übersetzen.
2. `npm run prozess -- processes/<name>.prozess.yaml` aufrufen.
3. Meldungen lesen. Sie zeigen mit `datei:zeile` auf die Prozess-Beschreibung — dort wird
   korrigiert, nirgends sonst.
4. Dem Autor sagen, was sich geändert hat, und welche Warnungen stehen bleiben.

Der Desktop Modeler lädt beim Fokuswechsel von selbst neu. Es gibt nichts zu öffnen und nichts
zu exportieren.

## Layout gehört dem Autor

Liegt schon ein Diagramm da, behalten alle Elemente daraus ihre Positionen — auch die, die der
Autor im Modeler verschoben hat. Nur was neu in der Beschreibung auftaucht, wird automatisch
platziert; was verschwindet, verschwindet samt seiner Kanten.

Ein neu platziertes Element landet zwischen seinen Nachbarn und weicht nach unten aus, damit es
nichts überdeckt. Sitzt es dem Autor an der falschen Stelle, **schiebt er es im Modeler zurecht** —
das hält ab der nächsten Runde. Nichts davon gehört in die Beschreibung.

Nur wenn der Autor ausdrücklich danach fragt („räum das Bild auf", „rechne das Layout neu"):

```
npm run prozess -- processes/<name>.prozess.yaml --layout-neu
```

Das wirft alle verschobenen Positionen weg. Von selbst wird es nie aufgerufen.

## Struktur gehört der Beschreibung — Drift

Hat jemand am Diagramm die **Struktur** von Hand verändert — ein Element dazugemalt, eines
gelöscht, eines umbenannt, eine Verbindung gezogen —, hält der Lauf an, schreibt nichts und
benennt jede einzelne Abweichung. Das alte Diagramm bleibt unangetastet liegen.

Das passiert von selbst: der Desktop Modeler speichert, sobald sein Fenster den Fokus verliert.
Eine gemeldete Abweichung heißt also nicht „jemand hat gepfuscht", sondern „hier steht eine
Entscheidung, die noch nirgends festgehalten ist".

**Du entscheidest das nicht allein. Du legst dem Autor die beiden Wege vor:**

- **Übernehmen** — die Änderung soll bleiben: du schreibst sie in die Prozess-Beschreibung und
  rufst dann `--drift-verwerfen`. Das Diagramm entsteht neu aus der jetzt richtigen Beschreibung.
- **Verwerfen** — die Änderung war ein Versehen: sofort `--drift-verwerfen`. Sie ist dann weg.

```
npm run prozess -- processes/<name>.prozess.yaml --drift-verwerfen
```

Zurückübersetzt wird nichts (ADR 0002) — es gibt keinen Weg, aus dem Diagramm eine Beschreibung
zu machen. Beim Übernehmen schreibst **du** die Beschreibung nach, von Hand.

Ein bloß **verschobenes** Element löst das nie aus. Ein **umbenanntes** dagegen schon: die
Element-IDs leiten sich aus den Namen ab, ein neuer Name ist ein neues Element.

## Namen gehören dem Glossar

Der Autor spricht deutsch. Den technischen Namen — den `job-type:` eines `system:`-Schritts, den
Namen einer Prozessvariablen — schlägst **du** vor. Ob dein Vorschlag zählt, entscheidet das
Glossar in `CONTEXT.md`:

- **Begriff schon bekannt** — der eingetragene Name gewinnt, auch wenn du etwas anderes
  vorschlägst. Der Lauf sagt dir das als Warnung; deine Beschreibung darf so stehen bleiben.
- **Begriff neu** — dein Vorschlag wird ohne Rückfrage nachgetragen und am Ende des Laufs unter
  `Neue Begriffe:` genannt. **Diese Zeile gibst du dem Autor weiter** — sie ist die einzige
  Stelle, an der er sieht, was in seinem Repo entstanden ist.

Der Begriff ist der **Name des Schritts**, nicht der Job-Type: `system: Bestätigung senden`
merkt sich das Glossar unter „Bestätigung senden". Groß-/Kleinschreibung und Leerraum sind egal.

```markdown
**Bestätigung senden**:
Der Job-Type, unter dem ein Job Worker den Schritt „Bestätigung senden" aufgreift.
_Technischer Name_: `bestaetigung-senden`
```

Bei einer **Prozessvariablen** ist der Begriff das, was du bei `eingang:` oder `erzeugt:`
hinschreibst; den Variablennamen leitet das Werkzeug daraus ab (siehe „Datenfluss"). Er steht in
einer **eigenen Zeile**, damit ein gleichnamiger Schritt ihn nicht überschreibt:

```markdown
**Abweichung geklärt**:
Die Prozessvariable, unter der „Abweichung geklärt" durch den Prozess läuft.
_Variablenname_: `abweichungGeklaert`
```

### Einen Begriff umbenennen

Sagt der Autor „der Job-Type soll `benachrichtigung-senden` heißen", **änderst du die eine Zeile
`_Technischer Name_:` in `CONTEXT.md`** und lässt danach neu erzeugen. Der neue Name gilt ab
sofort für jeden Prozess, der diesen Schritt nennt.

- Die Beschreibung fasst du dabei **nicht** an — sie schlägt nur vor, das Glossar entscheidet.
  (Sauber ist es trotzdem, den `job-type:` mitzuziehen; dann hört die Warnung auf.)
- Element-IDs hängen am Schrittnamen, nicht am Job-Type: **verschobene Positionen bleiben.**
- Soll der **gesprochene Begriff** ein anderer werden („heißt ab jetzt Kunde informieren"), ist
  das ein anderer Schritt: Beschreibung und Glossareintrag umbenennen. Das ändert die Element-ID,
  also geht die Position dieses einen Elements verloren.

Löschst du einen Eintrag ganz, ist die Erinnerung weg — der nächste Lauf trägt den Vorschlag aus
der Beschreibung neu ein.

## Deployen — nur auf Zuruf

**Du deployst nie von selbst.** Nicht nach dem Erzeugen, nicht „zur Sicherheit", nicht weil der
Lauf sauber war. Erst wenn der Autor es ausspricht — „deploy das jetzt", „schick das rüber",
„läuft das auf meinem Cluster?" —, rufst du:

```
npm run deploy -- <name>
```

`<name>` ist der Prozessname (`smoke-test` meint `processes/smoke-test.bpmn`); ein Pfad geht auch.
Deployt wird, was gerade als Diagramm dort liegt — es wird nichts erzeugt und nichts geprüft.
Wurde die Beschreibung seither geändert, lässt du **erst** erzeugen und deployst dann.

Der Broker prüft schärfer als der Linter. Lehnt er ab, steht seine Meldung da; sie zeigt auf
BPMN-Elemente, nicht auf die Beschreibung — du übersetzt sie dem Autor zurück auf die Zeile, aus
der das Element stammt.

| Meldung | Bedeutung |
| --- | --- |
| `Deployt: <id> (Version n)` | Angenommen. Die Version zählt bei jedem Deployen hoch. |
| `Command 'CREATE' rejected …` | Der Broker hat abgelehnt. Seine Begründung steht dabei. |
| `Kein Cluster erreichbar unter …` | Es läuft keiner. **Kein Grund, irgendetwas zu ändern** — Erzeugen und Prüfen brauchen ihn nicht. |
| `… nannte aber keine deployte Ressource` | Kein Fehler, aber auch keine Zusage. Nicht als Erfolg weitergeben; die rohe Ausgabe steht darunter. |
| `c8ctl ist nicht installiert` | Die offizielle Camunda-CLI fehlt. Dem Autor sagen, nicht ersatzweise selbst gegen die REST-Schnittstelle rufen. |
| `Kein Diagramm unter …` | Zu diesem Prozess wurde noch nie erzeugt. |

Kein anderer Befehl setzt einen laufenden Cluster voraus, und kein Lauf schlägt fehl, weil keiner
läuft. Ein toter Cluster ist nie ein Grund, das Erzeugen anzuzweifeln.

## Was du nie tust

- **Kein BPMN-XML schreiben oder bearbeiten.** Auch nicht „nur schnell". Eine `.bpmn` ist erzeugt,
  nie gepflegt (ADR 0002).
- **Nie ungefragt `--drift-verwerfen`.** Der Schalter wirft eine Handänderung des Autors weg. Er
  wird nur benutzt, wenn der Autor die Wahl getroffen hat.
- **Das Werkzeug nicht umgehen.** Es gibt keinen Weg, ein Diagramm zu schreiben, ohne dass der
  Camunda-8-Kompatibilitätslinter mitgelaufen ist — und den soll es auch nicht geben.
- **Nie ungefragt deployen.** Der Cluster wird nur auf ausdrücklichen Zuruf angefasst.
- **Keine Koordinaten.** Das Layout gehört dem Autor und dem Auto-Layout, nicht der Beschreibung.
- **Den Autor nicht nach Namen fragen.** Vorschlagen, nachtragen lassen, am Ende berichten. Ein
  Prozess mit acht Schritten darf keine acht Rückfragen bedeuten.
- **Das Glossar nicht als Ablage benutzen.** Es nimmt Begriffe mit ihrem technischen Namen auf,
  sonst nichts — keine Plattformversionen, keine Pfade, keine Schalter.
- **Nicht raten, was das Schema noch nicht kann.** Lehnt das Werkzeug einen Schlüssel ab, ist er
  noch nicht gebaut. Das dem Autor sagen, statt es zu umschreiben.

## Die Form, Stand heute

```yaml
prozess: freigabe          # technischer Name, wird die Prozess-ID
name: Freigabe             # optional, der lesbare Name
start:
  name: Start              # optional
ablauf:
  - mensch: Freigabe erteilen   # ein User Task
  - system: Rechnung buchen     # ein Service Task …
    job-type: rechnung-buchen   # … der einen Job-Type tragen muss
  - frage: Mehr als zehn Tage?  # ein exklusives Gateway
    wenn: =tage > 10            # die FEEL-Bedingung, immer mit `=`
    dann:
      - mensch: Freigabe Geschäftsführung
    sonst:
      - mensch: Bestätigen
  - ende: Fertig                # muss der letzte Schritt sein
```

### Zweige

- Die Bedingung aus `wenn:` hängt am Fluss des `dann:`-Zweigs. Der `sonst:`-Zweig ist der
  **Standardpfad** und trägt nie eine Bedingung.
- **Durchfallen:** endet ein Zweig nicht mit `ende:` oder `weiter-bei:`, läuft er hinter dem
  `frage:`-Block weiter. Ein Zweig, der nur durchfällt, wird **weggelassen** — `dann:` und
  `sonst:` sind einzeln optional, ein leerer Zweig wird abgelehnt.
- Bleibt danach mehr als ein Weg offen, führt das Werkzeug sie selbst wieder zusammen. Diese
  zusammenführenden Gateways stehen nirgends in der Beschreibung; sie werden auch nicht
  beschrieben.
- Verzweigungen dürfen ineinander stehen.

### Rücksprung

```yaml
  - system: Prüfen
    marke: pruefung        # Sprungziel
    job-type: pruefen
  - frage: In Ordnung?
    wenn: =inOrdnung
    sonst:
      - mensch: Korrigieren
      - weiter-bei: pruefung   # zurück zur Marke; danach folgt nichts mehr
```

`marke:` benennt einen Schritt, `weiter-bei:` springt dorthin. Das ist der Notausgang für
Schleifen, nicht der Normalfall — vorwärts genügt das Durchfallen.

### Datenfluss

**Erst hinschreiben, wenn er gebraucht wird.** Ein Prozess ohne Datenfluss bleibt gültig; frühe
Runden sollen leicht bleiben. Sobald der Autor über Daten redet („wenn der Betrag über 5000
liegt", „der Prüfer sagt, ob es passt"), gehört das hier hinein.

```yaml
start:
  eingang: [Rechnungsbetrag, Lieferant]   # was beim Start von außen hereinkommt
ablauf:
  - system: Rechnung prüfen
    job-type: rechnung-pruefen
    erzeugt: Abweichung                   # unter diesem Namen läuft das Ergebnis weiter
  - frage: Gibt es eine Abweichung?
    wenn: =abweichung                     # der Variablenname, nicht der Begriff
```

- **Du schreibst den Begriff, das Werkzeug bildet den Namen.** „Abweichung geklärt" wird
  `abweichungGeklaert`, „Rechnungsbetrag" wird `rechnungsbetrag`. Ein schon technisch
  geschriebener Begriff bleibt, was er ist. In `wenn:` steht immer der **Name**.
- Der Name gilt erst, wenn das Glossar zugestimmt hat. Steht dort schon ein anderer, gewinnt der —
  du siehst das als Warnung. Umbenannt wird über die Zeile `_Variablenname_:` in `CONTEXT.md`,
  nie durch Umschreiben der Beschreibung.
- `erzeugt:` gibt es an `mensch:` und `system:`. Im Diagramm wird daraus eine **Zuordnung**: von
  allem, was der Schritt zurückgibt, läuft genau diese eine Variable weiter.
- Dieselbe Variable darf an mehreren Stellen entstehen — zwei Zweige, die beide `erzeugt:
  Freigegeben` sagen, sind richtig und kein Fehler.
- `eingang:` erzeugt nichts im Diagramm; BPMN hat dafür keine Stelle. Es hält fest, woher eine
  Variable kommt, die nirgends im Prozess entsteht.
- **Jeder `wenn:`-Ausdruck wird als FEEL gelesen.** Ein Tippfehler in der Syntax ist ein Fehler;
  es entsteht kein Diagramm. Eine Variable, die weder unter `eingang:` steht noch von einem
  `erzeugt:` kommt, ist eine **Warnung** — ein Schritt ohne `erzeugt:` gibt zurück, was sein Job
  Worker zurückgibt, und das weiß die Beschreibung nicht. Meist heißt die Warnung trotzdem:
  Tippfehler, oder `eingang:` fehlt.

Mehr kann das Werkzeug heute nicht: Zuständigkeiten (`gruppe:`) kommen in einem späteren Ticket.
Bis dahin werden sie ausdrücklich abgelehnt, nicht ersatzweise gerendert.

## Wenn etwas klemmt

| Meldung | Bedeutung |
| --- | --- |
| `Unbekannter Schlüssel …` | Das Schema kann das noch nicht. Dem Autor sagen. |
| `A <User Task> should have a defined <Form>` | Warnung, kein Fehler. Formulare sind out of scope. |
| `… is only supported by Camunda 8.x or newer` | Die Ziel-Ausführungsplattformversion passt nicht — siehe ADR 0003. |
| `Kein Diagramm geschrieben.` | Es gab einen Fehler. Das alte Diagramm steht unverändert. |
| `… von Hand strukturell verändert` | Drift. Dem Autor die beiden Wege vorlegen — nie ungefragt `--drift-verwerfen`. |
| `… trägt keine Signatur` | Das Diagramm stammt aus der Zeit vor der Drift-Erkennung. Einmalig, dann erledigt. |
| `… heißt im Glossar \`x\`` | Der eingetragene Name hat gewonnen. Kein Fehler — oder der Autor will umbenennen. |
| `… lässt sich kein Variablenname bilden` | Der Begriff hinter `erzeugt:`/`eingang:` hat keine Buchstaben. |
| `… ist kein FEEL-Ausdruck, der sich lesen lässt` | Tippfehler in `wenn:`. Fehler, kein Diagramm. |
| `Der Ausdruck … benutzt \`x\`` | Die Variable kommt nirgends her. Meist ein Tippfehler oder ein fehlendes `eingang:`. |
| `… hat keinen Standardpfad` | Trifft keine Bedingung zu, bleibt der Prozess stehen. Sollte bei erzeugten Diagrammen nie vorkommen. |
| `… ist von keinem Startereignis aus erreichbar` | Ein Element hängt an keinem Pfad. Sollte bei erzeugten Diagrammen nie vorkommen. |
| `Kein Glossar unter CONTEXT.md` | Der Lauf merkt sich keine Namen. Dem Autor sagen. |
