(function () {
  const doorsEl = document.getElementById("doors");
  const kindEl = document.getElementById("kind");
  const ask = document.getElementById("ask");
  const clockEl = document.getElementById("clock");
  const becauseEl = document.getElementById("because");
  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayBody = document.getElementById("overlay-body");
  const startBtn = document.getElementById("start");

  let mode = "title";
  let lives = 3;
  let score = 0;
  let deck = [];
  let question = null;
  let seconds = 8;
  let misses = [];
  let buttons = [];
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

  function buildDeck() {
    const made = [];
    TRADES.forEach((trade) => {
      trade.switches.forEach((sw) => {
        const target = TRADES.find((item) => item.id === sw.id);
        const wrong = shuffle(TRADES.filter((item) => item.id !== target.id && item.id !== trade.id)).slice(0, 2);
        made.push({
          hold: trade.name,
          when: sw.when,
          correct: target.name,
          wrong: wrong.map((item) => item.name),
          because: sw.when + ". Switch to the " + target.name.toLowerCase() + ".",
          study: target.id
        });
      });
    });
    return shuffle(made);
  }

  function paintHud() {
    scoreEl.textContent = String(score);
    const marks = [0, 1, 2].map((index) => (index < lives ? "●" : "○")).join("");
    livesEl.textContent = "Lives " + lives + " " + marks;
  }

  function showMisses() {
    const old = overlay.querySelector(".misses");
    if (old) old.remove();
    if (!misses.length) return;
    const list = document.createElement("ul");
    list.className = "misses";
    const seen = new Set();
    misses.forEach((item) => {
      const key = item.hold + "|" + item.correct;
      if (seen.has(key)) return;
      seen.add(key);
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = "index.html#" + item.study;
      link.textContent = item.correct;
      li.append(document.createTextNode(item.hold + ". "), link);
      list.append(li);
    });
    overlayBody.after(list);
  }

  function finishRound(ok) {
    mode = "resolve";
    becauseEl.textContent = (ok ? "Yes. " : "No. ") + question.because;
    buttons.forEach((button) => {
      button.disabled = true;
      if (button.dataset.name === question.correct) button.classList.add("hit-right");
      else if (!ok && button.dataset.picked === "true") button.classList.add("hit-wrong");
    });
    window.setTimeout(() => {
      if (lives <= 0) {
        mode = "over";
        overlay.hidden = false;
        overlayTitle.textContent = "Out of lives";
        overlayBody.textContent = "Score " + score + ". The doors you missed are below.";
        showMisses();
        startBtn.textContent = "Run it again";
        clockEl.textContent = "";
        return;
      }
      if (!deck.length) {
        mode = "over";
        overlay.hidden = false;
        overlayTitle.textContent = "Cleared";
        overlayBody.textContent = "Score " + score + ". You took every switch in the set.";
        showMisses();
        startBtn.textContent = "Run it again";
        clockEl.textContent = "";
        return;
      }
      spawn();
    }, 1400);
  }

  function spawn() {
    question = deck.shift();
    kindEl.textContent = "You hold " + question.hold;
    ask.textContent = question.when + ".";
    becauseEl.textContent = "";
    doorsEl.replaceChildren();
    buttons = shuffle([question.correct].concat(question.wrong)).map((name) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "door";
      button.dataset.name = name;
      button.textContent = name;
      button.addEventListener("click", () => pick(button));
      doorsEl.append(button);
      return button;
    });
    seconds = 8;
    clockEl.textContent = "8s";
    mode = "play";
  }

  function pick(button) {
    if (mode !== "play") return;
    button.dataset.picked = "true";
    const ok = button.dataset.name === question.correct;
    if (ok) score += 100;
    else {
      lives -= 1;
      misses.push(question);
    }
    paintHud();
    finishRound(ok);
  }

  function startGame() {
    const old = overlay.querySelector(".misses");
    if (old) old.remove();
    lives = 3;
    score = 0;
    misses = [];
    deck = buildDeck();
    paintHud();
    overlay.hidden = true;
    spawn();
  }

  function frame(now) {
    const dt = Math.min(0.034, (now - last) / 1000);
    last = now;
    if (mode === "play") {
      seconds -= dt;
      clockEl.textContent = Math.max(0, Math.ceil(seconds)) + "s";
      if (seconds <= 0) {
        lives -= 1;
        misses.push(question);
        paintHud();
        finishRound(false);
      }
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener("keydown", (event) => {
    const index = "123".indexOf(event.key);
    if (index !== -1 && buttons[index]) {
      event.preventDefault();
      pick(buttons[index]);
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
