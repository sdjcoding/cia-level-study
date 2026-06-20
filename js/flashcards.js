(async function () {
  CIA.setupHeader();

  const partId = CIA.getQueryParam("part") || "part1";
  const cardArea = document.getElementById("cardArea");
  const actionArea = document.getElementById("actionArea");
  const progressInfo = document.getElementById("progressInfo");
  const partTitleEl = document.getElementById("partTitle");

  let cards = [];
  let order = [];
  let idx = 0;
  let flipped = false;

  // Hands-free auto-play ("driving mode") state.
  let autoPlaying = false;
  let autoTimers = [];
  let wakeLock = null;
  const AUTO_GAP = 2500; // pause between front and answer / cards (ms)

  const manifest = await CIA.loadManifest();
  const part = manifest.parts.find((p) => p.id === partId);
  if (!part) {
    cardArea.innerHTML = `<div class="empty-state"><h2>잘못된 Part</h2><a class="btn btn-primary" href="index.html">홈으로</a></div>`;
    return;
  }
  partTitleEl.textContent = `Part ${part.number} · ${part.titleKo}`;

  const data = await CIA.loadPartData(part, "flashcards");
  if (!data || !data.cards || data.cards.length === 0) {
    cardArea.innerHTML = `
      <div class="empty-state">
        <h2>아직 플래시카드가 없습니다</h2>
        <p>data/${escapeHTML(partId)}/flashcards.json 에 카드를 추가하세요.</p>
        <p style="margin-top:16px"><a class="btn btn-primary" href="index.html">홈으로</a></p>
      </div>`;
    return;
  }

  cards = data.cards;
  order = buildOrder(cards, partId);
  render();
  setupSwipe();

  // Re-render current card when language toggles (preserves flip state).
  window.addEventListener("cia:lang-changed", () => {
    stopAutoPlay();
    if (idx < order.length) {
      const wasFlipped = flipped;
      render();
      if (wasFlipped) {
        flipped = true;
        const fc = document.getElementById("flashcard");
        if (fc) fc.classList.add("flipped");
      }
    }
  });

  // Stop narration if the tab is hidden (e.g. switching apps while driving).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoPlay();
  });

  function buildOrder(cards, partId) {
    const progress = CIA.Progress.loadFlashcards(partId);
    const known = new Set(progress.known);
    const unknown = cards.filter((c) => !known.has(c.id));
    const knownArr = cards.filter((c) => known.has(c.id));
    return [...shuffle(unknown), ...shuffle(knownArr)];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function render() {
    if (idx >= order.length) {
      renderDone();
      return;
    }
    const c = order[idx];
    flipped = false;
    const speakBtn = CIA.Speech.supported
      ? `<button class="speak-btn" data-speak aria-label="읽어주기" title="읽어주기">🔊</button>`
      : "";
    cardArea.innerHTML = `
      <div class="flashcard-container">
        <div class="flashcard" id="flashcard">
          <div class="card-face card-front">
            ${speakBtn.replace("data-speak", 'data-speak="front"')}
            <div class="card-category">${CIA.Lang.render(c.category, c.category_en, c.category_zh)}</div>
            <div class="card-content">${CIA.Lang.render(c.front, c.front_en, c.front_zh)}</div>
            <div class="flip-hint">탭하여 답 보기 / Tap to reveal</div>
          </div>
          <div class="card-face card-back">
            ${speakBtn.replace("data-speak", 'data-speak="back"')}
            <div class="card-category">정답 / Answer</div>
            <div class="card-content">${CIA.Lang.render(c.back, c.back_en, c.back_zh)}</div>
            <div class="card-tags">
              ${(c.tags || []).map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
    const autoBar = CIA.Speech.supported
      ? `
      <div class="autoplay-bar">
        <button class="btn ${autoPlaying ? "btn-danger" : "btn-primary"}" id="autoBtn">
          ${autoPlaying ? "⏹ 정지" : "🚗 자동재생"}
        </button>
        <div class="speed-group" role="group" aria-label="재생 속도">
          ${[0.8, 1, 1.2]
            .map(
              (r) =>
                `<button class="btn btn-sm speed-btn${CIA.Speech.rate() === r ? " active" : ""}" data-rate="${r}">${r}×</button>`
            )
            .join("")}
        </div>
      </div>`
      : "";
    actionArea.innerHTML = `
      ${autoBar}
      <div class="flashcard-actions">
        <button class="btn btn-danger" data-action="unknown">모르겠음</button>
        <button class="btn" data-action="next">다음 →</button>
        <button class="btn btn-success" data-action="known">알았음</button>
      </div>
      <div class="action-bar-bottom">
        <button class="btn btn-block" id="resetBtn">진도 초기화</button>
      </div>
    `;

    document.getElementById("flashcard").addEventListener("click", flip);
    cardArea.querySelectorAll("[data-speak]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        speakFace(btn.dataset.speak);
      });
    });
    actionArea.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(btn.dataset.action));
    });
    const autoBtn = document.getElementById("autoBtn");
    if (autoBtn) autoBtn.addEventListener("click", () => (autoPlaying ? stopAutoPlay() : startAutoPlay()));
    actionArea.querySelectorAll(".speed-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        CIA.Speech.setRate(Number(btn.dataset.rate));
        actionArea.querySelectorAll(".speed-btn").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
      });
    });
    document.getElementById("resetBtn").addEventListener("click", () => {
      if (confirm(`Part ${part.number} 진도를 모두 초기화할까요?`)) {
        CIA.Progress.resetPart(partId);
        location.reload();
      }
    });

    updateProgress();
  }

  function flip() {
    if (autoPlaying) stopAutoPlay();
    flipped = !flipped;
    document.getElementById("flashcard").classList.toggle("flipped", flipped);
  }

  function faceSegments(side) {
    const c = order[idx];
    if (!c) return [];
    return side === "back"
      ? CIA.Lang.segments(c.back, c.back_en, c.back_zh)
      : CIA.Lang.segments(c.front, c.front_en, c.front_zh);
  }

  // Manual speaker button: read the requested face in the selected languages.
  function speakFace(side) {
    if (autoPlaying) stopAutoPlay();
    CIA.Speech.speakSegments(faceSegments(side));
  }

  function handleAction(action) {
    if (autoPlaying) stopAutoPlay();
    const c = order[idx];
    if (action === "known") CIA.Progress.markCard(partId, c.id, "known");
    else if (action === "unknown") CIA.Progress.markCard(partId, c.id, "unknown");
    else {
      const p = CIA.Progress.loadFlashcards(partId);
      if (!p.studied.includes(c.id)) {
        p.studied.push(c.id);
        CIA.Progress.saveFlashcards(partId, p);
      }
    }
    idx++;
    render();
  }

  // ---- Hands-free auto-play (driving mode) ----------------------------------
  function clearAutoTimers() {
    autoTimers.forEach((t) => clearTimeout(t));
    autoTimers = [];
  }

  async function requestWakeLock() {
    try {
      if (navigator.wakeLock && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch {
      /* unsupported or denied — ignore */
    }
  }
  function releaseWakeLock() {
    try {
      if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
      }
    } catch {
      wakeLock = null;
    }
  }

  function startAutoPlay() {
    if (autoPlaying || idx >= order.length) return;
    autoPlaying = true;
    requestWakeLock();
    render(); // refresh control to "⏹ 정지"
    playCurrentCard();
  }

  function stopAutoPlay() {
    if (!autoPlaying) {
      clearAutoTimers();
      return;
    }
    autoPlaying = false;
    clearAutoTimers();
    CIA.Speech.cancel();
    releaseWakeLock();
    const autoBtn = document.getElementById("autoBtn");
    if (autoBtn) {
      autoBtn.textContent = "🚗 자동재생";
      autoBtn.classList.remove("btn-danger");
      autoBtn.classList.add("btn-primary");
    }
  }

  // Read front → pause → flip → read answer → pause → advance, all chained off
  // speech-end callbacks so timing follows the narration (no screen needed).
  function playCurrentCard() {
    if (!autoPlaying) return;
    if (idx >= order.length) {
      stopAutoPlay();
      render();
      return;
    }
    flipped = false;
    const fc = document.getElementById("flashcard");
    if (fc) fc.classList.remove("flipped");

    CIA.Speech.speakSegments(faceSegments("front"), {
      ondone: () => {
        if (!autoPlaying) return;
        autoTimers.push(
          setTimeout(() => {
            if (!autoPlaying) return;
            flipped = true;
            const card = document.getElementById("flashcard");
            if (card) card.classList.add("flipped");
            CIA.Speech.speakSegments(faceSegments("back"), {
              ondone: () => {
                if (!autoPlaying) return;
                autoTimers.push(
                  setTimeout(() => {
                    if (!autoPlaying) return;
                    const c = order[idx];
                    const p = CIA.Progress.loadFlashcards(partId);
                    if (!p.studied.includes(c.id)) {
                      p.studied.push(c.id);
                      CIA.Progress.saveFlashcards(partId, p);
                    }
                    idx++;
                    if (idx >= order.length) {
                      stopAutoPlay();
                      render();
                    } else {
                      render();
                      playCurrentCard();
                    }
                  }, AUTO_GAP)
                );
              },
            });
          }, AUTO_GAP)
        );
      },
    });
  }

  function renderDone() {
    const progress = CIA.Progress.loadFlashcards(partId);
    cardArea.innerHTML = `
      <div class="quiz-result">
        <h2>학습 세션 완료!</h2>
        <div class="score-big">${cards.length}장</div>
        <p>총 학습 ${progress.studied.length} / ${cards.length} · 알았음 ${progress.known.length}장</p>
      </div>
    `;
    actionArea.innerHTML = `
      <div class="footer-actions">
        <button class="btn btn-primary" id="restartBtn">다시 시작</button>
        <a class="btn" href="index.html">홈으로</a>
      </div>
    `;
    document.getElementById("restartBtn").addEventListener("click", () => {
      idx = 0;
      order = buildOrder(cards, partId);
      render();
    });
  }

  function updateProgress() {
    progressInfo.textContent = `${idx + 1} / ${order.length}`;
  }

  function setupSwipe() {
    let startX = 0;
    let startY = 0;
    cardArea.addEventListener(
      "touchstart",
      (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      },
      { passive: true }
    );
    cardArea.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) handleAction("next");
        }
      },
      { passive: true }
    );
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
})();
