# Die Prozess-Beschreibung ist die Quelle der Wahrheit, Drift wird gemeldet statt repariert

Für jeden Prozess liegen zwei Dateien im Repo: die gepflegte Prozess-Beschreibung und das daraus
erzeugte Diagramm. Gepflegt wird ausschließlich die Beschreibung. Wird das Diagramm strukturell
von Hand verändert, hält der Loop an und zeigt die Abweichung, statt sie zu überschreiben oder
zurückzuparsen.

Der Grund für die Meldung ist ein verifizierter Befund im Modeler-Bundle 5.50.1: der Modeler
speichert bei `app.blurred` automatisch. Ohne Drift-Erkennung gingen Änderungen aus dem Modeler
also lautlos verloren — man bemerkt es erst Runden später.

## Considered Options

Ein vollständiger Round-Trip (Diagramm zurück in die Prozess-Beschreibung parsen) wurde verworfen:
der Rückparser müsste alles verstehen, was der Modeler schreiben kann, und würde löschen, was er
nicht versteht. Das Diagramm als Quelle der Wahrheit wurde verworfen, weil dann bei jeder Runde
hunderte Zeilen XML samt Koordinaten bearbeitet werden müssten — genau das, was die
Prozess-Beschreibung vermeidet.

## Consequences

Damit der Verzicht auf den Rückparser tragfähig ist, übernimmt der Renderer beim Erzeugen die
vorhandenen Positionen aller Elemente, die es schon gab, und layoutet nur neue. Layout gehört
damit dem Menschen, Struktur der Prozess-Beschreibung — und Layout-Unterschiede zählen nicht als
Drift. Ohne diese Ergänzung würde die häufigste Modeler-Änderung (eine Box verschieben) den Loop
ständig anhalten, bis niemand mehr hinsieht.

Woran der Renderer erkennt, was er zuletzt erzeugt hat, und wie der Autor eine gemeldete
Abweichung auflöst, steht in ADR 0004.
