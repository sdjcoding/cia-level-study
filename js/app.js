const Storage = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

const Progress = {
  loadFlashcards(partId) {
    return Storage.get(`cia:progress:${partId}`, { studied: [], known: [] });
  },
  saveFlashcards(partId, data) {
    Storage.set(`cia:progress:${partId}`, data);
  },
  markCard(partId, cardId, status) {
    const p = this.loadFlashcards(partId);
    if (!p.studied.includes(cardId)) p.studied.push(cardId);
    if (status === "known") {
      if (!p.known.includes(cardId)) p.known.push(cardId);
    } else {
      p.known = p.known.filter((id) => id !== cardId);
    }
    this.saveFlashcards(partId, p);
  },
  loadQuizWrong(partId) {
    return Storage.get(`cia:quiz:${partId}:wrong`, []);
  },
  recordQuiz(partId, questionId, correct) {
    const wrong = this.loadQuizWrong(partId);
    if (!correct) {
      if (!wrong.includes(questionId)) wrong.push(questionId);
    } else {
      const idx = wrong.indexOf(questionId);
      if (idx >= 0) wrong.splice(idx, 1);
    }
    Storage.set(`cia:quiz:${partId}:wrong`, wrong);
  },
  resetPart(partId) {
    Storage.remove(`cia:progress:${partId}`);
    Storage.remove(`cia:quiz:${partId}:wrong`);
  },
};

const Theme = {
  init() {
    const saved = Storage.get("cia:settings", {});
    if (saved.theme) {
      document.documentElement.setAttribute("data-theme", saved.theme);
    }
  },
  toggle() {
    const current =
      document.documentElement.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    const settings = Storage.get("cia:settings", {});
    settings.theme = next;
    Storage.set("cia:settings", settings);
    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = next === "dark" ? "☀️" : "🌙";
  },
  current() {
    return (
      document.documentElement.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    );
  },
};

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function loadManifest() {
  return loadJSON("data/manifest.json");
}

async function loadPartData(part, type) {
  const path = type === "flashcards" ? part.flashcards : part.quiz;
  try {
    return await loadJSON(path);
  } catch {
    return null;
  }
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setupHeader() {
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.textContent = Theme.current() === "dark" ? "☀️" : "🌙";
    btn.addEventListener("click", () => Theme.toggle());
  }
}

Theme.init();

window.CIA = { Storage, Progress, Theme, loadJSON, loadManifest, loadPartData, getQueryParam, setupHeader };
