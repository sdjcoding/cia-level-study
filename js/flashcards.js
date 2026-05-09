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
    cardArea.innerHTML = `
      <div class="flashcard-container">
        <div class="flashcard" id="flashcard">
          <div class="card-face card-front">
            <div class="card-category">${CIA.Lang.render(c.category, c.category_en)}</div>
            <div class="card-content">${CIA.Lang.render(c.front, c.front_en)}</div>
            <div class="flip-hint">탭하여 답 보기 / Tap to reveal</div>
          </div>
          <div class="card-face card-back">
            <div class="card-category">정답 / Answer</div>
            <div class="card-content">${CIA.Lang.render(c.back, c.back_en)}</div>
            <div class="card-tags">
              ${(c.tags || []).map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
    actionArea.innerHTML = `
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
    actionArea.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(btn.dataset.action));
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
    flipped = !flipped;
    document.getElementById("flashcard").classList.toggle("flipped", flipped);
  }

  function handleAction(action) {
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
