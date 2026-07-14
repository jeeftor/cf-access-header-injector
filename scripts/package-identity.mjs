import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const [directory] = process.argv.slice(2);

if (!directory) {
  throw new Error("Usage: node scripts/package-identity.mjs <staged-package-directory>");
}

const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
const files = await listFiles(directory);
const hash = createHash("sha256");

for (const file of files) {
  hash.update(relative(directory, file));
  hash.update("\0");
  hash.update(await readFile(file));
  hash.update("\0");
}

console.log(`Chrome stage: v${manifest.version}`);
if (manifest.version_name) {
  console.log(`Build label: ${manifest.version_name}`);
}
console.log(`SHA-256: ${hash.digest("hex")}`);
console.log(`Load directory: ${directory}`);

/**
 * Lists package files in a stable lexical order.
 *
 * @param {string} directory Directory to traverse.
 * @returns {Promise<string[]>} Absolute file paths.
 */
async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}
