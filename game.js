(function () {
  const field = document.getElementById("field");
  const turret = document.getElementById("turret");
  const ask = document.getElementById("ask");
  const kindEl = document.getElementById("kind");
  const becauseEl = document.getElementById("because");
  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayBody = document.getElementById("overlay-body");
  const startBtn = document.getElementById("start");
  const soundBtn = document.getElementById("sound");
  const fireBtn = document.getElementById("fire");

  const SITUATIONS = [
    { kind: "Where it is used", prompt: "You do not own the shares. You want a violent rally, and the gain left open.", correct: "Long call", wrong: ["Bull call spread", "Covered call"], because: "Long call. Outlook +2. A normal rise is the bull call spread.", study: "long-call" },
    { kind: "Where it is used", prompt: "You expect a hard drop, and you do not want to short the stock.", correct: "Long put", wrong: ["Bear put spread", "Cash-secured put"], because: "Long put. Outlook −2. An ordinary decline is the bear put spread.", study: "long-put" },
    { kind: "Where it is used", prompt: "You own 100 shares. Sideways or a small climb is fine, and you would sell them higher.", correct: "Covered call", wrong: ["Protective put", "Long call"], because: "Covered call. Credit. Outlook 0 to +1. The shares cover the call you sold.", study: "covered-call" },
    { kind: "Where it is used", prompt: "You will get paid to wait, and you are willing to buy shares lower. A collapse is the loss.", correct: "Cash-secured put", wrong: ["Covered call", "Long put"], because: "Cash-secured put. Same shape as the covered call. You do not own the shares yet.", study: "cash-secured-put" },
    { kind: "Where it is used", prompt: "You will keep the shares. The next move may explode up or down.", correct: "Protective put", wrong: ["Covered call", "Long straddle"], because: "Protective put. Long stock plus a long put. The straddle does not own the shares.", study: "protective-put" },
    { kind: "Where it is used", prompt: "You are bullish, a normal rise is enough, and you want less cash at risk than a long call.", correct: "Bull call spread", wrong: ["Long call", "Covered call"], because: "Bull call spread. Outlook +1. Buy a call, sell a higher strike.", study: "bull-call" },
    { kind: "Where it is used", prompt: "You want an ordinary decline, not a collapse, and less cash at risk than a long put.", correct: "Bear put spread", wrong: ["Long put", "Iron condor"], because: "Bear put spread. Outlook −1. Both the gain and the loss are capped.", study: "bear-put" },
    { kind: "Where it is used", prompt: "You are neutral. Volatility is high, and you expect earnings or the Fed to calm down.", correct: "Iron condor", wrong: ["Long straddle", "Calendar spread"], because: "Iron condor. Outlook 0. Two credits. You want the stock inside its usual range.", study: "iron-condor" },
    { kind: "Where it is used", prompt: "A large move is coming. You do not know the direction. You want it to pay near the current price.", correct: "Long straddle", wrong: ["Long strangle", "Iron condor"], because: "Long straddle. Buy the call and the put at the same strike.", study: "straddle" },
    { kind: "Where it is used", prompt: "Same explosion, direction unknown. You want less cash than a straddle, and you can stand a wider miss.", correct: "Long strangle", wrong: ["Long straddle", "Iron condor"], because: "Long strangle. Both options are out of the money. The stock has to travel farther.", study: "strangle" },
    { kind: "Where it is used", prompt: "You expect a slow, steady climb. Sell the near month, keep a later month.", correct: "Calendar spread", wrong: ["Long call", "Iron condor"], because: "Calendar spread. Outlook 0 to +1, on a smooth path. A spike is the long call.", study: "calendar" },
    { kind: "The best way", prompt: "You hold a long call. The rise you now expect is only ordinary. Switch to?", correct: "Bull call spread", wrong: ["Long straddle", "Long put"], because: "Switch to the bull call spread when a normal rise is enough.", study: "bull-call" },
    { kind: "The best way", prompt: "You hold a covered call. You now fear a collapse, and you will keep the shares. Switch to?", correct: "Protective put", wrong: ["Cash-secured put", "Iron condor"], because: "Switch to the protective put when the shares need insurance.", study: "protective-put" },
    { kind: "The best way", prompt: "You hold an iron condor. You now think the range will break, direction unknown. Switch to?", correct: "Long straddle", wrong: ["Calendar spread", "Covered call"], because: "Switch to the long straddle when you expect the range to break.", study: "straddle" },
    { kind: "What is on", prompt: "Covered call, buy-write, or overwrite. What is actually in the account?", correct: "Long stock, short call", wrong: ["Long stock, long put", "Short put, cash reserved"], because: "Shares, plus a call you sold. Buy-write opens both together. Overwrite sells the call against shares you already hold.", study: "covered-call" },
    { kind: "What is on", prompt: "Married put, or protective put. What is actually in the account?", correct: "Long stock, long put", wrong: ["Long stock, short call", "Long put only"], because: "Shares, plus a put you bought. Married means you opened them together. Protective means the shares were already yours.", study: "protective-put" },
    { kind: "What is on", prompt: "Cash-secured put. What is actually set aside?", correct: "Short put, cash reserved", wrong: ["Long put", "Long stock, short call"], because: "You sold a put, and the cash to buy the shares is reserved. A naked put is the same short put when people mean only margin is posted.", study: "cash-secured-put" },
    { kind: "What is on", prompt: "Bull call spread, also called a call debit spread. What is on?", correct: "Long call, short higher call", wrong: ["Long put, short lower put", "Long stock, short call"], because: "You bought a call and sold a higher strike. You paid a debit. A vertical: different strikes, same month.", study: "bull-call" },
    { kind: "What is on", prompt: "Calendar, time spread, or horizontal. What is on?", correct: "Long back month, short front", wrong: ["Long call, short higher call", "Short put spread, short call spread"], because: "You bought a later month and sold a nearer month. A diagonal also changes the strike. This one does not.", study: "calendar" },
    { kind: "What is on", prompt: "The lesson’s iron condor, the credit one. What is on?", correct: "Short put spread, short call spread", wrong: ["Long call and long put", "Long back month, short front"], because: "Two credit spreads. A long iron condor is the opposite: you pay, and you want a big move.", study: "iron-condor" }
  ];

  const TRAPS = [
    { kind: "Name", prompt: "One of these names is the opposite condor. Shoot the one that is not the credit condor.", correct: "Long iron condor", wrong: ["Short iron condor", "Selling an iron condor"], because: "Long iron condor means you paid. You want a large move. The lesson’s condor collects two credits.", study: "iron-condor" },
    { kind: "Name", prompt: "One of these is the other side of the straddle. Shoot the name that is not the lesson’s trade.", correct: "Short straddle", wrong: ["Long straddle", "Buying a straddle"], because: "A short straddle sells the call and the put. You want the stock to sit still. The lesson buys them.", study: "straddle" },
    { kind: "Name", prompt: "One of these is the other side of the strangle. Shoot the name that is not the lesson’s trade.", correct: "Short strangle", wrong: ["Long strangle", "Buying a strangle"], because: "A short strangle sells both options. An iron condor is that sale plus wings bought outside it.", study: "strangle" },
    { kind: "Name", prompt: "One of these changes the strike and the month. Shoot the name that is not a calendar.", correct: "Diagonal", wrong: ["Time spread", "Horizontal spread"], because: "A calendar keeps the strike and changes the month. A diagonal changes both.", study: "calendar" }
  ];

  let mode = "title";
  let lives = 3;
  let score = 0;
  let streak = 0;
  let speed = 70;
  let deck = [];
  let question = null;
  let chips = [];
  let bullet = null;
  let turretX = 160;
  let misses = [];
  let clock = 0;
  let holdLeft = false;
  let holdRight = false;
  let pointerId = null;
  let pointerStart = null;
  let audioCtx = null;
  let soundOn = false;
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

  function aliasQuestions() {
    const made = [];
    TRADES.forEach((trade) => {
      (trade.also || []).forEach((alias) => {
        if (alias.same === false) return;
        if (alias.name.toLowerCase() === trade.name.toLowerCase()) return;
        const wrong = shuffle(TRADES.filter((item) => item.id !== trade.id)).slice(0, 2).map((item) => item.name);
        made.push({
          kind: "Name",
          prompt: "A desk calls this “" + alias.name + "”. Which structure do they mean?",
          correct: trade.name,
          wrong: wrong,
          because: alias.name + " means " + trade.name + ". " + alias.note,
          study: trade.id
        });
      });
    });
    return made;
  }

  function buildDeck() {
    const where = shuffle(SITUATIONS);
    const names = shuffle(aliasQuestions().concat(TRAPS));
    const deckOut = [];
    let nameIndex = 0;
    where.forEach((item, index) => {
      deckOut.push(item);
      if (index % 2 === 1 && nameIndex < names.length) {
        deckOut.push(names[nameIndex]);
        nameIndex += 1;
      }
    });
    while (nameIndex < names.length) {
      deckOut.push(names[nameIndex]);
      nameIndex += 1;
    }
    return deckOut;
  }

  function tone(freq, dur) {
    if (!soundOn) return;
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = 0.03;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  }

  function paintHud() {
    scoreEl.textContent = String(score);
    const marks = [0, 1, 2].map((index) => (index < lives ? "●" : "○")).join("");
    livesEl.textContent = "Lives " + lives + " " + marks;
  }

  function clearChips() {
    chips.forEach((chip) => chip.el.remove());
    chips = [];
    if (bullet) {
      bullet.el.remove();
      bullet = null;
    }
  }

  function placeChip(chip) {
    const width = field.clientWidth;
    const chipWidth = chip.el.offsetWidth;
    const laneX = [8, (width - chipWidth) / 2, width - chipWidth - 8];
    let x = laneX[chip.lane];
    if (chipWidth > width * 0.72) x = Math.max(8, (width - chipWidth) / 2);
    x = Math.max(4, Math.min(x, width - chipWidth - 4));
    chip.x = x;
    chip.w = chipWidth;
    chip.h = chip.el.offsetHeight;
    chip.el.style.setProperty("--x", x + "px");
    chip.el.style.setProperty("--y", chip.y + "px");
  }

  function spawn() {
    clearChips();
    if (!deck.length) {
      deck = buildDeck();
      speed = Math.min(speed + 12, 150);
    }
    question = deck.shift();
    kindEl.textContent = question.kind;
    ask.textContent = question.prompt;
    becauseEl.textContent = "";
    const labels = shuffle([question.correct].concat(question.wrong));
    labels.forEach((label, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = label;
      field.append(button);
      const chip = {
        el: button,
        label: label,
        correct: label === question.correct,
        lane: index,
        y: -56 - index * 78,
        x: 0,
        w: 0,
        h: 44
      };
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        event.preventDefault();
        if (mode === "play") strike(chip, true);
      });
      chips.push(chip);
      placeChip(chip);
    });
    mode = "play";
  }

  function strike(chip, fromTap) {
    if (mode !== "play" || !chip) return;
    if (bullet && !fromTap) return;
    if (chip.correct) {
      chip.el.classList.add("hit-right");
      streak += 1;
      score += 100 + streak * 25;
      speed = Math.min(150, speed * 1.045);
      tone(560, 0.08);
      finish(true);
    } else {
      chip.el.classList.add("hit-wrong");
      lives -= 1;
      streak = 0;
      tone(120, 0.12);
      misses.push(question);
      finish(false);
    }
    paintHud();
  }

  function finish(ok) {
    mode = "resolve";
    becauseEl.textContent = (ok ? "Yes. " : "No. ") + question.because;
    if (bullet) {
      bullet.el.remove();
      bullet = null;
    }
    window.setTimeout(() => {
      if (lives <= 0) {
        gameOver();
        return;
      }
      spawn();
    }, 1400);
  }

  function gameOver() {
    mode = "over";
    clearChips();
    overlay.hidden = false;
    overlayTitle.textContent = "Out of lives";
    overlayBody.textContent = "Score " + score + ". The misses are below. Read the structure, then run it again.";
    const list = document.createElement("ul");
    list.className = "misses";
    const seen = new Set();
    misses.forEach((item) => {
      const key = item.prompt;
      if (seen.has(key)) return;
      seen.add(key);
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = "index.html#" + item.study;
      link.textContent = "Study";
      li.append(document.createTextNode(item.correct + ". "), link);
      list.append(li);
    });
    overlayBody.after(list);
    startBtn.textContent = "Run it again";
  }

  function startGame() {
    const old = overlay.querySelector(".misses");
    if (old) old.remove();
    lives = 3;
    score = 0;
    streak = 0;
    speed = 80;
    misses = [];
    deck = buildDeck();
    paintHud();
    overlay.hidden = true;
    turretX = field.clientWidth / 2;
    spawn();
  }

  function fire() {
    if (mode !== "play" || bullet) return;
    const el = document.createElement("div");
    el.className = "bullet";
    field.append(el);
    bullet = { el: el, x: turretX, y: field.clientHeight - 52 };
    tone(240, 0.05);
  }

  function update(dt) {
    if (mode !== "play") return;
    clock += dt;
    if (holdLeft) turretX -= 320 * dt;
    if (holdRight) turretX += 320 * dt;
    turretX = Math.max(24, Math.min(field.clientWidth - 24, turretX));
    const sway = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : Math.sin(clock * 0.9) * 8;
    const ground = field.clientHeight - 28;
    chips.forEach((chip) => {
      chip.y += speed * dt;
      chip.el.style.setProperty("--x", chip.x + sway + "px");
      chip.el.style.setProperty("--y", chip.y + "px");
    });
    const correct = chips.find((chip) => chip.correct);
    if (correct && correct.y + correct.h >= ground) {
      lives -= 1;
      streak = 0;
      misses.push(question);
      paintHud();
      tone(90, 0.16);
      finish(false);
      return;
    }
    chips.forEach((chip) => {
      if (!chip.correct && chip.y > ground) chip.el.remove();
    });
    chips = chips.filter((chip) => chip.correct || chip.y <= ground);
    if (!bullet) return;
    bullet.y -= 720 * dt;
    bullet.el.style.transform = "translate3d(" + bullet.x + "px, " + bullet.y + "px, 0)";
    if (bullet.y < -20) {
      bullet.el.remove();
      bullet = null;
      return;
    }
    const hit = chips
      .filter((chip) => bullet.x > chip.x + sway && bullet.x < chip.x + sway + chip.w && bullet.y < chip.y + chip.h && bullet.y + 16 > chip.y)
      .sort((a, b) => b.y - a.y)[0];
    if (hit) {
      bullet.el.remove();
      bullet = null;
      strike(hit, false);
    }
  }

  function frame(now) {
    const dt = Math.min(0.034, (now - last) / 1000);
    last = now;
    update(dt);
    turret.style.left = turretX + "px";
    requestAnimationFrame(frame);
  }

  function aimFrom(clientX) {
    const rect = field.getBoundingClientRect();
    turretX = Math.max(24, Math.min(field.clientWidth - 24, clientX - rect.left));
  }

  field.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".chip") || event.target.closest(".fire")) return;
    pointerId = event.pointerId;
    pointerStart = { x: event.clientX, y: event.clientY, t: performance.now() };
    aimFrom(event.clientX);
    field.setPointerCapture(event.pointerId);
  });
  field.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    aimFrom(event.clientX);
  });
  field.addEventListener("pointerup", (event) => {
    if (pointerId !== event.pointerId || !pointerStart) return;
    const dx = Math.abs(event.clientX - pointerStart.x);
    const dy = Math.abs(event.clientY - pointerStart.y);
    const quick = performance.now() - pointerStart.t < 280;
    pointerId = null;
    pointerStart = null;
    if (quick && dx < 12 && dy < 12) fire();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "a") {
      holdLeft = true;
      event.preventDefault();
    }
    if (event.key === "ArrowRight" || event.key === "d") {
      holdRight = true;
      event.preventDefault();
    }
    if (event.key === " " || event.key === "ArrowUp") {
      event.preventDefault();
      if (mode === "title" || mode === "over") startGame();
      else fire();
    }
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft" || event.key === "a") holdLeft = false;
    if (event.key === "ArrowRight" || event.key === "d") holdRight = false;
  });

  startBtn.addEventListener("click", startGame);
  fireBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    fire();
  });
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "Sound on" : "Sound off";
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    if (soundOn) tone(440, 0.06);
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

  window.addEventListener("resize", () => {
    chips.forEach(placeChip);
    turretX = Math.max(24, Math.min(field.clientWidth - 24, turretX));
  });

  document.fonts.ready.then(() => chips.forEach(placeChip));
  paintHud();
  turretX = Math.max(160, window.innerWidth / 2);
  requestAnimationFrame(frame);
})();
