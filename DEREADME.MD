<div align="center">

<img src="app/src/assets/YzPzCodeLogo.png" alt="YzPzCode Logo" width="180"/>

# YzPzCode

### Dein KI-Coding-Team, nur einen Klick entfernt.

**Hör auf, zwischen 5 verschiedenen Terminals zu jonglieren.** YzPzCode vereint Claude, Gemini, Codex, Opencode und Cursor in einer sauberen Oberfläche.

[![GitHub stars](https://img.shields.io/github/stars/wolfenazz/YzPzCode?style=social)](https://github.com/wolfenazz/YzPzCode/stargazers)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%20v2-blue?logo=tauri)](https://tauri.app)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019-61DAFB?logo=react)](https://react.dev)
[![Backend](https://img.shields.io/badge/Backend-Rust-orange?logo=rust)](https://rust-lang.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**[Jetzt installieren](#-schnellstart)** · **[Screenshots ansehen](#-die-app-in-aktion-sehen)** · **[Dokumentation lesen](docs/userguid.md)**

---

</div>

## Moment mal, was ist das hier?

Stell dir das vor: Du programmierst. Du möchtest, dass Claude dir alten Code erklärt, Gemini Tests generiert und Codex dir bei diesem kniffligen Algorithmus hilft.

**Der alte Weg?** Drei Terminalfenster. Drei verschiedene CLIs. Wie verrückt zwischen den Fenstern wechseln. Hin- und herkopieren. Den Verstand verlieren.

**Der YzPzCode-Weg?** Eine App. Raster-Layout. Alle deine KI-Agenten nebeneinander, und du kannst ihre Antworten vergleichen.

## Die App in Aktion sehen

<div align="center">

<img src="docs/capture/Capture1.PNG" width="45%"/>
<img src="docs/capture/Capture2.PNG" width="45%"/>
<img src="docs/capture/Capture3.PNG" width="45%"/>
<img src="docs/capture/Capture4.PNG" width="45%"/>

*Ja, so sauber ist das.*

</div>

## Warum du es lieben wirst

| Was du bekommst | Warum es genial ist |
|-----------------|---------------------|
| **Multi-Agenten-Raster** | Claude links, Gemini rechts. Vergleiche Ergebnisse sofort. Wähle den Gewinner. |
| **Ein-Klick-Setup** | Du weißt nicht, was installiert ist? Wir finden es heraus und leiten dich durch den Rest. |
| **Workspace-Voreinstellungen** | Speichere deine liebsten Agenten-Kombos. 3x2-Raster mit Claude + Gemini? Ein Klick. |
| **Echte Terminals** | Keine Simulation — das sind echte PTY-Sessions mit voller Interaktivität. |
| **Plattformübergreifend** | Windows, macOS, Linux. Dein OS, deine Wahl. |
| **Leichtgewichtig** | Gebaut mit Tauri, nicht Electron. Dein RAM wird es dir danken. |

## Die Agenten

Wir unterstützen die Schwergewichte:

<div align="center">

| Agent | CLI | Superkraft |
|-------|-----|------------|
| **Claude** | `claude` | Tiefes Denken, erklärt Code wie ein geduldiger Senior-Entwickler |
| **Gemini** | `gemini` | Schnell, multimodal, das Beste von Google |
| **Codex** | `codex` | Code-Generierung, die wirklich funktioniert |
| **Opencode** | `opencode` | Open-Source-Freiheit |
| **Cursor** | `cursor` | KI-Assistenz auf IDE-Niveau |

</div>

## Schnellstart

**Du brauchst:** Node.js 18+ und Rust (neueste stabile Version)

```bash
# 1. Klonen
git clone https://github.com/wolfenazz/YzPzCode.git
cd YzPzCode/app

# 2. Abhängigkeiten installieren
npm install

# 3. Starten
npm run tauri dev
```

Fertig. Die App erkennt, welche KI-CLIs du installiert hast, und hilft dir, den Rest einzurichten.

### macOS-Benutzer

**Installiere zuerst Rust:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
Dann starte dein Terminal neu, bevor du `npm run tauri dev` ausführst.

**Installation von .dmg?** Da die App nicht mit einem Apple-Entwicklerzertifikat signiert ist, siehst du eine Sicherheitswarnung. So umgehst du sie:

**Option 1: Rechtsklick öffnen**
1. Rechtsklicke (oder Steuerungsklick) auf die App
2. Wähle „Öffnen" → Klicke auf „Öffnen" im Dialog

**Option 2: Systemeinstellungen**
1. Gehe zu **Systemeinstellungen → Datenschutz & Sicherheit**
2. Klicke auf „Trotzdem öffnen" neben der Sicherheitswarnung

**Option 3: Terminal**
```bash
xattr -cr /Applications/YzPzCode.app
```

Die App ist sicher — sie wurde aus diesem Open-Source-Repository gebaut. Die Warnung ist nur macOS, das dich vor unsignierten Apps schützt.

> **Hinweis:** Wir arbeiten daran, die App ordnungsgemäß mit einem Apple-Entwicklerzertifikat zu signieren. Dieser Prozess dauert einige Wochen, aber sobald er abgeschlossen ist, wird die Sicherheitswarnung nicht mehr erscheinen.

<details>
<summary>Mehr Details benötigt?</summary>

### Voraussetzungen

- **Node.js** (v18+) — [Hier herunterladen](https://nodejs.org)
- **Rust** (neueste stabile Version) — [Hier erhalten](https://rust-lang.org)
- **pnpm** oder npm — whichever du bevorzugst

### Build für die Produktion

```bash
npm run tauri build
```

Das erzeugt einen nativen Installer für deine Plattform. Klein, schnell, kein Ballast.

</details>

## Wie es gebaut wurde

Wir haben Tools gewählt, die gut sind:

**Frontend**
- React 19 + TypeScript
- Vite (weil Warten auf Builds so 2020 ist)
- Tailwind CSS v4
- Zustand (State-Management, das Sinn ergibt)
- xterm.js (Terminal-Rendering)

**Backend**
- Tauri v2 (Rust-betrieben, leichtgewichtig)
- portable-pty (echte Pseudo-Terminals)
- Tokio (Async, das skaliert)

### Architektur

```mermaid
graph TB
    subgraph Frontend["Frontend (React + TypeScript)"]
        UI[Benutzeroberfläche]
        Grid[Terminal-Raster]
        Setup[Setup-Bildschirm]
        Store[Zustand Store]
    end

    subgraph Backend["Backend (Rust + Tauri v2)"]
        Commands[Tauri-Befehle]
        PTY[PTY-Manager]
        Detector[CLI-Detektor]
        Installer[CLI-Installer]
    end

    subgraph CLIs["KI-CLI-Tools"]
        Claude[Claude CLI]
        Gemini[Gemini CLI]
        Codex[Codex CLI]
        Opencode[Opencode CLI]
        Cursor[Cursor CLI]
    end

    UI --> Grid
    UI --> Setup
    Grid --> Store
    Setup --> Store
    
    Store <-->|Tauri IPC| Commands
    Commands --> PTY
    Commands --> Detector
    Commands --> Installer
    
    PTY -->|Startet| Claude
    PTY -->|Startet| Gemini
    PTY -->|Startet| Codex
    PTY -->|Startet| Opencode
    PTY -->|Startet| Cursor
    
    Detector -->|Prüft| Claude
    Detector -->|Prüft| Gemini
    Detector -->|Prüft| Codex
    Detector -->|Prüft| Opencode
    Detector -->|Prüft| Cursor
```

### Datenfluss

```mermaid
sequenceDiagram
    participant User as Benutzer
    participant UI as Frontend (React)
    participant Tauri as Tauri IPC
    participant PTY as PTY-Manager
    participant CLI as KI-CLI-Tool

    User->>UI: Workspace erstellen
    UI->>Tauri: detect_agent_cli()
    Tauri->>CLI: Prüfen ob installiert
    CLI-->>Tauri: Installationsstatus
    Tauri-->>UI: CLI-Status
    
    User->>UI: Workspace starten
    UI->>Tauri: create_terminal_sessions()
    Tauri->>PTY: PTY-Sessions erstellen
    PTY->>CLI: CLI-Prozess starten
    
    loop Echtzeit-Kommunikation
        CLI-->>PTY: Ausgabestrom
        PTY-->>Tauri: Terminal-Ereignisse
        Tauri-->>UI: Terminal aktualisieren
        UI-->>User: Ausgabe anzeigen
    end
```

## Für Neugierige

```
app/
├── src-tauri/          # Rust-Backend
│   └── src/
│       ├── agent/      # Agenten-Orchestrierung
│       ├── agent_cli/  # CLI-Erkennung & Installation
│       ├── commands/   # Tauri-IPC-Handler
│       └── terminal/   # PTY-Verwaltung
├── src/                # React-Frontend
│   ├── components/     # UI-Komponenten
│   ├── hooks/          # Eigene Hooks
│   ├── stores/         # Zustand-Stores
│   └── types/          # TypeScript-Definitionen
└── docs/               # Dokumentation
```

## Mitwirken

Wir freuen uns über deine Hilfe! So bleibst du bei der Entwicklung vernünftig:

```bash
# Typ-Prüfung
npx tsc --noEmit        # Frontend
cargo check             # Backend

# Linting & Formatierung
cargo clippy            # Rust-Probleme finden
cargo fmt               # Es hübsch machen

# Tests
cd src-tauri && cargo test
```

Einen Bug gefunden? Eine Idee? [Eröffne ein Issue](https://github.com/wolfenazz/YzPzCode/issues) oder [reiche einen PR ein](https://github.com/wolfenazz/YzPzCode/pulls).

Sieh dir die [vollständige Roadmap](docs/plane.md) an.

## Empfohlene Einrichtung

- [VS Code](https://code.visualstudio.com)
- [Tauri-Erweiterung](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

Oder verwende, was dich produktiv macht. Wir urteilen nicht.

## Lizenz

MIT. Fork es, baue darauf, mach es zu deinem. Denk nur daran, woher du es hast.

---

<div align="center">

### Gefällt dir, was du siehst?

Wenn YzPzCode dich vor dem Terminal-Chaos gerettet hat, gib ihm einen **Stern** — das hilft anderen, es zu finden!

[![Star this repo](https://img.shields.io/github/stars/wolfenazz/YzPzCode?style=social)](https://github.com/wolfenazz/YzPzCode/stargazers)

---

**Gebaut mit Koffein und späten Nächten von [Naseem](https://github.com/wolfenazz), Noor & Khalid**

*Für Entwickler, die lieber programmieren als Terminals verwalten.*

[Bug melden](https://github.com/wolfenazz/YzPzCode/issues) · [Feature anfragen](https://github.com/wolfenazz/YzPzCode/issues) · [Beitragen](https://github.com/wolfenazz/YzPzCode/pulls)

</div>
