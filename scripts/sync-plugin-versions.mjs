#!/usr/bin/env node
// Refresh `latestVersion` in the Recommended Plugins catalog from the marketplaces
// the entries actually point at.
//
// Run Setup detects an available update by comparing the catalog's advertised
// `latestVersion` against the version Claude Code recorded at install time
// (extension.js → detectPackage). That field is hand-maintained, so when a plugin
// ships a release and nobody edits the catalog, Studio simply never offers the
// update — the install itself is always current, since `claude plugin update`
// pulls whatever is at the marketplace HEAD.
//
// This script removes the hand-maintenance. For every marketplace-plugin entry it
// reads the marketplace's own manifest to find where the plugin lives, then reads
// that plugin's plugin.json for its version, and rewrites the field.
//
// Standalone-skill entries ({source: "owner/repo#tag"}, e.g. the econ-* skills)
// carry no `latestVersion` and are left alone — they pin a git tag, which is a
// different freshness question.
//
//   node scripts/sync-plugin-versions.mjs           rewrite both catalog files
//   node scripts/sync-plugin-versions.mjs --check   report drift, exit 1, write nothing
//
// Both files are updated: site/plugins.json is the live catalog (GitHub Pages
// serves it at academic-studio.com/plugins.json, which running copies of Studio
// fetch on startup — so pushing it reaches installed users with no new build), and
// the overlay snapshot is the offline fallback bundled into the app.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
	path.join(ROOT, 'site', 'plugins.json'),
	path.join(ROOT, 'overlay', 'builtin-extensions', 'academic-studio-setup', 'packages.snapshot.json'),
];
const CHECK = process.argv.includes('--check');

const raw = (repo, file) => `https://raw.githubusercontent.com/${repo}/HEAD/${file}`;

async function getJson(url) {
	const res = await fetch(url);
	if (!res.ok) { throw new Error(`${res.status} ${res.statusText} for ${url}`); }
	return res.json();
}

// owner/repo + plugin name -> the version in that plugin's plugin.json. Goes
// through the marketplace manifest rather than guessing ./plugins/<name>, so a
// marketplace that lays its plugins out differently still resolves.
async function latestVersion(repo, plugin) {
	const manifest = await getJson(raw(repo, '.claude-plugin/marketplace.json'));
	const entry = (manifest.plugins || []).find(p => p.name === plugin);
	if (!entry) { throw new Error(`plugin "${plugin}" is not in ${repo}'s marketplace.json`); }
	const src = String(entry.source || '').replace(/^\.\//, '').replace(/\/$/, '');
	if (!src) { throw new Error(`plugin "${plugin}" in ${repo} has no source path`); }
	const { version } = await getJson(raw(repo, `${src}/.claude-plugin/plugin.json`));
	if (!version) { throw new Error(`${repo}/${src}/.claude-plugin/plugin.json has no version`); }
	return String(version);
}

// Replace one entry's latestVersion by surgical string edit rather than
// re-serializing: the catalog files are hand-written and hand-read, and
// JSON.stringify would reflow them.
function setVersion(text, id, version) {
	const at = text.indexOf(`"id": "${id}"`);
	if (at < 0) { return null; }
	const nextEntry = text.indexOf('"id": "', at + 1);
	const end = nextEntry < 0 ? text.length : nextEntry;
	const re = /"latestVersion":\s*"[^"]*"/;
	const slice = text.slice(at, end);
	if (!re.test(slice)) { return null; }
	return text.slice(0, at) + slice.replace(re, `"latestVersion": "${version}"`) + text.slice(end);
}

const catalog = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const targets = (catalog.packages || []).filter(p => p.marketplaceRepo && p.plugin && p.latestVersion);

const wanted = new Map();
let failed = 0;
for (const p of targets) {
	try {
		wanted.set(p.id, await latestVersion(p.marketplaceRepo, p.plugin));
	} catch (e) {
		console.error(`  ! ${p.id}: ${e.message}`);
		failed++;
	}
}

let drift = 0;
for (const p of targets) {
	const to = wanted.get(p.id);
	if (!to) { continue; }
	if (to === p.latestVersion) { console.log(`  = ${p.id} ${p.latestVersion}`); continue; }
	drift++;
	console.log(`  ${CHECK ? '!' : '→'} ${p.id} ${p.latestVersion} → ${to}`);
}

if (!CHECK && drift) {
	for (const file of FILES) {
		let text = fs.readFileSync(file, 'utf8');
		let touched = 0;
		for (const p of targets) {
			const to = wanted.get(p.id);
			if (!to) { continue; }
			const next = setVersion(text, p.id, to);
			// A missing entry is worth saying out loud: the two files are supposed to
			// stay in sync, and a silent skip is how they drift apart.
			if (next === null) { console.error(`  ! ${p.id} has no latestVersion in ${path.basename(file)}`); continue; }
			if (next !== text) { touched++; }
			text = next;
		}
		fs.writeFileSync(file, text);
		console.log(`  wrote ${path.relative(ROOT, file)} (${touched} changed)`);
	}
	console.log('\nPush site/plugins.json to reach already-installed copies of Studio.');
}

if (failed) { process.exit(2); }
if (CHECK && drift) { console.error(`\n${drift} entr${drift === 1 ? 'y is' : 'ies are'} stale — run without --check.`); process.exit(1); }
if (!drift) { console.log('\nCatalog is current.'); }
