# Paperclip — provozni dokumentace

Dokumentace infrastruktury, zalohovani, custom UI a update procesu pro Paperclip instanci.

## Architektura

Dva Macy propojene pres Tailscale mesh VPN:

| Role | Zarizeni | Tailscale IP | Pouziti |
|------|----------|-------------|---------|
| **Server** | Remote Mac (user `_maxxy`) | `100.81.141.101` | Paperclip instance, agenti, cron joby |
| **Klient** | Hlavni MacBook (user `lubee`) | `100.103.69.78` | Pristup pres browser, vyvoj, fork management |

### Pristup

- **Browser (remote):** `http://100.81.141.101:3100` (authenticated mode, Better Auth)
- **Browser (lokalne na remote Macu):** `http://localhost:3100`
- **SSH:** `ssh _maxxy@100.81.141.101`
- **Claude Code:** bezi na remote Macu pres SSH

### Paperclip konfigurace (remote Mac)

Config: `~/.paperclip/instances/default/config.json`

- `deploymentMode`: `"authenticated"` — vyzaduje prihlaseni
- `exposure`: `"private"` — hostname guard
- `host`: `"0.0.0.0"` — posloucha na vsech interfaces
- `allowedHostnames`: `["100.81.141.101", "localhost"]`

---

## Zalohovani

### Co se zalohuje denne (cron 2:00) → toto git repo

| Obsah | Slozka | Popis |
|-------|--------|-------|
| Agenti | `agents/` | Konfigurace, role, heartbeat, soul, tools |
| Projekty | `projects/` | Nazvy, popisy, repo URL |
| Skills | `skills/` | Skill definice a reference |
| Tasky / Issues | `tasks/` | Pracovni polozky |
| Firma | `COMPANY.md` | Nazev, mise, metadata |
| Org chart | `images/` | Vizualizace organizacni struktury |
| Paperclip manifest | `.paperclip.yaml` | Import/export metadata |
| Paperclip config | `config/remote-mac/config.json` | Server konfigurace |
| Backup skript | `config/remote-mac/paperclip-backup.sh` | Sam sebe zalohuje |

### Planovano (TODO)

| Obsah | Kam | Frekvence | Popis |
|-------|-----|-----------|-------|
| DB dump | Dropbox na remote Macu | Denne | Run historie, konverzace, costs, metriky |

### Jak backup funguje

1. Cron spusti `~/bin/paperclip-backup.sh` v 2:00
2. Smaze obsah repa (zachova `.git/`)
3. Pro kazdou firmu: `npx paperclipai company export` do tmpdir → kopie sem
4. Zkopiruje config a sam sebe do `config/remote-mac/`
5. `git pull --rebase && git add -A && git commit && git push`
6. Na konci spusti `~/bin/paperclip-update-check.sh` (kontrola upstream + fork updatu)

### Obnoveni na jiny stroj

```bash
git clone https://github.com/lubos-buracinsky/paperclip-company-backup.git
npx paperclipai company import ./paperclip-company-backup --yes
```

### Rucni backup

```bash
ssh _maxxy@100.81.141.101
~/bin/paperclip-backup.sh
```

### Logy

- Backup: `~/paperclip-backup.log` na remote Macu
- Update check: `~/paperclip-update-check.log` na remote Macu

---

## Custom UI (fork)

Paperclip bezi z vlastniho forku misto npm verze, s customizacemi.

### Repozitare

| Repo | Ucel |
|------|------|
| `lubos-buracinsky/paperclip` | Fork s customizacemi (branch `main`) |
| `paperclipai/paperclip` | Upstream (official) |
| `lubos-buracinsky/paperclip-company-backup` | Toto repo — zalohy firem |

### Kde co bezi

- **Remote Mac:** `~/paperclip` — klon forku, `pnpm paperclipai run`
- **Hlavni MacBook:** worktree v superset, vyvoj customizaci

### Customizace oproti upstreamu

| Feature | Soubory | Popis |
|---------|---------|-------|
| Update banner | `ui/src/components/UpdateBanner.tsx` | Modry banner pri upstream/fork update |
| Fork version badge | `ui/src/components/Layout.tsx` | Fialovy commit hash v sidebaru s tooltipem (datum, hash) |
| Token usage charts | `ui/src/components/Token*.tsx` | Per-agent token timeline a breakdown grafy |
| Fork version info | `server/src/fork-version.ts`, `scripts/generate-fork-version.sh` | Build-time generovani verze forku |
| Update status | `server/src/routes/health.ts` | Cteni update-status.json, fork-version.json v health endpointu |

### Rebase na upstream

Kdyz update-check hlasi nove commity (nebo banner v UI):

```bash
# Na hlavnim MacBooku:
git fetch paperclip
git rebase paperclip/master
bash scripts/generate-fork-version.sh
git push fork <branch>:main --force-with-lease

# Na remote Macu (SSH nebo Claude Code):
cd ~/paperclip
git pull --rebase
bash scripts/generate-fork-version.sh
pnpm install && pnpm build
pnpm paperclipai run
```

---

## Update notifikace

Automaticky system pro detekci novych verzi — upstream i fork.

### Jak to funguje

1. `~/bin/paperclip-update-check.sh` (volany z backup cronu) kontroluje `upstream/master` a `origin/main`
2. Zapisuje JSON do `~/.paperclip/instances/default/update-status.json`
3. Server cte tento soubor a pridava do `/api/health` response
4. UI zobrazuje modry `UpdateBanner` s poctem novych commitu a moznosti schovat
5. Fialovy badge v sidebaru ukazuje aktualni commit hash forku s datem

### Format update-status.json

```json
{
  "available": true,
  "currentSha": "abc123...",
  "upstreamSha": "def456...",
  "behind": 15,
  "ahead": 1,
  "checkedAt": "2026-04-09T02:00:00Z",
  "forkBehind": 2,
  "forkSha": "789abc..."
}
```

### Spoustece notifikace

- **Upstream update:** nova verze v `paperclipai/paperclip` → banner "X commits behind upstream"
- **Fork update:** novy push na `lubos-buracinsky/paperclip` z hlavniho MacBooku → banner "X commits behind origin"

---

## Infrastruktura — souhrn

| Komponenta | Umisteni |
|------------|----------|
| Paperclip instance | Remote Mac, `~/paperclip` (fork) |
| Paperclip data | `~/.paperclip/instances/default/` na remote Macu |
| Backup skript | `~/bin/paperclip-backup.sh` na remote Macu |
| Update-check skript | `~/bin/paperclip-update-check.sh` na remote Macu |
| Cron | `0 2 * * *` na remote Macu |
| SSH klic (GitHub push) | `~/.ssh/ssh-paperclip-backup` na remote Macu (bez passphrase) |
| Fork version generator | `scripts/generate-fork-version.sh` ve forku |
| Tailscale | Oba stroje, persistentni IP |
