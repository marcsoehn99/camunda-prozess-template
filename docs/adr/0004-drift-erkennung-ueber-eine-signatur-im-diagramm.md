# Drift wird über eine Signatur im Diagramm erkannt, und der Autor löst ihn in der Beschreibung auf

Jedes erzeugte Diagramm trägt an seinen Definitions eine **Signatur** seiner eigenen Struktur:
`prozess:signatur="<16 Hex-Zeichen>"`, ein Hash über Prozess-ID und -Name, alle Elemente samt Art,
Name, Job-Type und Standardpfad und alle Verbindungen samt Bedingung und Beschriftung — sortiert,
damit die Reihenfolge im XML nicht zählt. Positionen und Kantenverläufe gehen **nicht** ein.

Beim nächsten Lauf wird die Struktur des vorgefundenen Diagramms neu signiert. Stimmt sie mit der
eingetragenen Signatur überein, hat niemand die Struktur angefasst. Weicht sie ab, wurde von Hand
strukturell gearbeitet — dann wird das Diagramm mit dem verglichen, was die Prozess-Beschreibung
sagt, und jede einzelne Abweichung benannt.

Drift ist **beides zusammen**: abweichende Signatur *und* mindestens eine benennbare Abweichung
zur Prozess-Beschreibung. Fehlt das Zweite, gäbe es nichts zu verlieren.

## Considered Options

Ohne Merkposten ginge es nicht: ein Vergleich „vorhandenes Diagramm gegen frisch erzeugtes" allein
kann eine Handänderung am Diagramm nicht von einer Änderung an der Prozess-Beschreibung
unterscheiden — jede beabsichtigte Änderung an der Beschreibung würde den Lauf anhalten.

Eine **Datei daneben** (`<name>.signatur`) wurde verworfen: der Seam nimmt Inhalte, keine Pfade,
und seine Eingaben sind in der Spec festgelegt (Beschreibung, vorheriges Diagramm, Glossar). Eine
vierte Datei hätte den Seam aufgeweicht und wäre außerdem beim Verschieben oder Kopieren eines
Prozesses verlorengegangen.

Die **ganze Struktur** statt eines Hashes einzutragen hätte erlaubt, Handänderungen exakt von
Beschreibungsänderungen zu trennen, hätte aber ein kiloweise großes Datenfeld in eine Datei
geschrieben, die der Autor gelegentlich selbst ansieht. Der Hash genügt für die Frage „wurde
angefasst?"; für das *Was* ist der Vergleich gegen die Prozess-Beschreibung ohnehin die
brauchbarere Auskunft — sie benennt genau das, was beim Erzeugen verloren ginge.

Die Signatur sitzt als Attribut an den Definitions, in eigenem Namensraum — dieselbe Bauform, die
Camunda selbst für `modeler:executionPlatform` benutzt, und die der Modeler über sein Speichern
hinweg erhält. Ein eigenes Kindelement unter `bpmn:definitions` wäre nicht schema-gültig.

## Consequences

**Wie der Autor eine gemeldete Abweichung auflöst.** Es gibt genau zwei Wege, und beide enden
damit, dass das Diagramm neu erzeugt wird — zurückübersetzt wird nichts (ADR 0002):

- **Übernehmen:** die Handänderung in die Prozess-Beschreibung schreiben, dann
  `--drift-verwerfen`. Das Diagramm entsteht neu aus der jetzt richtigen Beschreibung.
- **Verwerfen:** sofort `--drift-verwerfen`. Die Handänderung ist weg.

Ohne den Schalter wird nichts geschrieben; das von Hand veränderte Diagramm bleibt unangetastet
liegen, solange der Autor nicht entschieden hat.

Ein Diagramm **ohne** eingetragene Signatur hat keine Vergleichsgrundlage — dann wird gewarnt und
überschrieben, nicht angehalten. Das betrifft alles, was vor dieser Entscheidung erzeugt wurde,
und genau einmal pro Datei.

Ein Umbenennen zählt als Struktur, nicht als Layout: die Element-IDs leiten sich aus den Namen ab.
Wer im Modeler umbenennt, bekommt darum Drift gemeldet und keine stillschweigend übernommene
Position.
