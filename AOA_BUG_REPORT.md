# aOa Bug Report

**Date:** 2026-01-15
**aOa Version:** Current (installed at `/home/corey/production/aOa`)
**Project:** voice-ai (`/home/corey/projects/voice-ai`)
**Reporter:** Claude Code session

---

## Bug 1: `aoa hot` returns count but no file list

**Severity:** Medium
**Command:** `aoa hot 10`

**Expected:** List of 10 most frequently accessed files
**Actual:** Only shows header with count, no file list

```
$ aoa hot 10
🔥 10 hot files
```

**Notes:** The count suggests files are tracked, but the list isn't displayed.

---

## Bug 2: `aoa head` / `aoa lines` - "File not found" for existing files

**Severity:** High
**Commands:**
- `aoa head OpenSourceVoice/src/voice-app.js 30`
- `aoa lines jambonz-source/jambonz-feature-server/lib/tasks/tts-task.js 68-145`

**Expected:** Display file contents
**Actual:** `[0;31mFile not found[0m`

**Verification:** Files confirmed to exist:
```
$ ls -la OpenSourceVoice/src/voice-app.js
-rw-rw-r-- 1 corey corey 63107 Jan 14 01:02 OpenSourceVoice/src/voice-app.js

$ ls -la jambonz-source/jambonz-feature-server/lib/tasks/tts-task.js
-rw-rw-r-- 1 corey corey 14454 Oct 23 04:59 jambonz-source/jambonz-feature-server/lib/tasks/tts-task.js
```

**Possible cause:** Path resolution issue - may need absolute paths or paths relative to project root aren't being resolved correctly within Docker container mounts.

---

## Bug 3: `aoa history` returns empty output

**Severity:** Low
**Command:** `aoa history 10`

**Expected:** List of recent events/actions
**Actual:** No output (blank)

---

## Bug 4: `aoa changes` - jq parse error

**Severity:** Medium
**Command:** `aoa changes 30m`

**Expected:** List of recently changed files
**Actual:**
```
jq: parse error: Invalid numeric literal at line 1, column 10
jq: parse error: Invalid numeric literal at line 1, column 10

📝  changed files (last 30ms)
```

**Notes:**
- The "30ms" suggests the time argument "30m" was misinterpreted
- jq errors indicate malformed JSON being passed to the parser

---

## Working Features (for reference)

These commands worked correctly during testing:

| Command | Status | Notes |
|---------|--------|-------|
| `aoa grep <term>` | ✅ Working | Fast, accurate results |
| `aoa grep -a t1,t2` | ✅ Working | AND search works |
| `aoa egrep <regex>` | ✅ Working | Regex search works |
| `aoa find "*.js"` | ✅ Working | File discovery works |
| `aoa locate <name>` | ✅ Working | Filename search works |
| `aoa tree <dir>` | ✅ Working | Directory tree works |
| `aoa outline <file>` | ✅ Working | Code structure with ranges |
| `aoa health` | ✅ Working | Full status displayed |
| `aoa services` | ✅ Working | Architecture diagram |
| `aoa info` | ✅ Working | Config info displayed |
| `aoa projects` | ✅ Working | Project list works |
| `aoa intent tags` | ✅ Working | Activity log works |
| `aoa metrics` | ✅ Working | Savings displayed |
| `aoa baseline` | ✅ Working | Cost analysis works |
| `aoa outline --pending` | ✅ Working | Tag status works |

---

## Environment

```
Docker: ✓ Container running
Index: ✓ Running (2 projects)
Redis: ✓ Connected
Search latency: ~1.5ms
Files indexed: 62 files, 7313 targets
```

---

## Reproduction Steps

1. Initialize aOa in a project: `aoa init`
2. Run the failing commands listed above
3. Observe the described behavior

---

## Suggested Investigation Areas

1. **File path resolution** - The `head`/`lines` commands may not be resolving relative paths through the Docker volume mounts correctly
2. **Time argument parsing** - The `changes` command appears to misparse "30m" as milliseconds
3. **Output rendering** - `hot` and `history` may have issues with result serialization/display
