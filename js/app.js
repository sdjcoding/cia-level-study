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

const Lang = {
  // Canonical display/speech order. Any subset may be selected.
  ORDER: ["ko", "en", "zh"],
  LABEL: { ko: "한", en: "EN", zh: "中" },
  // BCP-47 codes so the Web Speech API picks a per-language voice
  // (notably a Chinese voice for zh).
  SPEECH: { ko: "ko-KR", en: "en-US", zh: "zh-CN" },

  // Sanitized array of selected language codes (always at least one).
  // Migrates the legacy single-choice `lang` value on first read.
  selected() {
    const s = Storage.get("cia:settings", {});
    if (!Array.isArray(s.langs)) {
      const legacy = s.lang;
      const map = { both: ["ko", "en"], ko: ["ko"], en: ["en"] };
      s.langs = map[legacy] || ["ko", "en"];
      Storage.set("cia:settings", s);
    }
    const set = new Set(s.langs.filter((c) => this.ORDER.includes(c)));
    const arr = this.ORDER.filter((c) => set.has(c));
    return arr.length ? arr : ["ko", "en"];
  },
  isSelected(code) {
    return this.selected().includes(code);
  },
  // Add/remove a language code; never allow an empty selection.
  toggleLang(code) {
    if (!this.ORDER.includes(code)) return this.selected();
    const cur = new Set(this.selected());
    if (cur.has(code)) {
      if (cur.size === 1) return [...cur]; // keep at least one
      cur.delete(code);
    } else {
      cur.add(code);
    }
    const next = this.ORDER.filter((c) => cur.has(c));
    const s = Storage.get("cia:settings", {});
    s.langs = next;
    Storage.set("cia:settings", s);
    return next;
  },
  // Compact label for the header button, e.g. "한·EN".
  label() {
    return this.selected().map((c) => this.LABEL[c]).join("·");
  },

  _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  },

  // Returns [{code, text}] for selected languages that have content,
  // in canonical order. Falls back to ko (then en) so something always shows.
  _parts(ko, en, zh) {
    const byCode = { ko, en, zh };
    const sel = this.selected();
    let parts = sel
      .map((code) => ({ code, text: byCode[code] }))
      .filter((p) => p.text && String(p.text).trim().length > 0);
    if (parts.length === 0) {
      const fb = (ko && String(ko).trim()) ? ko : en;
      if (fb && String(fb).trim().length > 0) {
        parts = [{ code: (ko && String(ko).trim()) ? "ko" : "en", text: fb }];
      }
    }
    return parts;
  },

  // Render a (ko, en[, zh]) tuple as safe HTML for the selected languages.
  render(ko, en, zh) {
    const parts = this._parts(ko, en, zh);
    const cls = { ko: "lang-ko", en: "lang-en", zh: "lang-zh" };
    if (parts.length === 1 && parts[0].code === "en") {
      // Single English block uses the un-separated style.
      return `<span class="lang-en-only">${this._esc(parts[0].text)}</span>`;
    }
    return parts
      .map((p) => `<div class="${cls[p.code]}">${this._esc(p.text)}</div>`)
      .join("");
  },

  // Returns [{code, lang, text}] for TTS, selected languages in canonical order.
  segments(ko, en, zh) {
    return this._parts(ko, en, zh).map((p) => ({
      code: p.code,
      lang: this.SPEECH[p.code],
      text: String(p.text),
    }));
  },
};

// Text-to-speech wrapper over the Web Speech API. Speaks an ordered list of
// {lang, text} segments sequentially so multi-language cards read end to end.
const Speech = {
  supported: typeof window !== "undefined" && "speechSynthesis" in window,
  _voices: [],
  _token: 0,

  init() {
    if (!this.supported) return;
    const load = () => {
      try {
        this._voices = window.speechSynthesis.getVoices() || [];
      } catch {
        this._voices = [];
      }
    };
    load();
    // Voices often load asynchronously (first call / iOS / Chrome).
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", load);
    } else {
      window.speechSynthesis.onvoiceschanged = load;
    }
  },

  rate() {
    const s = Storage.get("cia:settings", {});
    const r = Number(s.ttsRate);
    return r >= 0.5 && r <= 2 ? r : 0.95;
  },
  setRate(r) {
    const s = Storage.get("cia:settings", {});
    s.ttsRate = r;
    Storage.set("cia:settings", s);
  },

  voiceFor(langCode) {
    if (!langCode) return null;
    const base = langCode.toLowerCase().split("-")[0];
    return (
      this._voices.find((v) => v.lang && v.lang.toLowerCase() === langCode.toLowerCase()) ||
      this._voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(base)) ||
      null
    );
  },

  // Make answer/question text read more naturally as audio.
  _clean(text) {
    return String(text == null ? "" : text)
      .replace(/\s*\n+\s*/g, ". ")
      .replace(/\s{2,}/g, " ")
      .trim();
  },

  cancel() {
    this._token++;
    if (this.supported) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  },

  // Speak segments sequentially. Returns a token; if Speech.cancel() (or a new
  // speakSegments) runs before completion, the chain stops and ondone is skipped.
  speakSegments(segments, opts = {}) {
    if (!this.supported) {
      if (opts.ondone) opts.ondone();
      return -1;
    }
    this.cancel();
    const token = this._token;
    const list = (segments || [])
      .map((s) => ({ lang: s.lang, text: this._clean(s.text) }))
      .filter((s) => s.text.length > 0);
    const rate = opts.rate || this.rate();
    let i = 0;
    const next = () => {
      if (token !== this._token) return; // cancelled / superseded
      if (i >= list.length) {
        if (opts.ondone) opts.ondone();
        return;
      }
      const seg = list[i++];
      const u = new SpeechSynthesisUtterance(seg.text);
      if (seg.lang) u.lang = seg.lang;
      const v = this.voiceFor(seg.lang);
      if (v) u.voice = v;
      u.rate = rate;
      u.onend = next;
      u.onerror = next;
      try {
        window.speechSynthesis.speak(u);
      } catch {
        next();
      }
    };
    next();
    return token;
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
  const lbtn = document.getElementById("langToggle");
  if (lbtn) {
    lbtn.textContent = Lang.label();

    // Build a checkbox dropdown for multi-language selection.
    const menu = document.createElement("div");
    menu.className = "lang-menu";
    const OPTIONS = [
      { code: "ko", label: "한국어" },
      { code: "en", label: "English" },
      { code: "zh", label: "中文" },
    ];
    menu.innerHTML = OPTIONS.map(
      (o) => `
      <label>
        <input type="checkbox" data-lang="${o.code}"${Lang.isSelected(o.code) ? " checked" : ""}>
        <span>${o.label}</span>
      </label>`
    ).join("");

    const actions = lbtn.parentElement || document.body;
    actions.style.position = actions.style.position || "relative";
    actions.appendChild(menu);

    const closeMenu = () => menu.classList.remove("open");
    lbtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("open");
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", closeMenu);

    menu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        Lang.toggleLang(cb.dataset.lang);
        // Re-sync all checkboxes (last-one-selected can't be unchecked).
        menu.querySelectorAll('input[type="checkbox"]').forEach((c) => {
          c.checked = Lang.isSelected(c.dataset.lang);
        });
        lbtn.textContent = Lang.label();
        window.dispatchEvent(new CustomEvent("cia:lang-changed", { detail: Lang.selected() }));
      });
    });
  }
}

Theme.init();
Speech.init();

window.CIA = { Storage, Progress, Theme, Lang, Speech, loadJSON, loadManifest, loadPartData, getQueryParam, setupHeader };
