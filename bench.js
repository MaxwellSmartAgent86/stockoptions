(function () {
  const partsEl = document.getElementById("parts");
  const ask = document.getElementById("ask");
  const clockEl = document.getElementById("clock");
  const becauseEl = document.getElementById("because");
  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const stampBtn = document.getElementById("stamp");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayBody = document.getElementById("overlay-body");
  const startBtn = document.getElementById("start");
  const continueBtn = document.getElementById("continue");

  const ORDERS = [
    { id: "long-call", name: "Long call", parts: ["Long call"], note: "One long call. No shares." },
    { id: "long-put", name: "Long put", parts: ["Long put"], note: "One long put. No shares." },
    { id: "covered-call", name: "Covered call", parts: ["Long stock", "Short call"], note: "Buy-write and overwrite are this same pair: long stock, short call." },
    { id: "cash-secured-put", name: "Cash-secured put", parts: ["Short put", "Cash reserved"], note: "A naked put is this short put when a desk means only margin is posted, not the full cash." },
    { id: "protective-put", name: "Protective put", parts: ["Long stock", "Long put"], note: "A married put is the same pair, opened together." },
    { id: "bull-call", name: "Bull call spread", parts: ["Long call", "Short higher call"], note: "A call debit spread. Same month. The call you sell is the higher strike." },
    { id: "bear-put", name: "Bear put spread", parts: ["Long put", "Short lower put"], note: "A put debit spread. Same month. The put you sell is the lower strike." },
    { id: "iron-condor", name: "Iron condor", parts: ["Short put spread", "Short call spread"], note: "The credit condor. A long iron condor is the opposite: you pay, and you want a large move." },
    { id: "straddle", name: "Long straddle", parts: ["Long call at the price", "Long put at the price"], note: "Same strike, on the stock price." },
    { id: "strangle", name: "Long strangle", parts: ["Long call away from the price", "Long put away from the price"], note: "Both out of the money. The strikes are apart." },
    { id: "calendar", name: "Calendar spread", parts: ["Long later month", "Short nearer month"], note: "Same strike. A diagonal would also change the strike." }
  ];

  const POOL = [];
  ORDERS.forEach((order) => {
    order.parts.forEach((part) => {
      if (POOL.indexOf(part) === -1) POOL.push(part);
    });
  });

  let mode = "title";
  let lives = 3;
  let score = 0;
  let deck = [];
  let order = null;
  let seconds = 16;
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

  function paintHud() {
    scoreEl.textContent = String(score);
    const marks = [0, 1, 2].map((index) => (index < lives ? "●" : "○")).join("");
    livesEl.textContent = "Lives " + lives + " " + marks;
  }

  function selected() {
    return buttons.filter((button) => button.getAttribute("aria-pressed") === "true").map((button) => button.dataset.part);
  }

  function sameSet(left, right) {
    if (left.length !== right.length) return false;
    const pending = right.slice();
    return left.every((part) => {
      const index = pending.indexOf(part);
      if (index === -1) return false;
      pending.splice(index, 1);
      return true;
    });
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

  function reveal() {
    buttons.forEach((button) => {
      const belongs = order.parts.indexOf(button.dataset.part) !== -1;
      const on = button.getAttribute("aria-pressed") === "true";
      if (belongs) button.classList.add("hit-right");
      else if (on) button.classList.add("hit-wrong");
      button.disabled = true;
    });
  }

  function finishRound(ok, timedOut) {
    mode = "resolve";
    reveal();
    const listed = order.parts.join(" and ");
    if (ok) becauseEl.textContent = "Right. " + order.note;
    else if (timedOut) becauseEl.textContent = "Time ran out. The parts are " + listed + ". " + order.note;
    else becauseEl.textContent = "Wrong. The parts are " + listed + ". " + order.note;
    continueBtn.hidden = false;
    continueBtn.focus();
  }

  function continueRound() {
    if (mode !== "resolve") return;
    continueBtn.hidden = true;
    becauseEl.textContent = "";
    clockEl.textContent = "";
    if (lives <= 0) {
      mode = "over";
      overlay.hidden = false;
      overlayTitle.textContent = "Out of lives";
      overlayBody.textContent = "Score " + score + ". The misses are on the study page.";
      showMisses();
      startBtn.textContent = "Run it again";
      return;
    }
    if (!deck.length) {
      mode = "over";
      overlay.hidden = false;
      overlayTitle.textContent = "Cleared";
      overlayBody.textContent = "Score " + score + ". You stamped the set.";
      showMisses();
      startBtn.textContent = "Run it again";
      return;
    }
    spawn();
  }

  function spawn() {
    order = deck.shift();
    const distractors = shuffle(POOL.filter((part) => order.parts.indexOf(part) === -1));
    const shown = shuffle(order.parts.concat(distractors.slice(0, 6 - order.parts.length)));
    partsEl.replaceChildren();
    buttons = shown.map((part) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "part";
      button.dataset.part = part;
      button.textContent = part;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        if (mode !== "play") return;
        const on = button.getAttribute("aria-pressed") === "true";
        button.setAttribute("aria-pressed", on ? "false" : "true");
      });
      partsEl.append(button);
      return button;
    });
    ask.textContent = order.name;
    becauseEl.textContent = "";
    seconds = 16;
    clockEl.textContent = "16s";
    mode = "play";
  }

  function stamp() {
    if (mode !== "play" || !order) return;
    const ok = sameSet(selected(), order.parts);
    if (ok) {
      score += 100;
      paintHud();
      finishRound(true, false);
      return;
    }
    lives -= 1;
    misses.push(order);
    paintHud();
    finishRound(false, false);
  }

  function startGame() {
    const old = overlay.querySelector(".misses");
    if (old) old.remove();
    lives = 3;
    score = 0;
    misses = [];
    deck = shuffle(ORDERS);
    paintHud();
    overlay.hidden = true;
    continueBtn.hidden = true;
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
        misses.push(order);
        paintHud();
        finishRound(false, true);
      }
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener("keydown", (event) => {
    const index = "123456".indexOf(event.key);
    if (index !== -1 && buttons[index] && mode === "play") {
      event.preventDefault();
      buttons[index].click();
      return;
    }
    if (event.key === "Enter" || (event.key === " " && mode === "resolve")) {
      event.preventDefault();
      if (mode === "resolve") continueRound();
      else if (mode === "title" || mode === "over") startGame();
      else stamp();
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

  stampBtn.addEventListener("click", stamp);
  startBtn.addEventListener("click", startGame);
  continueBtn.addEventListener("click", continueRound);
  paintHud();
  requestAnimationFrame(frame);
})();
