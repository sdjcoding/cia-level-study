(async function () {
  CIA.setupHeader();

  const partId = CIA.getQueryParam("part") || "part1";
  const mode = CIA.getQueryParam("mode") || "all";
  const quizArea = document.getElementById("quizArea");
  const progressInfo = document.getElementById("progressInfo");
  const partTitleEl = document.getElementById("partTitle");

  let questions = [];
  let order = [];
  let idx = 0;
  let correctCount = 0;
  let answeredThis = false;

  const manifest = await CIA.loadManifest();
  const part = manifest.parts.find((p) => p.id === partId);
  if (!part) {
    quizArea.innerHTML = `<div class="empty-state"><h2>잘못된 Part</h2><a class="btn btn-primary" href="index.html">홈으로</a></div>`;
    return;
  }
  partTitleEl.textContent = `Part ${part.number} · ${part.titleKo}`;

  const data = await CIA.loadPartData(part, "quiz");
  if (!data || !data.questions || data.questions.length === 0) {
    quizArea.innerHTML = `
      <div class="empty-state">
        <h2>아직 퀴즈가 없습니다</h2>
        <p>data/${escapeHTML(partId)}/quiz.json 에 문제를 추가하세요.</p>
        <p style="margin-top:16px"><a class="btn btn-primary" href="index.html">홈으로</a></p>
      </div>`;
    return;
  }

  questions = data.questions;
  if (mode === "wrong") {
    const wrongIds = new Set(CIA.Progress.loadQuizWrong(partId));
    const filtered = questions.filter((q) => wrongIds.has(q.id));
    if (filtered.length === 0) {
      quizArea.innerHTML = `
        <div class="empty-state">
          <h2>오답이 없습니다 🎉</h2>
          <p style="margin-top:16px"><a class="btn btn-primary" href="quiz.html?part=${partId}">전체 퀴즈로</a></p>
        </div>`;
      return;
    }
    questions = filtered;
  }

  order = shuffle(questions);
  renderQuestion();

  function renderQuestion() {
    if (idx >= order.length) {
      renderResult();
      return;
    }
    const q = order[idx];
    answeredThis = false;
    quizArea.innerHTML = `
      <div class="quiz-question">
        <div class="question-text">Q${idx + 1}. ${escapeHTML(q.question)}</div>
        <div class="options">
          ${q.options
            .map(
              (opt, i) =>
                `<button class="option" data-i="${i}"><span class="option-letter">${String.fromCharCode(65 + i)}.</span>${escapeHTML(stripLetter(opt))}</button>`
            )
            .join("")}
        </div>
        <div id="feedback"></div>
      </div>
    `;
    quizArea.querySelectorAll(".option").forEach((btn) => {
      btn.addEventListener("click", () => answer(parseInt(btn.dataset.i, 10), q));
    });
    progressInfo.textContent = `${idx + 1} / ${order.length} · 정답 ${correctCount}`;
  }

  function stripLetter(opt) {
    return opt.replace(/^[A-D]\.\s*/, "");
  }

  function answer(picked, q) {
    if (answeredThis) return;
    answeredThis = true;
    const correct = picked === q.answer;
    if (correct) correctCount++;
    CIA.Progress.recordQuiz(partId, q.id, correct);

    quizArea.querySelectorAll(".option").forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.answer) btn.classList.add("correct");
      else if (i === picked) btn.classList.add("wrong");
    });

    const feedback = document.getElementById("feedback");
    feedback.innerHTML = `
      <div class="feedback ${correct ? "correct" : "wrong"}">
        <div class="feedback-title">${correct ? "✓ 정답!" : "✗ 오답"}</div>
        <div>${escapeHTML(q.explanation || "")}</div>
      </div>
      <div class="action-bar-bottom">
        <button class="btn btn-primary btn-block" id="nextBtn">${idx + 1 === order.length ? "결과 보기" : "다음 문제 →"}</button>
      </div>
    `;
    document.getElementById("nextBtn").addEventListener("click", () => {
      idx++;
      renderQuestion();
    });
  }

  function renderResult() {
    const total = order.length;
    const pct = Math.round((correctCount / total) * 100);
    const wrongIds = CIA.Progress.loadQuizWrong(partId);
    quizArea.innerHTML = `
      <div class="quiz-result">
        <h2>퀴즈 완료!</h2>
        <div class="score-big">${correctCount} / ${total}</div>
        <p>정답률 ${pct}%</p>
        <p style="margin-top:8px;color:var(--text-muted);font-size:14px">누적 오답: ${wrongIds.length}문</p>
        <div class="footer-actions" style="margin-top:24px">
          <button class="btn btn-primary" id="retryBtn">다시 풀기</button>
          ${
            wrongIds.length > 0 && mode !== "wrong"
              ? `<a class="btn btn-danger" href="quiz.html?part=${partId}&mode=wrong">오답만 풀기</a>`
              : `<a class="btn" href="index.html">홈으로</a>`
          }
        </div>
      </div>
    `;
    document.getElementById("retryBtn").addEventListener("click", () => {
      idx = 0;
      correctCount = 0;
      order = shuffle(questions);
      renderQuestion();
    });
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
})();
