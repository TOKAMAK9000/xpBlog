const explorerWindow = document.getElementById("file-explorer");
const folderTree = document.getElementById("folder-tree");
const folderContents = document.getElementById("folder-contents");
const currentPath = document.getElementById("current-path");
const statusText = document.getElementById("status-text");
const docTemplate = document.getElementById("doc-template");
const fontSelect = document.getElementById("font-select");
const fontInput = document.getElementById("font-input");
const fontApply = document.getElementById("font-apply");
const taskbarClock = document.getElementById("taskbar-clock");
const taskbarWindows = document.getElementById("taskbar-windows");
const explorerToolbar = document.querySelector("#file-explorer .toolbar");
const desktopIcons = document.getElementById("desktop-icons");

const state = {
  tree: null,
  currentNode: null,
  zIndex: 1,
};

function openWindow(windowEl) {
  windowEl.classList.remove("minimized");
  windowEl.classList.remove("hidden");
  bringToFront(windowEl);
}

function closeWindow(windowEl) {
  windowEl.classList.add("hidden");
  windowEl.classList.remove("minimized");
  removeTaskButton(windowEl);
  if (windowEl.dataset.dynamic === "true") {
    windowEl.remove();
  }
}

function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  taskbarClock.textContent = time;
}

function setFontFamily(value) {
  if (!value) return;
  document.documentElement.style.setProperty("--ui-font", value);
}

function bringToFront(windowEl) {
  state.zIndex += 1;
  windowEl.style.zIndex = state.zIndex;
}

function attachParents(node, parent = null) {
  if (!node) return;
  node.parent = parent;
  if (!node.children) return;
  node.children.forEach((child) => attachParents(child, node));
}

function getNodePath(node) {
  const names = [];
  let current = node;
  while (current) {
    names.unshift(current.name);
    current = current.parent;
  }
  return names.join(" > ");
}

function findNodeByName(node, target) {
  if (!node) return null;
  if (node.name === target) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findNodeByName(child, target);
    if (found) return found;
  }
  return null;
}

function findNodeByPath(node, targetPath) {
  if (!node) return null;
  if (node.type === "file" && node.path === targetPath) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findNodeByPath(child, targetPath);
    if (found) return found;
  }
  return null;
}

function buildTree(node, container, depth = 0) {
  if (!node || !node.children) return;
  for (const child of node.children) {
    if (child.type !== "folder") continue;
    const item = document.createElement("div");
    item.className = "tree-item";
    item.style.marginLeft = `${depth * 12}px`;
    item.textContent = child.name;
    item.addEventListener("click", () => {
      renderFolder(child);
    });
    container.appendChild(item);
    if (child.children && child.children.length) {
      buildTree(child, container, depth + 1);
    }
  }
}

function renderFolder(node) {
  if (!node || node.type !== "folder") return;
  state.currentNode = node;
  currentPath.textContent = getNodePath(node);
  folderContents.innerHTML = "";
  const children = node.children || [];
  statusText.textContent = children.length
    ? `${children.length} 个项目`
    : "此文件夹为空";

  children.forEach((child) => {
    const card = document.createElement("div");
    card.className = `file-card ${child.type}`;
    card.innerHTML = `<div class="file-icon"></div><div>${child.name}</div>`;
    card.addEventListener("click", () => {
      if (child.type === "folder") {
        renderFolder(child);
      } else {
        openDocument(child);
      }
    });
    folderContents.appendChild(card);
  });
}

async function openDocument(node) {
  if (!node || node.type !== "file") return;
  try {
    const response = await fetch(node.path);
    const text = await response.text();
    const html = markdownToHtml(text);
    const docWindow = createDocWindow(node.name, html, node.path);
    createTaskButton(docWindow);
    setTaskButtonTitle(docWindow, node.name);
    openWindow(docWindow);
    highlightDocWindow(docWindow);
  } catch (error) {
    const docWindow = createDocWindow(
      "错误",
      "<p>无法加载 Markdown 文件。</p>",
      node.path
    );
    createTaskButton(docWindow);
    openWindow(docWindow);
  }
}

function markdownToHtml(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  let html = "";
  let inList = false;
  let inCode = false;
  let codeBuffer = [];
  let codeLang = "";
  let paraBuffer = [];

  const flushParagraph = () => {
    if (!paraBuffer.length) return;
    html += `<p>${inlineFormat(paraBuffer.join(" "))}</p>`;
    paraBuffer = [];
  };

  const flushList = () => {
    if (!inList) return;
    html += "</ul>";
    inList = false;
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        const safeLang = codeLang.replace(/[^a-zA-Z0-9_-]/g, "");
        const langClass = safeLang ? ` class="language-${safeLang}"` : "";
        html += `<pre><code${langClass}>${escapeHtml(
          codeBuffer.join("\n")
        )}</code></pre>`;
        codeBuffer = [];
        inCode = false;
        codeLang = "";
      } else {
        flushParagraph();
        flushList();
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      html += `<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`;
      continue;
    }

    const blockquoteMatch = line.match(/^>\s+(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      html += `<blockquote>${inlineFormat(blockquoteMatch[1])}</blockquote>`;
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineFormat(listMatch[1])}</li>`;
      continue;
    }

    paraBuffer.push(line.trim());
  }

  flushParagraph();
  flushList();
  return html;
}

function inlineFormat(text) {
  let output = escapeHtml(text);
  output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*(.+?)\*/g, "<em>$1</em>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
  return output;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

async function loadTree() {
  const response = await fetch("content/index.json");
  state.tree = await response.json();
  attachParents(state.tree);
  folderTree.innerHTML = "";
  buildTree(state.tree, folderTree);
  renderFolder(state.tree);
}

function createTaskButton(windowEl) {
  if (!taskbarWindows) return null;
  const existing = taskbarWindows.querySelector(
    `[data-window-id="${windowEl.id}"]`
  );
  if (existing) return existing;
  const button = document.createElement("div");
  button.className = "taskbar-btn taskbar-window";
  button.dataset.windowId = windowEl.id;
  button.textContent =
    windowEl.querySelector(".title")?.textContent?.trim() || "窗口";
  button.addEventListener("click", () => {
    if (windowEl.classList.contains("minimized")) {
      openWindow(windowEl);
    } else {
      windowEl.classList.add("minimized");
    }
  });
  taskbarWindows.appendChild(button);
  return button;
}

function setTaskButtonTitle(windowEl, title) {
  if (!title) return;
  const button = taskbarWindows?.querySelector(
    `[data-window-id="${windowEl.id}"]`
  );
  if (button) {
    button.textContent = title;
  }
}

function removeTaskButton(windowEl) {
  const button = taskbarWindows?.querySelector(
    `[data-window-id="${windowEl.id}"]`
  );
  if (button) {
    button.remove();
  }
}

function createDocWindow(title, html, path) {
  if (!docTemplate) return null;
  const node = docTemplate.content.firstElementChild.cloneNode(true);
  const windowId = `doc-viewer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  node.id = windowId;
  node.dataset.dynamic = "true";
  if (path) {
    node.dataset.docPath = path;
  }
  const titleEl = node.querySelector(".doc-title");
  const contentEl = node.querySelector(".doc-content");
  if (titleEl) titleEl.textContent = title || "文档";
  if (contentEl) contentEl.innerHTML = html || "";
  const shareBtn = node.querySelector("[data-action='share']");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const sharePath = node.dataset.docPath || "";
      if (!sharePath) return;
      const shareUrl = buildShareUrl(sharePath);
      copyToClipboard(shareUrl).then((ok) => {
        if (ok) {
          shareBtn.textContent = "已复制";
          setTimeout(() => {
            shareBtn.textContent = "复制链接";
          }, 1200);
        }
      });
    });
  }
  document.body.appendChild(node);
  applyWindowBehavior(node);
  return node;
}

function highlightDocWindow(windowEl) {
  if (!windowEl || !window.hljs) return;
  const blocks = windowEl.querySelectorAll(".doc-content pre code");
  blocks.forEach((block) => {
    if (!block.classList.contains("hljs")) {
      window.hljs.highlightElement(block);
    }
  });
}

function renderDesktopIcons(rootNode) {
  if (!desktopIcons) return;
  desktopIcons.innerHTML = "";
  const items = rootNode?.children || [];
  if (!items.length) return;
  items.forEach((item) => {
    const icon = document.createElement("div");
    icon.className = "desktop-icon";
    icon.innerHTML =
      '<div class="icon"></div><div class="icon-label"></div>';
    const iconBox = icon.querySelector(".icon");
    if (iconBox) {
      iconBox.classList.add(item.type === "folder" ? "icon-folder" : "icon-file");
    }
    const label = icon.querySelector(".icon-label");
    if (label) label.textContent = item.name;
    icon.addEventListener("click", () => {
      openWindow(explorerWindow);
      createTaskButton(explorerWindow);
      if (item.type === "folder") {
        renderFolder(item);
      } else {
        openDocument(item);
      }
    });
    desktopIcons.appendChild(icon);
  });
}

function bindWindowControls(windowEl) {
  windowEl.querySelectorAll(".win-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "close") {
        closeWindow(windowEl);
      } else if (action === "minimize") {
        createTaskButton(windowEl);
        windowEl.classList.add("minimized");
      } else if (action === "maximize") {
        toggleMaximize(windowEl);
      }
    });
  });
}

function toggleMaximize(windowEl) {
  if (windowEl.classList.contains("maximized")) {
    windowEl.classList.remove("maximized");
    windowEl.style.top = windowEl.dataset.prevTop || "";
    windowEl.style.left = windowEl.dataset.prevLeft || "";
    windowEl.style.width = windowEl.dataset.prevWidth || "";
    windowEl.style.height = windowEl.dataset.prevHeight || "";
  } else {
    const rect = windowEl.getBoundingClientRect();
    windowEl.dataset.prevTop = `${rect.top}px`;
    windowEl.dataset.prevLeft = `${rect.left}px`;
    windowEl.dataset.prevWidth = `${rect.width}px`;
    windowEl.dataset.prevHeight = `${rect.height}px`;
    windowEl.style.top = "";
    windowEl.style.left = "";
    windowEl.style.width = "";
    windowEl.style.height = "";
    windowEl.classList.add("maximized");
  }
  bringToFront(windowEl);
}

function enableDragging(windowEl) {
  const titleBar = windowEl.querySelector(".title-bar");
  if (!titleBar) return;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  titleBar.addEventListener("mousedown", (event) => {
    if (event.target.closest(".win-btn")) return;
    if (windowEl.classList.contains("maximized")) return;
    dragging = true;
    const rect = windowEl.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    originLeft = rect.left;
    originTop = rect.top;
    bringToFront(windowEl);
    event.preventDefault();
  });

  document.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    const nextLeft = originLeft + (event.clientX - startX);
    const nextTop = originTop + (event.clientY - startY);
    windowEl.style.left = `${Math.max(0, nextLeft)}px`;
    windowEl.style.top = `${Math.max(0, nextTop)}px`;
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
}

function applyWindowBehavior(windowEl) {
  bindWindowControls(windowEl);
  enableDragging(windowEl);
  windowEl.addEventListener("mousedown", () => bringToFront(windowEl));
}

function bindToolbarActions() {
  if (!explorerToolbar) return;
  explorerToolbar.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    if (target.dataset.action === "up") {
      const parent = state.currentNode?.parent;
      if (parent) {
        renderFolder(parent);
      }
    }
  });
}

function buildShareUrl(docPath) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?doc=${encodeURIComponent(docPath)}`;
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    return fallbackCopy(text);
  }
  return fallbackCopy(text);
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (error) {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

function handleAutoOpen() {
  const params = new URLSearchParams(window.location.search);
  const docParam = params.get("doc");
  if (!docParam) return;
  const node = state.tree ? findNodeByPath(state.tree, docParam) : null;
  if (node) {
    openDocument(node);
    return;
  }
  const name = docParam.split("/").pop() || "文档";
  openDocument({ type: "file", name, path: docParam });
}

fontApply.addEventListener("click", () => {
  const custom = fontInput.value.trim();
  if (custom) {
    setFontFamily(custom);
  } else {
    setFontFamily(fontSelect.value);
  }
});

fontSelect.addEventListener("change", () => {
  setFontFamily(fontSelect.value);
});

updateClock();
setInterval(updateClock, 1000 * 30);

document.querySelectorAll(".window").forEach((windowEl) => {
  applyWindowBehavior(windowEl);
});
bindToolbarActions();
loadTree().then(() => {
  renderDesktopIcons(state.tree);
  handleAutoOpen();
});
