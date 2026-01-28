const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const contentRoot = path.join(repoRoot, "content");
const outputFile = path.join(contentRoot, "index.json");
const rootName = "\u684c\u9762";

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) {
      return a.isDirectory() ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function buildNode(absPath, relPath) {
  const stats = fs.statSync(absPath);
  const name = path.basename(absPath);
  if (stats.isDirectory()) {
    const entries = fs.readdirSync(absPath, { withFileTypes: true });
    const children = [];
    for (const entry of sortEntries(entries)) {
      const childAbs = path.join(absPath, entry.name);
      const childRel = path.join(relPath, entry.name);
      const childPosix = toPosix(childRel);
      if (childPosix === "content/index.json") {
        continue;
      }
      children.push(buildNode(childAbs, childRel));
    }
    return {
      name,
      type: "folder",
      children,
    };
  }

  return {
    name,
    type: "file",
    path: toPosix(relPath),
  };
}

function buildTree() {
  if (!fs.existsSync(contentRoot)) {
    throw new Error("content directory not found.");
  }
  const entries = fs.readdirSync(contentRoot, { withFileTypes: true });
  const children = [];
  for (const entry of sortEntries(entries)) {
    const childAbs = path.join(contentRoot, entry.name);
    const childRel = path.join("content", entry.name);
    const childPosix = toPosix(childRel);
    if (childPosix === "content/index.json") {
      continue;
    }
    children.push(buildNode(childAbs, childRel));
  }

  return {
    name: rootName,
    type: "folder",
    children,
  };
}

const tree = buildTree();
const json = JSON.stringify(tree, null, 2) + "\n";
fs.writeFileSync(outputFile, json, "utf8");
