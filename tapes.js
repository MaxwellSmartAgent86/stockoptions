(function () {
  const field = document.getElementById("field");
  const falling = document.getElementById("falling");
  const ask = document.getElementById("ask");
  const becauseEl = document.getElementById("because");
  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayBody = document.getElementById("overlay-body");
  const startBtn = document.getElementById("start");
  const tapes = Array.from(document.querySelectorAll(".tape"));

  const WORD = {
    "-2": "−2, a hard drop outside the usual range",
    "-1": "−1, an ordinary drop inside the range",
    "0": "0, sideways",
    "+1": "+1, an ordinary rise inside the range",
    "+2": "+2, a hard rise outside the range"
  };

  const JOB = {
    "long-call": "No shares. The gain stays open.",
    "long-put": "No shares. The gain stays open as price falls.",
    "covered-call": "You own the shares and sold a call.",
    "cash-secured-put": "You do not own the shares yet. Cash is reserved.",
    "protective-put": "You own the shares and bought a put. A straddle does not own the shares.",
    "bull-call": "Less cash than the long call. The gain caps at the short strike.",
    "bear-put": "Less cash than the long put. Both ends are capped.",
    "iron-condor": "Two credits. You want a nervous market to calm down.",
    "straddle": "Call and put at the same strike. You want the range to break.",
    "strangle": "Both options are out of the money. The stock has to travel farther.",
    "calendar": "Later month bought, nearer month sold, same strike. A steady path."
  };

  let mode = "title";
  let lives = 3;
  let score = 0;
  let speed = 46;
  let deck = [];
  let trade = null;
  let y = 0;
  let misses = [];
  let last = performance.now();

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = copy[i];
      copy[i] = copy[j];
      copy[j] = swap;
    }
    return copy;
  }

  function explain(item) {
    const marks = item.outlook.map((mark) => WORD[mark]).join(" and ");
    return item.name + " fits " + marks + ". " + JOB[item.id];
  }

  function paintHud() {
    scoreEl.textContent = String(score);
    const marks = [0, 1, 2].map((index) => (index < lives ? "●" : "○")).join("");
    livesEl.textContent = "Lives " + lives + " " + marks;
  }

  function clearTapes() {
    tapes.forEach((tape) => tape.classList.remove("hit-right", "hit-wrong"));
  }

  function showMisses() {
    const old = overlay.querySelector(".misses");
    if (old) old.remove();
    if (!misses.length) return;
    const list = document.createElement("ul");
    list.className = "misses";
    const seen = new Set();
    misses.forEach((item) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = "index.html#" + item.id;
      link.textContent = item.name;
      li.append(link);
      list.append(li);
    });
    overlayBody.after(list);
  }

  function finishRound(ok) {
    mode = "resolve";
    becauseEl.textContent = (ok ? "Yes. " : "No. ") + explain(trade);
    window.setTimeout(() => {
      clearTapes();
      if (lives <= 0) {
        mode = "over";
        overlay.hidden = false;
        overlayTitle.textContent = "Out of lives";
        overlayBody.textContent = "Score " + score + ". The misses are on the study page.";
        showMisses();
        startBtn.textContent = "Run it again";
        return;
      }
      spawn();
    }, 1400);
  }

  function spawn() {
    if (!deck.length) {
      deck = shuffle(TRADES);
      speed = Math.min(speed + 8, 110);
    }
    trade = deck.shift();
    falling.textContent = trade.name;
    falling.classList.remove("hit-right", "hit-wrong");
    y = 8;
    falling.style.transform = "translate3d(-50%, " + y + "px, 0)";
    ask.textContent = "Tap a tape this trade fits.";
    becauseEl.textContent = "";
    clearTapes();
    mode = "play";
  }

  function answer(mark, tape) {
    if (mode !== "play" || !trade) return;
    const ok = trade.outlook.indexOf(mark) !== -1;
    if (ok) {
      tape.classList.add("hit-right");
      falling.classList.add("hit-right");
      score += 100;
      speed = Math.min(speed * 1.04, 110);
      paintHud();
      finishRound(true);
      return;
    }
    tape.classList.add("hit-wrong");
    falling.classList.add("hit-wrong");
    lives -= 1;
    misses.push(trade);
    paintHud();
    finishRound(false);
  }

  function groundMiss() {
    if (mode !== "play" || !trade) return;
    falling.classList.add("hit-wrong");
    lives -= 1;
    misses.push(trade);
    paintHud();
    finishRound(false);
  }

  function startGame() {
    const old = overlay.querySelector(".misses");
    if (old) old.remove();
    lives = 3;
    score = 0;
    speed = 46;
    misses = [];
    deck = shuffle(TRADES);
    paintHud();
    overlay.hidden = true;
    spawn();
  }

  function frame(now) {
    const dt = Math.min(0.034, (now - last) / 1000);
    last = now;
    if (mode === "play") {
      y += speed * dt;
      const ground = field.clientHeight - 28 - falling.offsetHeight;
      falling.style.transform = "translate3d(-50%, " + y + "px, 0)";
      if (y >= ground) groundMiss();
    }
    requestAnimationFrame(frame);
  }

  tapes.forEach((tape) => {
    tape.addEventListener("click", () => answer(tape.dataset.mark, tape));
  });

  document.addEventListener("keydown", (event) => {
    const index = "12345".indexOf(event.key);
    if (index !== -1) {
      event.preventDefault();
      answer(tapes[index].dataset.mark, tapes[index]);
      return;
    }
    if (event.key === " " && (mode === "title" || mode === "over")) {
      event.preventDefault();
      startGame();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && mode === "play") {
      mode = "pause";
      becauseEl.textContent = "Paused.";
    } else if (!document.hidden && mode === "pause") {
      becauseEl.textContent = "";
      mode = "play";
      last = performance.now();
    }
  });

  startBtn.addEventListener("click", startGame);
  paintHud();
  requestAnimationFrame(frame);
})();
