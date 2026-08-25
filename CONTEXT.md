# camundatest

Prozesse für Camunda 8 entstehen hier durch natürliche Sprache in einer Claude-Code-Session
und werden über viele Runden hinweg weiter geformt.

## Language

**Prozess-Beschreibung**:
Die kurze, von Hand lesbare Datei, die einen Prozess vollständig beschreibt — ohne BPMN-XML und ohne Koordinaten.
_Avoid_: DSL, Spec, Modell, Quelle

**Diagramm**:
Die aus einer Prozess-Beschreibung erzeugte `.bpmn`-Datei. Sie wird nicht von Hand gepflegt.
_Avoid_: BPMN (das ist der Standard, nicht die Datei), Prozessdatei

**Struktur**:
Schritte, Verzweigungen, Bedingungen und Ausführungs-Bindings eines Prozesses. Gehört der Prozess-Beschreibung.
_Avoid_: Logik, Inhalt

**Layout**:
Positionen und Kantenverläufe im Diagramm. Gehört dem Menschen, nicht der Prozess-Beschreibung.
_Avoid_: Darstellung, DI

**Drift**:
Eine strukturelle Abweichung des Diagramms von dem, was zuletzt aus der Prozess-Beschreibung erzeugt wurde.
Unterschiede im Layout sind ausdrücklich kein Drift.
_Avoid_: Konflikt, Divergenz

**Signatur**:
Ein Hash der Struktur eines Diagramms, den der Renderer beim Erzeugen im Diagramm hinterlässt.
An ihr erkennt der nächste Lauf, ob die Struktur seither von Hand verändert wurde (ADR 0004).
_Avoid_: Fingerabdruck, Prüfsumme

**Renderer**:
Das Programm, das aus einer Prozess-Beschreibung ein Diagramm erzeugt und dabei das Layout berechnet.
_Avoid_: Generator, Compiler, Transformer

**Durchfallen**:
Ein Zweig, der nicht mit `ende:` oder `weiter-bei:` schließt, läuft hinter dem umschließenden
`frage:`-Block weiter. Ein Zweig, der nur durchfällt, wird weggelassen.
_Avoid_: Fallthrough, implizites Ende

**Zusammenführung**:
Das Gateway, das durchgefallene Zweige wieder auf einen Weg bringt. Es entsteht aus der Struktur
und hat in der Prozess-Beschreibung keine Zeile.
_Avoid_: Join, Merge

**Marke**:
Der Name, unter dem ein Schritt als Sprungziel ansprechbar ist (`marke:`/`weiter-bei:`). Der
Notausgang für Rücksprünge, nicht der Normalfall.
_Avoid_: Label, Anker, Sprungmarke

**Glossar**:
Das Gedächtnis für technische Namen. Ist ein Begriff dort bekannt, gewinnt sein eingetragener
Name gegen einen abweichenden Vorschlag aus der Prozess-Beschreibung. Es ist die vorhandene
Glossardatei des Projekts und bleibt ein Glossar — kein Konfigurationsspeicher.
_Avoid_: Namensregister, Mapping, Wörterbuch

**Technischer Name**:
Der Name, unter dem ein Begriff im Diagramm auftaucht — der Job-Type eines Service Tasks.
Im Glossar steht er in der Zeile `_Technischer Name_:` unter dem Begriff.
_Avoid_: Bezeichner (das ist die Element-ID), Slug, Key

**Prozessvariable**:
Ein benanntes Datum, das durch den Prozess läuft. Es kommt beim Start herein (`eingang:`) oder
entsteht an einem Schritt (`erzeugt:`) und wird in Bedingungen gelesen.
_Avoid_: Feld, Payload, Kontext

**Variablenname**:
Der technische Name einer Prozessvariablen — das, was in einem FEEL-Ausdruck steht. Im Glossar
steht er in der eigenen Zeile `_Variablenname_:`, damit ein Job-Type ihn nicht überschreibt.
_Avoid_: Variablen-ID, Schlüssel

**Zuordnung**:
Was im Diagramm festhält, welche Variable ein Schritt weitergibt (`zeebe:ioMapping`). Sie grenzt
ein: liegt sie an, läuft von allem, was der Schritt zurückgibt, genau die genannte Variable weiter.
_Avoid_: Mapping, Binding
