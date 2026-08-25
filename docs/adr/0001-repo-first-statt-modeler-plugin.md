# Repo-first statt Modeler-Plugin

Der Wunsch war, Prozesse „im Camunda 8 Modeler" per Sprache zu erstellen. Wir tun das trotzdem
vom Terminal aus: Claude Code schreibt die Dateien ins Repo, der Desktop Modeler bleibt Anzeige
und Editor daneben. Grund ist ein verifizierter Befund im Modeler-Bundle 5.50.1 — der Modeler
prüft bei `app.focused` selbst, ob die Datei sich geändert hat, und lädt sie still nach, solange
der Tab keine ungespeicherten Änderungen hat. Damit liefert Repo-first die gewünschte
Rückkopplung ohne eine Zeile Plugin-Code.

## Considered Options

Ein Plugin mit einem Eingabefeld direkt im Modeler-Fenster wäre die wörtliche Erfüllung der
Anforderung gewesen. Es kostet ein eigenes Client-Plugin, einen eigenen LLM-Aufruf samt
API-Key-Verwaltung im Modeler — und schließt Claude Code als Werkzeug aus. Ein Web Modeler
scheidet aus: Camunda 8 Run liefert keinen aus.

## Consequences

Der Renderer und der Loop bleiben unabhängig von der Oberfläche. Ein Modeler-Plugin könnte
später auf demselben Renderer aufsetzen, ohne dass daran etwas umgebaut werden muss.
