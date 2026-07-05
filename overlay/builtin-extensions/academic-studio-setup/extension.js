// Academic Studio Setup — first-run audience picker, extension enablement,
// installation of supporting programs (Python, Quarto, R, TinyTeX, decktape,
// GitHub CLI), and catalog-driven "Additional packages".
//
// - Audience radio seeds an editable extension checklist; "Apply" enables the
//   chosen extensions + disables the rest (academicStudio.setExtensionsEnablement,
//   patch 52) and reloads.
// - "Supporting programs" lists external tools with detected status; "Install
//   selected programs & packages" runs each tool's official installer in a
//   visible terminal (continue-on-error) and reports what succeeded / failed
//   with manual links.
// - "Additional packages" come from an ONLINE CATALOG (packages.json on
//   academic-studio.com, with a bundled snapshot as offline fallback), so new
//   packages ship without an app release. A package is declarative data —
//   pip libraries, an optional Claude skill tarball (sha256-verified), an
//   optional MCP server config — never remote shell commands. On startup the
//   catalog is checked and new/updated packages are offered once.
//
// Re-openable any time via the "Academic Studio Setup…" command.
const vscode = require('vscode');
const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SETUP_DONE_KEY = 'academicStudio.setupCompleted';
const SELECTION_KEY = 'academicStudio.selection';
// Package offers the user has already seen (array of "id@version"). A catalog
// version bump makes a new key, so updated packages are offered again.
const SEEN_PACKAGES_KEY = 'academicStudio.seenPackages';

// Live package catalog. Served by GitHub Pages (site/packages.json in the repo);
// NOT api.github.com, whose unauthenticated limit (60/hr/IP) breaks classrooms.
const CATALOG_URL = 'https://academic-studio.com/packages.json';
// A payload (skill tarball) may only come from hosts we publish to.
const PAYLOAD_URL_ALLOW = [
	'https://academic-studio.com/',
	'https://www.academic-studio.com/',
	'https://github.com/kerryback/',
	'https://raw.githubusercontent.com/kerryback/',
];

// ---- bundled extensions catalog (enable/disable) ---------------------------
//   group: common -> everyone, faculty -> Faculty, student -> Students & Pros.
//   excludes: id that cannot be active at the same time.
const CATALOG = [
	{ id: 'quarto.quarto', label: 'Quarto', group: 'common' },
	{ id: 'cweijan.vscode-office', label: 'Office document viewer', group: 'common' },
	{ id: 'ms-python.python', label: 'Python', group: 'common' },
	{ id: 'detachhead.basedpyright', label: 'Python type checking (basedpyright)', group: 'common' },
	{ id: 'mechatroner.rainbow-csv', label: 'Rainbow CSV', group: 'common' },
	{ id: 'ms-toolsai.jupyter', label: 'Jupyter', group: 'common' },
	{ id: 'streetsidesoftware.code-spell-checker', label: 'Spell Checker', group: 'common' },
	{ id: 'anthropic.claude-code', label: 'Claude Code', group: 'common' },
	{ id: 'james-yu.latex-workshop', label: 'LaTeX Workshop (PDF via LaTeX)', group: 'faculty', excludes: 'tomoki1207.pdf' },
	{ id: 'tomoki1207.pdf', label: 'PDF viewer', group: 'student', excludes: 'james-yu.latex-workshop' },
	{ id: 'reditorsupport.r', label: 'R language support', group: 'faculty' },
	{ id: 'reditorsupport.r-syntax', label: 'R syntax', group: 'faculty' },
	{ id: 'jeanp413.open-remote-ssh', label: 'Open Remote - SSH', group: 'faculty' },
];

function presetFor(audience) {
	return CATALOG.filter(c =>
		c.group === 'common' ||
		(audience === 'faculty' ? c.group === 'faculty' : c.group === 'student')
	).map(c => c.id);
}

// ---- supporting programs catalog (detect + install) ------------------------
// System programs stay baked in (they run official installers, often with
// sudo). Only "Additional packages" come from the online catalog.
//   detect: shell command; exit 0 => present (stdout/stderr => version)
//   installMac: array of bash lines run inside a `( set -e … )` subshell
//   group: common -> everyone, faculty -> Faculty, optin -> off by default
//   prereq: another program id that must be present-or-selected first
const PROGRAMS = [
	{
		id: 'python', label: 'Python + scientific libraries + Office-related libraries', group: 'common',
		detect: process.platform === 'win32' ? 'python --version' : 'python3 --version',
		manualUrl: 'https://www.python.org/downloads/macos/',
		manualSteps: 'Download the macOS 64-bit universal2 installer and run it, then reopen the app.',
		installMac: [
			'V=$(for v in $(curl -fsSL https://www.python.org/ftp/python/ | grep -oE "3\\.[0-9]+\\.[0-9]+/" | tr -d / | sort -V -r | head -10); do curl -fsS -o /dev/null -I "https://www.python.org/ftp/python/$v/python-$v-macos11.pkg" 2>/dev/null && { echo "$v"; break; }; done)',
			'[ -n "$V" ] || { echo "Could not find a Python installer URL."; exit 1; }',
			'TMP=$(mktemp -d); curl -fsSL "https://www.python.org/ftp/python/$V/python-$V-macos11.pkg" -o "$TMP/python.pkg"',
			'sudo installer -pkg "$TMP/python.pkg" -target /',
			'PIP_BREAK_SYSTEM_PACKAGES=1 python3 -m pip install --upgrade pip',
			'PIP_BREAK_SYSTEM_PACKAGES=1 python3 -m pip install numpy pandas matplotlib scipy jupyter scikit-learn seaborn statsmodels sympy openpyxl python-pptx python-docx plotly',
		],
	},
	{
		id: 'node', label: 'Node.js (used by Claude for Word & PowerPoint creation)', group: 'common',
		detect: 'node --version',
		manualUrl: 'https://nodejs.org/',
		manualSteps: 'Download the macOS Installer (.pkg) from nodejs.org and run it.',
		installMac: [
			'VER=$(curl -fsSL https://nodejs.org/dist/index.json | tr \'}\' \'\\n\' | grep \'"lts":"\' | head -1 | grep -oE \'v[0-9][0-9.]+\' | head -1)',
			'[ -n "$VER" ] || { echo "Could not find the latest Node LTS version."; exit 1; }',
			'TMP=$(mktemp -d); curl -fsSL "https://nodejs.org/dist/$VER/node-$VER.pkg" -o "$TMP/node.pkg"',
			'sudo installer -pkg "$TMP/node.pkg" -target /',
		],
	},
	{
		id: 'quarto', label: 'Quarto', group: 'common',
		detect: 'quarto --version',
		manualUrl: 'https://quarto.org/docs/get-started/',
		manualSteps: 'Download the macOS .pkg from quarto.org and run it.',
		installMac: [
			'URL=$(curl -fsSL https://api.github.com/repos/quarto-dev/quarto-cli/releases/latest | grep -oE "https://[^\\"]+macos\\.pkg" | head -1)',
			'[ -n "$URL" ] || { echo "Could not find the latest Quarto installer URL."; exit 1; }',
			'TMP=$(mktemp -d); curl -fsSL "$URL" -o "$TMP/quarto.pkg"',
			'sudo installer -pkg "$TMP/quarto.pkg" -target /',
		],
	},
	{
		id: 'git', label: 'Git (version control)', group: 'faculty',
		detect: 'git --version',
		manualUrl: process.platform === 'win32' ? 'https://git-scm.com/download/win' : 'https://git-scm.com/download/mac',
		manualSteps: process.platform === 'win32' ? 'Download Git for Windows from git-scm.com and run the installer.' : 'Run "xcode-select --install" in Terminal and complete the macOS dialog.',
		installMac: [
			'xcode-select --install 2>/dev/null || true',
			'echo "If a macOS dialog appeared, click Install and wait for it to finish (this can take several minutes)…"',
			'for i in $(seq 1 180); do xcode-select -p >/dev/null 2>&1 && break; sleep 10; done',
			'xcode-select -p >/dev/null 2>&1 || { echo "Command Line Tools not detected — finish the install, then re-run."; exit 1; }',
		],
	},
	{
		id: 'gh', label: 'GitHub CLI (gh)', group: 'faculty',
		detect: 'gh --version',
		manualUrl: 'https://cli.github.com/',
		manualSteps: 'Download the macOS .pkg from cli.github.com and run it.',
		installMac: [
			'URL=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep -oE "https://[^\\"]+_macOS_universal\\.pkg" | head -1)',
			'[ -n "$URL" ] || { echo "Could not find the latest gh installer URL."; exit 1; }',
			'TMP=$(mktemp -d); curl -fsSL "$URL" -o "$TMP/gh.pkg"',
			'sudo installer -pkg "$TMP/gh.pkg" -target /',
		],
	},
	{
		id: 'r', label: 'R', group: 'faculty',
		detect: process.platform === 'win32' ? 'Rscript --version' : 'R --version',
		manualUrl: 'https://cran.r-project.org/',
		manualSteps: process.platform === 'win32' ? 'Download R for Windows from CRAN and run the installer.' : 'Download the macOS .pkg from CRAN and run it.',
		installMac: [
			'REL=$(curl -fsSL https://cran.r-project.org/bin/macosx/big-sur-arm64/base/ | grep -oE "R-[0-9.]+-arm64\\.pkg" | sort -V | tail -1)',
			'[ -n "$REL" ] || { echo "Could not find the latest R installer URL."; exit 1; }',
			'TMP=$(mktemp -d); curl -fsSL "https://cran.r-project.org/bin/macosx/big-sur-arm64/base/$REL" -o "$TMP/R.pkg"',
			'sudo installer -pkg "$TMP/R.pkg" -target /',
			'Rscript -e \'install.packages("languageserver", repos="https://cloud.r-project.org")\' || true',
		],
	},
	{
		id: 'tinytex', label: 'TinyTeX (LaTeX)', group: 'faculty',
		detect: 'tlmgr --version',
		manualUrl: 'https://yihui.org/tinytex/',
		manualSteps: 'Run: curl -fsSL https://yihui.org/tinytex/install-bin-unix.sh | sh',
		installMac: [
			'curl -fsSL https://yihui.org/tinytex/install-bin-unix.sh | sh',
		],
	},
	{
		id: 'decktape', label: 'decktape (HTML slides → PDF/PPTX)', group: 'optin', prereq: 'node',
		// NOT `npx decktape version`: when decktape is missing, npx tries to
		// download and run it — slow, networked, and wrong exit semantics.
		detect: process.platform === 'win32' ? 'where decktape' : 'command -v decktape',
		manualUrl: 'https://github.com/astefanutti/decktape',
		manualSteps: 'With Node.js installed, run: npm install -g decktape',
		installMac: [
			'npm install -g decktape || sudo npm install -g decktape',
		],
	},
	{
		id: 'libreoffice', label: 'LibreOffice (PDF export & thumbnails for the Word/PowerPoint skills)', group: 'optin',
		detect: process.platform === 'win32' ? 'where soffice' : '[ -d /Applications/LibreOffice.app ] && echo installed',
		manualUrl: 'https://www.libreoffice.org/download/download/',
		manualSteps: process.platform === 'win32' ? 'Download LibreOffice for Windows from libreoffice.org and run the installer.' : 'Download LibreOffice for macOS from libreoffice.org and drag it to Applications.',
		installMac: [
			'VER=$(curl -fsSL https://download.documentfoundation.org/libreoffice/stable/ | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+/" | tr -d / | sort -V | tail -1)',
			'[ -n "$VER" ] || { echo "Could not find the latest LibreOffice version."; exit 1; }',
			'case "$(uname -m)" in arm64) A=aarch64;; *) A=x86-64;; esac',
			'TMP=$(mktemp -d); curl -fsSL "https://download.documentfoundation.org/libreoffice/stable/$VER/mac/$A/LibreOffice_${VER}_MacOS_$A.dmg" -o "$TMP/lo.dmg"',
			'MNT=$(hdiutil attach "$TMP/lo.dmg" -nobrowse | grep -oE "/Volumes/.*" | tail -1)',
			'[ -d "$MNT/LibreOffice.app" ] || { echo "LibreOffice.app not found in image"; hdiutil detach "$MNT" 2>/dev/null; exit 1; }',
			'sudo cp -R "$MNT/LibreOffice.app" /Applications/',
			'hdiutil detach "$MNT"',
			'rm -rf "$TMP"',
		],
	},
];

// ---- small helpers ----------------------------------------------------------
function firstLine(s) { return (s || '').split('\n')[0].trim(); }
function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }   // bash single-quote
function psq(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }      // PowerShell single-quote
function escHtml(s) {
	return String(s).replace(/[&<>"']/g, ch => (
		{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
	));
}
function safeHttpsUrl(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u : ''; }

// Installed product version, read from the app's product.json (two levels up
// from this built-in extension, i.e. vscode/product.json).
// NOTE: deliberately duplicated in academic-studio-defaults/extension.js —
// built-in extensions are packaged as separate folders and cannot share a
// module. Keep the two copies identical.
function currentVersion(context) {
	try {
		const pj = JSON.parse(fs.readFileSync(
			path.join(context.extensionPath, '..', '..', 'product.json'), 'utf8'));
		return pj.academicStudioVersion || null;
	} catch (_) { return null; }
}

// Numeric dotted-version compare: >0 if a is newer than b. (Duplicated in
// academic-studio-defaults — see note on currentVersion.)
function cmpVersions(a, b) {
	const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
	const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] || 0) - (pb[i] || 0);
		if (d) return d;
	}
	return 0;
}

// Short display name for a program/package (the part before the em dash).
function shortName(p) { return String(p.label || p.id).split('—')[0].trim(); }

function httpGet(url, timeoutMs) {
	const ctl = new AbortController();
	const t = setTimeout(() => ctl.abort(), timeoutMs || 15000);
	return fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Academic-Studio' } })
		.finally(() => clearTimeout(t));
}

// ---- package catalog ---------------------------------------------------------
// A package is DATA the app acts on — never remote shell. Schema per entry:
//   id            kebab-case identifier (required)
//   label         display label (required)
//   version       positive integer; bump to re-offer updates (required)
//   minAppVersion oldest app that understands the entry (optional)
//   prereq        a PROGRAMS id that must be present/selected first (optional)
//   pip           pip package names to install (optional)
//   pipImports    module names for the import detection check (optional)
//   skill         { name, url, sha256 } Claude skill tarball (optional)
//   mcp           { name, config } MCP server for ~/.claude.json (optional)
//   manualUrl / manualSteps   fallback instructions (optional)
const RE_PKG_ID = /^[a-z0-9][a-z0-9-]*$/;
const RE_PIP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RE_PY_MODULE = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const RE_SHA256 = /^[0-9a-f]{64}$/;
const RE_MCP_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function payloadUrlAllowed(u) {
	return typeof u === 'string' && PAYLOAD_URL_ALLOW.some(p => u.startsWith(p));
}

// Strict validation: a malformed or tampered catalog entry is dropped, never
// "best-effort" installed. Every string that reaches a shell or the filesystem
// is pattern-checked here.
function validPackage(p) {
	if (!p || typeof p !== 'object') { return false; }
	if (typeof p.id !== 'string' || !RE_PKG_ID.test(p.id)) { return false; }
	if (typeof p.label !== 'string' || !p.label.trim()) { return false; }
	if (!Number.isInteger(p.version) || p.version < 1) { return false; }
	if (p.prereq !== undefined && !PROGRAMS.some(x => x.id === p.prereq)) { return false; }
	if (p.pip !== undefined && !(Array.isArray(p.pip) && p.pip.every(n => typeof n === 'string' && RE_PIP_NAME.test(n)))) { return false; }
	if (p.pipImports !== undefined && !(Array.isArray(p.pipImports) && p.pipImports.every(n => typeof n === 'string' && RE_PY_MODULE.test(n)))) { return false; }
	if (p.skill !== undefined) {
		const s = p.skill;
		if (!s || typeof s !== 'object') { return false; }
		if (typeof s.name !== 'string' || !RE_PKG_ID.test(s.name)) { return false; }
		if (!payloadUrlAllowed(s.url)) { return false; }
		if (typeof s.sha256 !== 'string' || !RE_SHA256.test(s.sha256)) { return false; }
	}
	if (p.mcp !== undefined) {
		const m = p.mcp;
		if (!m || typeof m !== 'object') { return false; }
		if (typeof m.name !== 'string' || !RE_MCP_NAME.test(m.name)) { return false; }
		if (!m.config || typeof m.config !== 'object') { return false; }
	}
	return true;
}

function parseCatalog(raw, appVersion) {
	let data;
	try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return null; }
	if (!data || !Array.isArray(data.packages)) { return null; }
	return data.packages
		.filter(validPackage)
		.filter(p => !p.minAppVersion || !appVersion || cmpVersions(p.minAppVersion, appVersion) <= 0);
}

// Fetch the live catalog; fall back to the snapshot bundled with the app so the
// panel still lists known packages offline. Result: { packages, live }.
async function loadPackageCatalog(context) {
	const appVersion = currentVersion(context);
	try {
		const res = await httpGet(CATALOG_URL, 8000);
		if (res && res.ok) {
			const pkgs = parseCatalog(await res.text(), appVersion);
			if (pkgs) { return { packages: pkgs, live: true }; }
		}
	} catch (_) { /* offline or blocked — fall through to snapshot */ }
	try {
		const snap = fs.readFileSync(path.join(context.extensionPath, 'packages.snapshot.json'), 'utf8');
		const pkgs = parseCatalog(snap, appVersion);
		if (pkgs) { return { packages: pkgs, live: false }; }
	} catch (_) { /* no snapshot */ }
	return { packages: [], live: false };
}

// ---- skill payloads ----------------------------------------------------------
function claudeSkillsDir() { return path.join(os.homedir(), '.claude', 'skills'); }
const SKILL_MARKER = '.academic-studio-package.json';

// The catalog version of an installed skill. A skill installed by an old app
// build (no marker) reads as 0, so the first catalog version re-offers it —
// which delivers the newest files, exactly what we want.
function installedSkillVersion(skillName) {
	const dir = path.join(claudeSkillsDir(), skillName);
	try {
		if (!fs.existsSync(path.join(dir, 'SKILL.md'))) { return -1; }   // not installed
		const m = JSON.parse(fs.readFileSync(path.join(dir, SKILL_MARKER), 'utf8'));
		return Number.isInteger(m.version) ? m.version : 0;
	} catch (_) { return 0; }   // installed, version unknown (legacy)
}

// Download → sha256-verify → untar → copy into ~/.claude/skills/<name>.
// tar ships with macOS and with Windows 10 1803+ (bsdtar in System32).
async function installPackageSkill(pkg) {
	const skill = pkg.skill;
	if (!skill) { return { ok: true }; }
	let buf;
	try {
		const res = await httpGet(skill.url, 60000);
		if (!res || !res.ok) { return { ok: false, error: 'download failed (' + (res ? res.status : 'no response') + ')' }; }
		buf = Buffer.from(await res.arrayBuffer());
	} catch (_) { return { ok: false, error: 'download failed (offline?)' }; }
	const sha = crypto.createHash('sha256').update(buf).digest('hex');
	if (sha !== skill.sha256) { return { ok: false, error: 'checksum mismatch — refusing to install' }; }

	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-skill-'));
	try {
		const tarball = path.join(tmp, 'skill.tar.gz');
		fs.writeFileSync(tarball, buf);
		const extractDir = path.join(tmp, 'x');
		fs.mkdirSync(extractDir);
		await new Promise((resolve, reject) => {
			cp.execFile('tar', ['-xzf', tarball, '-C', extractDir], { timeout: 60000 },
				(err) => err ? reject(err) : resolve());
		});
		// Accept both layouts: files at the archive root, or one top-level folder.
		let src = extractDir;
		if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
			const sub = fs.readdirSync(src).map(n => path.join(src, n))
				.find(d => { try { return fs.existsSync(path.join(d, 'SKILL.md')); } catch (_) { return false; } });
			if (!sub) { return { ok: false, error: 'archive has no SKILL.md' }; }
			src = sub;
		}
		const to = path.join(claudeSkillsDir(), skill.name);
		fs.mkdirSync(claudeSkillsDir(), { recursive: true });
		fs.rmSync(to, { recursive: true, force: true });
		fs.cpSync(src, to, { recursive: true });
		fs.writeFileSync(path.join(to, SKILL_MARKER),
			JSON.stringify({ id: pkg.id, version: pkg.version }, null, 2));
		return { ok: true };
	} catch (e) {
		return { ok: false, error: 'could not unpack skill (' + (e && e.message ? e.message : e) + ')' };
	} finally {
		try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* best effort */ }
	}
}

// ---- MCP connectors ----------------------------------------------------------
// Claude Code's user-scope MCP servers live in ~/.claude.json under mcpServers.
function mcpConfigPath() { return path.join(os.homedir(), '.claude.json'); }

function mcpInstalled(pkg) {
	if (!pkg.mcp) { return true; }
	try {
		const cfg = JSON.parse(fs.readFileSync(mcpConfigPath(), 'utf8'));
		return !!(cfg.mcpServers && cfg.mcpServers[pkg.mcp.name]);
	} catch (_) { return false; }
}

function installMcpServer(pkg) {
	if (!pkg.mcp) { return { ok: true }; }
	try {
		const file = mcpConfigPath();
		let cfg = {};
		if (fs.existsSync(file)) {
			cfg = JSON.parse(fs.readFileSync(file, 'utf8'));   // parse failure -> catch: never clobber
			fs.copyFileSync(file, file + '.academic-studio-backup');
		}
		if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') { cfg.mcpServers = {}; }
		cfg.mcpServers[pkg.mcp.name] = pkg.mcp.config;
		fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
		return { ok: true };
	} catch (e) {
		return { ok: false, error: 'could not update ~/.claude.json (' + (e && e.message ? e.message : e) + ')' };
	}
}

// ---- Claude Code document skills (startup, silent) ---------------------------
// Installed into the shared ~/.claude/skills/ on first run. Cross-platform now:
// plain HTTPS download + tar (present on macOS and Windows 10 1803+).
const CLAUDE_SKILLS = ['xlsx', 'docx', 'pptx', 'pdf', 'skill-creator'];
const CLAUDE_SKILLS_TARBALL = 'https://github.com/anthropics/skills/archive/refs/heads/main.tar.gz';

function allClaudeSkillsPresent() {
	return CLAUDE_SKILLS.every(s => {
		try { return fs.existsSync(path.join(claudeSkillsDir(), s, 'SKILL.md')); } catch (_) { return false; }
	});
}

async function autoInstallClaudeSkills() {
	if (allClaudeSkillsPresent()) { return; }
	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Academic Studio: installing Claude Code document skills…' },
		async () => {
			try {
				const res = await httpGet(CLAUDE_SKILLS_TARBALL, 120000);
				if (!res || !res.ok) { throw new Error('download failed'); }
				const buf = Buffer.from(await res.arrayBuffer());
				const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-claude-skills-'));
				try {
					const tarball = path.join(tmp, 'skills.tar.gz');
					fs.writeFileSync(tarball, buf);
					await new Promise((resolve, reject) => {
						cp.execFile('tar', ['-xzf', tarball, '-C', tmp], { timeout: 120000 },
							(err) => err ? reject(err) : resolve());
					});
					fs.mkdirSync(claudeSkillsDir(), { recursive: true });
					for (const s of CLAUDE_SKILLS) {
						const from = path.join(tmp, 'skills-main', 'skills', s);
						if (!fs.existsSync(path.join(from, 'SKILL.md'))) { continue; }
						const to = path.join(claudeSkillsDir(), s);
						fs.rmSync(to, { recursive: true, force: true });
						fs.cpSync(from, to, { recursive: true });
					}
				} finally {
					try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* best effort */ }
				}
			} catch (_) { /* fall through to the presence check */ }
			if (!allClaudeSkillsPresent()) {
				vscode.window.showWarningMessage('Could not install Claude Code document skills automatically; reload the window to retry.');
			}
		});
}

// ---- detection ---------------------------------------------------------------
function shellExec(command) {
	// On macOS, run through a login shell so the user's full PATH (Homebrew,
	// /usr/local, pyenv, etc.) is visible — GUI apps otherwise get a minimal PATH.
	// On Windows, use cmd.exe /c which inherits the system PATH.
	const isWin = process.platform === 'win32';
	const shell = isWin ? process.env.COMSPEC || 'cmd.exe' : (process.env.SHELL || '/bin/zsh');
	const args = isWin ? ['/c', command] : ['-lc', command];
	return new Promise((resolve) => {
		cp.execFile(shell, args, { timeout: 8000 }, (err, stdout, stderr) => {
			const out = ((stdout || '') + (stderr || '')).trim();
			resolve({ ok: !err, out });
		});
	});
}

// Import-check command for a package's Python libraries.
function pipImportsDetect(pkg) {
	const py = process.platform === 'win32' ? 'python' : 'python3';
	const mods = pkg.pipImports || [];
	if (!mods.length) { return null; }
	return py + ' -c "import ' + mods.join(', ') + '"';
}

async function detectPackage(pkg) {
	let libsOk = true;
	const cmd = pipImportsDetect(pkg);
	if (cmd) { libsOk = (await shellExec(cmd)).ok; }
	const skillOk = !pkg.skill || installedSkillVersion(pkg.skill.name) >= pkg.version;
	const mcpOk = mcpInstalled(pkg);
	const found = libsOk && skillOk && mcpOk;
	return { found, version: found ? 'v' + pkg.version : '' };
}

// Detect all programs and packages IN PARALLEL — serially this took up to
// 8 s × items with the panel stuck on "checking…".
async function detectAll(packages) {
	const progEntries = PROGRAMS.map(async p => {
		const r = await shellExec(p.detect);
		return [p.id, { found: r.ok, version: r.ok ? firstLine(r.out) : '' }];
	});
	const pkgEntries = (packages || []).map(async p => [p.id, await detectPackage(p)]);
	const entries = await Promise.all(progEntries.concat(pkgEntries));
	const result = {};
	for (const [id, st] of entries) { result[id] = st; }
	return result;
}

// ---- install planning ----------------------------------------------------------
// Items = baked-in programs + catalog packages, unified for ordering/report.
function allItems(packages) {
	return PROGRAMS.map(p => ({ kind: 'program', ...p }))
		.concat((packages || []).map(p => ({ kind: 'package', ...p })));
}

// Dependency-ordered plan. Every selected id is accounted for: it lands in
// `ordered` or in `skipped` with a reason — nothing is silently dropped.
function planInstall(selectedIds, detected, packages) {
	const items = allItems(packages);
	const byId = new Map(items.map(i => [i.id, i]));
	const selected = new Set(selectedIds);
	const skipped = [];
	const ordered = [];
	const placed = new Set();

	for (const id of selected) {
		if (!byId.has(id)) { skipped.push({ id, reason: 'unknown item' }); }
	}
	// Topological placement over the prereq edges; declared order is the tiebreak.
	let progress = true;
	while (progress) {
		progress = false;
		for (const item of items) {
			if (!selected.has(item.id) || placed.has(item.id)) { continue; }
			if (item.prereq) {
				const haveAlready = detected[item.prereq] && detected[item.prereq].found;
				const selectedToo = selected.has(item.prereq) && byId.has(item.prereq);
				if (!haveAlready && !selectedToo) {
					placed.add(item.id);
					skipped.push({ id: item.id, reason: 'needs ' + item.prereq + ' first' });
					progress = true;
					continue;
				}
				if (selectedToo && !haveAlready && !ordered.includes(item.prereq)) { continue; } // wait for prereq placement
			}
			placed.add(item.id);
			ordered.push(item.id);
			progress = true;
		}
	}
	for (const item of items) {   // anything left = unplaceable dependency chain
		if (selected.has(item.id) && !placed.has(item.id)) {
			skipped.push({ id: item.id, reason: 'dependency could not be resolved' });
		}
	}
	return { ordered, skipped };
}

// Terminal-run install commands for one item on this platform, or null if the
// platform has no automatic installer (→ manual link).
function commandsFor(item) {
	const isWin = process.platform === 'win32';
	if (item.kind === 'package') {
		const cmds = [];
		if (item.pip && item.pip.length) {
			// PEP 668: Homebrew/Debian Pythons are "externally managed" and refuse
			// system pip installs. The PIP_BREAK_SYSTEM_PACKAGES=1 env var lifts
			// that on pip >= 23 and is silently ignored by older pips — unlike the
			// --break-system-packages flag, which errors on pips that predate it.
			cmds.push(isWin
				? "$env:PIP_BREAK_SYSTEM_PACKAGES = '1'; python -m pip install " + item.pip.join(' ')
				: 'PIP_BREAK_SYSTEM_PACKAGES=1 python3 -m pip install ' + item.pip.join(' '));
		}
		return cmds.length ? cmds : [];   // skill/mcp are handled in-process
	}
	const cmds = isWin ? item.installWin : item.installMac;
	return (cmds && cmds.length) ? cmds : null;
}

// ---- install scripts (generated from the plan) --------------------------------
function buildInstallScriptBash(items, resultsPath) {
	const lines = [
		'#!/bin/bash',
		'set +e',
		'export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"',
		'R=' + shq(resultsPath),
		': > "$R"',
		'echo "Academic Studio — installing selected programs and packages."',
	];
	if (items.some(i => i.kind === 'program')) {
		lines.push('echo "You may be prompted for your Mac password (needed by system installers)."');
		lines.push('echo');
		lines.push('sudo -v');
	}
	lines.push('');
	for (const item of items) {
		lines.push('printf \'=== Installing %s ===\\n\' ' + shq(item.label));
		lines.push('( set -e');
		for (const l of item.cmds) { lines.push('  ' + l); }
		lines.push(')');
		lines.push('if [ $? -eq 0 ]; then echo "RESULT ' + item.id + ' ok" >> "$R"; else echo "RESULT ' + item.id + ' fail" >> "$R"; fi');
		lines.push('echo');
	}
	lines.push('echo "DONE" >> "$R"');
	lines.push('echo "All done — you can close this terminal."');
	return lines.join('\n') + '\n';
}

function buildInstallScriptPS(items, resultsPath) {
	const lines = [
		"$ErrorActionPreference = 'Continue'",
		'$R = ' + psq(resultsPath),
		'Set-Content -Path $R -Value $null',
		"Write-Host 'Academic Studio - installing selected programs and packages.'",
		"Write-Host ''",
	];
	for (const item of items) {
		lines.push('Write-Host (' + psq('=== Installing ' + item.label + ' ===') + ')');
		lines.push('$ok = $true');
		for (const l of item.cmds) {
			lines.push(l);
			lines.push('if ($LASTEXITCODE -ne 0) { $ok = $false }');
		}
		lines.push('if ($ok) { Add-Content -Path $R -Value ' + psq('RESULT ' + item.id + ' ok')
			+ ' } else { Add-Content -Path $R -Value ' + psq('RESULT ' + item.id + ' fail') + ' }');
		lines.push("Write-Host ''");
	}
	lines.push("Add-Content -Path $R -Value 'DONE'");
	lines.push("Write-Host 'All done - you can close this terminal.'");
	return lines.join('\r\n') + '\r\n';
}

function parseResults(text, ids) {
	const status = {};
	(text || '').split('\n').forEach(line => {
		const m = line.trim().match(/^RESULT (\S+) (ok|fail)$/);
		if (m) { status[m[1]] = m[2]; }
	});
	return ids.map(id => ({ id, status: status[id] || 'fail' }));
}

// ---- install flow --------------------------------------------------------------
// reporter(rows, detected, timedOut) — the panel posts to the webview; the
// startup notification path summarizes in a message instead.
async function runInstall(context, selectedIds, detected, packages, reporter) {
	const plan = planInstall(selectedIds, detected, packages);
	const items = allItems(packages);
	const byId = new Map(items.map(i => [i.id, i]));
	const preFailed = [];   // {id, reason}
	const runnable = [];    // {id, kind, label, cmds}

	for (const id of plan.ordered) {
		const item = byId.get(id);
		const cmds = commandsFor(item);
		if (cmds === null) {
			plan.skipped.push({ id, reason: 'no automatic installer for this platform — use the manual link' });
			continue;
		}
		// Packages: skill download + MCP config happen in-process, before the
		// terminal runs pip. A failure fails the whole package (atomic install).
		if (item.kind === 'package') {
			const s = await installPackageSkill(item);
			if (!s.ok) { preFailed.push({ id, reason: s.error }); continue; }
			const m = installMcpServer(item);
			if (!m.ok) { preFailed.push({ id, reason: m.error }); continue; }
			if (!cmds.length) { preFailed.push({ id, reason: null, forcedOk: true }); continue; }   // nothing to run in terminal
		}
		runnable.push({ id, kind: item.kind, label: item.label, cmds });
	}

	const finish = async (terminalResults, timedOut) => {
		const results = terminalResults
			.concat(preFailed.map(f => ({ id: f.id, status: f.forcedOk ? 'ok' : 'fail', reason: f.reason })));
		const redetect = await detectAll(packages);
		reporter(reportRows(results, plan.skipped, packages), redetect, timedOut);
	};

	if (!runnable.length) { await finish([], false); return; }

	const isWin = process.platform === 'win32';
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'as-install-'));
	const resultsPath = path.join(dir, 'results.txt');
	const scriptPath = path.join(dir, isWin ? 'install.ps1' : 'install.sh');
	fs.writeFileSync(scriptPath,
		isWin ? buildInstallScriptPS(runnable, resultsPath) : buildInstallScriptBash(runnable, resultsPath),
		{ mode: 0o755 });

	const term = vscode.window.createTerminal('Academic Studio — Install');
	term.show(true);
	// -File + double quotes works whether the terminal is PowerShell or cmd;
	// -ExecutionPolicy Bypass sidesteps the client-default Restricted policy.
	term.sendText(isWin
		? 'powershell -NoProfile -ExecutionPolicy Bypass -File "' + scriptPath + '"'
		: 'bash ' + shq(scriptPath));

	// Poll the results file until DONE (or timeout ~45 min for big downloads).
	const deadline = Date.now() + 45 * 60 * 1000;
	const tick = async () => {
		let text = '';
		try { text = fs.readFileSync(resultsPath, 'utf8'); } catch (_) { /* not yet */ }
		const timedOut = Date.now() > deadline && text.indexOf('DONE') === -1;
		if (text.indexOf('DONE') !== -1 || timedOut) {
			await finish(parseResults(text, runnable.map(r => r.id)), timedOut);
			return;
		}
		setTimeout(tick, 1500);
	};
	setTimeout(tick, 1500);
}

function reportRows(results, skipped, packages) {
	const items = allItems(packages);
	const byId = new Map(items.map(i => [i.id, i]));
	const rows = [];
	for (const r of results) {
		const p = byId.get(r.id);
		rows.push({
			id: r.id, label: p ? p.label : r.id, status: r.status, reason: r.reason || '',
			manualUrl: p ? safeHttpsUrl(p.manualUrl) : '', manualSteps: p ? (p.manualSteps || '') : '',
		});
	}
	for (const s of skipped) {
		const p = byId.get(s.id);
		rows.push({
			id: s.id, label: p ? p.label : s.id, status: 'skipped', reason: s.reason || '',
			manualUrl: p ? safeHttpsUrl(p.manualUrl) : '', manualSteps: p ? (p.manualSteps || '') : '',
		});
	}
	return rows;
}

// ---- startup: offer new/updated catalog packages -------------------------------
// Every launch: fetch the catalog and offer anything the user hasn't seen and
// doesn't have. "Seen" is per id@version, so bumping a package's version in the
// catalog re-offers it (that's how skill fixes reach existing users). Explicit
// buttons mark seen; dismissing with Esc re-offers next launch.
async function checkForNewPackages(context) {
	const { packages, live } = await loadPackageCatalog(context);
	if (!live || !packages.length) { return; }   // offline — nothing useful to offer

	const seen = new Set(context.globalState.get(SEEN_PACKAGES_KEY) || []);
	const fresh = [];
	for (const p of packages) {
		const key = p.id + '@' + p.version;
		if (seen.has(key)) { continue; }
		const d = await detectPackage(p);
		if (d.found) { seen.add(key); continue; }   // already have it — never offer
		fresh.push(p);
	}
	await context.globalState.update(SEEN_PACKAGES_KEY, Array.from(seen));
	if (!fresh.length) { return; }

	const names = fresh.map(shortName).join(', ');
	const many = fresh.length > 1;
	const isUpdate = fresh.some(p => p.skill && installedSkillVersion(p.skill.name) >= 0);
	const verb = isUpdate ? 'updated' : 'new';
	const choice = await vscode.window.showInformationMessage(
		`Academic Studio: ${many ? verb + ' packages are' : 'a ' + verb + ' package is'} available — ${names}.`,
		'Install', 'View in Setup', 'Not now');

	const markSeen = async () => {
		const s = new Set(context.globalState.get(SEEN_PACKAGES_KEY) || []);
		fresh.forEach(p => s.add(p.id + '@' + p.version));
		await context.globalState.update(SEEN_PACKAGES_KEY, Array.from(s));
	};

	if (choice === 'Install') {
		await markSeen();
		const detected = await detectAll(packages);
		await runInstall(context, fresh.map(p => p.id), detected, packages, (rows) => {
			const ok = rows.filter(r => r.status === 'ok').map(r => shortName(r));
			const bad = rows.filter(r => r.status !== 'ok');
			if (!bad.length) {
				vscode.window.showInformationMessage('Academic Studio: installed ' + ok.join(', ') + '.');
			} else {
				const why = bad.map(r => shortName(r) + (r.reason ? ' (' + r.reason + ')' : '')).join(', ');
				vscode.window.showWarningMessage(
					'Academic Studio: some packages did not install — ' + why + '. Open Run Setup to retry.',
					'Open Run Setup'
				).then(c => { if (c === 'Open Run Setup') { openSetupPanel(context); } });
			}
		});
	} else if (choice === 'View in Setup') {
		await markSeen();
		openSetupPanel(context);
	} else if (choice === 'Not now') {
		await markSeen();
	}
	// dismissed (Esc / timeout): not marked seen — offered again next launch
}

// ---- panel -----------------------------------------------------------------
let currentPanel = null;   // singleton: re-running the command reveals, never duplicates

function activate(context) {
	const open = () => openSetupPanel(context);
	context.subscriptions.push(vscode.commands.registerCommand('academicStudio.openSetup', open));
	autoInstallClaudeSkills();
	// Delay slightly so the notification lands after the workbench (and Claude)
	// finish restoring.
	setTimeout(() => { checkForNewPackages(context).catch(() => {}); }, 3000);
}

async function openSetupPanel(context) {
	if (currentPanel) { currentPanel.reveal(vscode.ViewColumn.One); return; }

	const panel = vscode.window.createWebviewPanel(
		'academicStudioSetup', 'Academic Studio Setup', vscode.ViewColumn.One,
		{ enableScripts: true, retainContextWhenHidden: true }
	);
	currentPanel = panel;
	panel.onDidDispose(() => { if (currentPanel === panel) { currentPanel = null; } },
		undefined, context.subscriptions);

	const { packages, live } = await loadPackageCatalog(context);

	const stored = context.globalState.get(SELECTION_KEY) || {};
	const audience = stored.audience || 'student';
	// Currently-enabled extensions: vscode.extensions.all excludes disabled ones.
	const enabledExt = {};
	vscode.extensions.all.forEach(e => { enabledExt[(e.id || '').toLowerCase()] = true; });
	panel.webview.html = renderHtml(audience, enabledExt, packages, live);

	let lastDetected = {};
	detectAll(packages).then(d => {
		lastDetected = d;
		panel.webview.postMessage({ type: 'programStatus', detected: d });
	});

	panel.webview.onDidReceiveMessage(async (msg) => {
		if (!msg) { return; }

		if (msg.type === 'installPrograms') {
			const ids = Array.isArray(msg.ids) ? msg.ids : [];
			if (!ids.length) { return; }
			await runInstall(context, ids, lastDetected, packages, (rows, detected, timedOut) => {
				panel.webview.postMessage({ type: 'installReport', rows, detected, timedOut: !!timedOut });
			});
			return;
		}

		if (msg.type === 'apply') {
			const selectedIds = Array.isArray(msg.selected) ? msg.selected : [];
			const allIds = CATALOG.map(c => c.id);
			const toEnable = selectedIds;
			const toDisable = allIds.filter(id => selectedIds.indexOf(id) === -1);
			try {
				if (toEnable.length) { await vscode.commands.executeCommand('academicStudio.setExtensionsEnablement', toEnable, true); }
				if (toDisable.length) { await vscode.commands.executeCommand('academicStudio.setExtensionsEnablement', toDisable, false); }
			} catch (err) {
				vscode.window.showErrorMessage('Academic Studio setup could not change extensions: ' + (err && err.message ? err.message : String(err)));
				return;
			}
			await context.globalState.update(SETUP_DONE_KEY, true);
			await context.globalState.update(SELECTION_KEY, { audience: msg.audience, selected: selectedIds });
			panel.dispose();
			// Enable/disable only takes effect after a reload — do it automatically.
			await vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	}, undefined, context.subscriptions);
}

function renderHtml(audience, enabledExt, packages, catalogLive) {
	const data = JSON.stringify({
		catalog: CATALOG.map(c => ({ id: c.id, label: c.label, group: c.group, excludes: c.excludes || '' })),
		programs: PROGRAMS.map(p => ({ id: p.id, label: p.label, group: p.group, prereq: p.prereq || '' })),
		packages: packages.map(p => ({ id: p.id, label: p.label, prereq: p.prereq || '' })),
		audience, enabledExt,
	}).replace(/</g, '\\u003c');   // keep </script> in labels from closing our tag

	const extRows = CATALOG.map(c =>
		`<label class="row"><input type="checkbox" class="ext" value="${escHtml(c.id)}" data-excludes="${escHtml(c.excludes || '')}"> <span>${escHtml(c.label)}</span> <em class="status" data-for="${escHtml(c.id)}"></em></label>`
	).join('\n');
	const rowFor = p =>
		`<label class="row" data-id="${escHtml(p.id)}"><input type="checkbox" class="prog" value="${escHtml(p.id)}"> <span>${escHtml(p.label)}</span> <em class="status" data-for="${escHtml(p.id)}">checking…</em></label>`;
	const progRows = PROGRAMS.map(rowFor).join('\n');
	const pkgRows = packages.length ? packages.map(rowFor).join('\n')
		: `<p class="note">${catalogLive ? 'No packages are available yet.' : 'Could not reach the package catalog — check your connection and reopen Setup.'}</p>`;

	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
	body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 24px 32px; max-width: 760px; }
	h1 { font-size: 1.4em; margin: 0 0 4px; }
	p.sub { color: var(--vscode-descriptionForeground); margin-top: 0; }
	fieldset { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin: 20px 0; padding: 14px 18px; }
	legend { padding: 0 6px; font-weight: 600; }
	.aud { display: inline-flex; gap: 20px; } .aud label { cursor: pointer; }
	.amlabel { font-weight: 600; margin: 2px 0 8px; }
	.row { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; }
	.row code { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-left: auto; }
	.row .status { margin-left: auto; font-style: normal; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
	.status.found { color: var(--vscode-testing-iconPassed, #3fb950); }
	.status.missing { color: var(--vscode-descriptionForeground); }
	button { font-family: inherit; font-size: 1em; padding: 7px 18px; border: none; border-radius: 4px;
		color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; margin-right: 10px; }
	button:hover { background: var(--vscode-button-hoverBackground); }
	button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
	.note { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
	.banner { margin: 14px 0; padding: 10px 14px; border-radius: 6px;
		border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border));
		background: var(--vscode-inputValidation-warningBackground, transparent); }
	.banner.ok { border-color: var(--vscode-panel-border); background: transparent; color: var(--vscode-descriptionForeground); }
	.banner a { color: var(--vscode-textLink-foreground); font-weight: 600; }
	.signin { margin: 6px 0 18px; padding: 11px 14px; border-radius: 6px;
		border: 1px solid var(--vscode-inputValidation-infoBorder, var(--vscode-focusBorder));
		background: var(--vscode-inputValidation-infoBackground, transparent); }
	.signin code { background: var(--vscode-textCodeBlock-background); padding: 1px 5px; border-radius: 3px; }
	#report { margin-top: 14px; } #report .r { padding: 3px 0; } #report a { color: var(--vscode-textLink-foreground); }
</style></head><body>
	<h1>Welcome to Academic Studio</h1>
	<div class="signin">If you are a first-time user and not already logged in to Anthropic, sign in now — type <code>/login</code> in the prompt window to initiate the sign-in process.</div>
	<div id="topbanner" class="banner" style="display:none"></div>

	<fieldset>
		<p class="sub">Pick the profile that fits you. It just sets sensible defaults — you can change any item below, and you can remove or add extensions later. Leave checked any extensions that you want enabled. Unchecking will cause currently enabled extensions to be disabled.</p>
		<div class="amlabel">I am…</div>
		<div class="aud">
			<label><input type="radio" name="aud" value="student"> Students &amp; Professionals</label>
			<label><input type="radio" name="aud" value="faculty"> Faculty</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Extensions</legend>
		${extRows}
		<p class="note">LaTeX Workshop and the PDF viewer can't both be active (they both handle PDFs) — choosing one clears the other.</p>
		<button id="apply">Apply</button>
		<span class="note">Applying reloads the window to enable/disable extensions.</span>
	</fieldset>

	<fieldset id="programs">
		<legend>Supporting programs</legend>
		<p class="note">Programs your computer needs for some features. Only missing ones are checked. Installing runs the official installer in a terminal — you may be asked for your Mac password.</p>
		${progRows}
	</fieldset>

	<fieldset id="packages">
		<legend>Additional packages</legend>
		<p class="note">Optional add-ons for specific kinds of work, delivered from academic-studio.com — new ones appear here without updating the app. Checked ones install together with the programs above. Only missing ones are checked.</p>
		${pkgRows}
	</fieldset>

	<p><button id="install">Install selected programs &amp; packages</button></p>
	<div id="report"></div>

<script>
	const vscode = acquireVsCodeApi();
	const DATA = ${data};
	const extBoxes = Array.from(document.querySelectorAll('input.ext'));
	const progBoxes = Array.from(document.querySelectorAll('input.prog'));
	const radios = Array.from(document.querySelectorAll('input[name=aud]'));
	let detected = {};

	function extPreset(aud) { return DATA.catalog.filter(c => c.group === 'common' || c.group === aud).map(c => c.id); }
	// Programs: common for everyone + faculty group for Faculty. Packages: on by
	// default for every audience.
	function progPreset(aud) {
		return DATA.programs.filter(p => p.group === 'common' || (aud === 'faculty' && p.group === 'faculty')).map(p => p.id)
			.concat(DATA.packages.map(p => p.id));
	}
	function setExt(ids) { extBoxes.forEach(b => { b.checked = ids.indexOf(b.value) !== -1; }); }
	function setProg(aud) {
		const pre = progPreset(aud);
		progBoxes.forEach(b => { const d = detected[b.value]; const missing = !(d && d.found); b.checked = pre.indexOf(b.value) !== -1 && missing; });
	}
	// Default extension selection = recommended-for-audience PLUS anything already
	// enabled (so Apply never disables what you have), with exclusions resolved in
	// favor of the recommended item.
	function defaultExtSel(aud) {
		const sel = new Set(extPreset(aud));
		DATA.catalog.forEach(c => {
			if (DATA.enabledExt[c.id] && !sel.has(c.id)) {
				const conflict = (c.excludes && sel.has(c.excludes)) || DATA.catalog.some(o => o.excludes === c.id && sel.has(o.id));
				if (!conflict) { sel.add(c.id); }
			}
		});
		return Array.from(sel);
	}
	function renderExtStatus() {
		DATA.catalog.forEach(c => {
			const el = document.querySelector('.status[data-for="' + c.id + '"]');
			if (!el) { return; }
			if (DATA.enabledExt[c.id]) { el.textContent = '✓ enabled'; el.className = 'status found'; }
			else { el.textContent = 'disabled'; el.className = 'status missing'; }
		});
	}

	radios.forEach(r => r.addEventListener('change', () => { setExt(defaultExtSel(r.value)); setProg(r.value); updateBanner(); }));
	extBoxes.forEach(b => b.addEventListener('change', () => {
		if (b.checked && b.dataset.excludes) { const o = extBoxes.find(x => x.value === b.dataset.excludes); if (o) o.checked = false; }
	}));

	radios.forEach(r => { r.checked = r.value === DATA.audience; });
	setExt(defaultExtSel(DATA.audience));
	renderExtStatus();

	function renderStatus() {
		DATA.programs.concat(DATA.packages).forEach(p => {
			const el = document.querySelector('.status[data-for="' + p.id + '"]');
			const d = detected[p.id];
			if (!el) return;
			if (d && d.found) { el.textContent = '✓ ' + (d.version || 'found'); el.className = 'status found'; }
			else { el.textContent = 'not found'; el.className = 'status missing'; }
		});
	}

	function updateBanner() {
		const banner = document.getElementById('topbanner');
		if (!Object.keys(detected).length) { banner.style.display = 'none'; return; }
		const aud = (radios.find(r => r.checked) || {}).value || 'student';
		// Banner is about supporting programs only; Additional packages have their
		// own section and shouldn't be described as "programs" here.
		const missing = DATA.programs
			.filter(p => p.group === 'common' || (aud === 'faculty' && p.group === 'faculty'))
			.filter(p => !(detected[p.id] && detected[p.id].found));
		banner.style.display = 'block';
		banner.textContent = '';
		if (missing.length) {
			banner.className = 'banner';
			banner.appendChild(document.createTextNode('⚠ ' + missing.length + ' supporting program' + (missing.length > 1 ? 's' : '') +
				' not installed yet (' + missing.map(p => p.label).join(', ') + '). '));
			const j = document.createElement('a');
			j.href = '#'; j.textContent = 'Set them up below ↓';
			j.addEventListener('click', e => { e.preventDefault(); document.getElementById('programs').scrollIntoView({ behavior: 'smooth' }); });
			banner.appendChild(j);
		} else {
			banner.className = 'banner ok';
			banner.textContent = '✓ All recommended supporting programs are installed.';
		}
	}

	window.addEventListener('message', e => {
		const m = e.data;
		if (m.type === 'programStatus') { detected = m.detected || {}; renderStatus(); setProg((radios.find(r => r.checked) || {}).value || 'student'); updateBanner(); }
		if (m.type === 'installReport') {
			detected = m.detected || detected; renderStatus(); updateBanner();
			const rep = document.getElementById('report');
			rep.textContent = '';
			const note = document.createElement('p');
			note.className = 'note';
			note.textContent = (m.timedOut ? 'Install timed out or the terminal was closed. Re-run if needed.' : 'Install finished.')
				+ ' A new terminal/window may be needed before some tools are callable.';
			rep.appendChild(note);
			// Built with DOM APIs (never innerHTML): labels/reasons/urls come from
			// the online catalog and must not be interpreted as markup.
			m.rows.forEach(r => {
				const div = document.createElement('div');
				div.className = 'r';
				const icon = r.status === 'ok' ? '✓' : (r.status === 'skipped' ? '•' : '✗');
				let text = icon + ' ' + r.label + (r.status === 'ok' ? ' — installed'
					: (r.status === 'skipped' ? ' — skipped' : ' — failed'));
				if (r.status !== 'ok' && r.reason) { text += ' (' + r.reason + ')'; }
				div.appendChild(document.createTextNode(text));
				if (r.status !== 'ok' && r.manualUrl && /^https:\\/\\//.test(r.manualUrl)) {
					div.appendChild(document.createTextNode(' · '));
					const a = document.createElement('a');
					a.href = r.manualUrl; a.textContent = 'install manually';
					div.appendChild(a);
				}
				rep.appendChild(div);
			});
		}
	});

	document.getElementById('apply').addEventListener('click', () => {
		const aud = (radios.find(r => r.checked) || {}).value || 'faculty';
		vscode.postMessage({ type: 'apply', audience: aud, selected: extBoxes.filter(b => b.checked).map(b => b.value) });
	});
	document.getElementById('install').addEventListener('click', () => {
		const ids = progBoxes.filter(b => b.checked).map(b => b.value);
		const rep = document.getElementById('report');
		rep.textContent = '';
		const p = document.createElement('p');
		p.className = 'note'; p.textContent = 'Starting install in the terminal…';
		rep.appendChild(p);
		vscode.postMessage({ type: 'installPrograms', ids: ids });
	});
</script>
</body></html>`;
}

function deactivate() {}

module.exports = { activate, deactivate };
