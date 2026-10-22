(function () {
  const board = document.getElementById("board");
  const flipsEl = document.getElementById("flips");
  const matchedEl = document.getElementById("matched");
  const becauseEl = document.getElementById("because");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayBody = document.getElementById("overlay-body");
  const startBtn = document.getElementById("start");

  let pool = [];
  let flips = 0;
  let matched = 0;
  let goal = 0;
  let open = [];
  let lock = false;
  let started = false;

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

  function allPairs() {
    const made = [];
    TRADES.forEach((trade) => {
      (trade.also || []).forEach((alias) => {
        if (alias.same === false) return;
        if (alias.name.toLowerCase() === trade.name.toLowerCase()) return;
        made.push({
          tradeId: trade.id,
          trade: trade.name,
          alias: alias.name,
          note: alias.note
        });
      });
    });
    return made;
  }

  function paint() {
    flipsEl.textContent = String(flips);
    matchedEl.textContent = "Matched " + matched + " / " + goal;
  }

  function face(button, up) {
    button.classList.toggle("open", up);
    button.textContent = up ? button.dataset.label : "Face down";
    button.setAttribute("aria-pressed", up ? "true" : "false");
  }

  function deal() {
    if (!pool.length) {
      cleared();
      return;
    }
    board.replaceChildren();
    open = [];
    lock = false;
    const hand = pool.splice(0, Math.min(4, pool.length));
    const cards = [];
    hand.forEach((pair) => {
      cards.push({
        role: "alias",
        tradeId: pair.tradeId,
        label: pair.alias,
        note: pair.note
      });
      cards.push({
        role: "trade",
        tradeId: pair.tradeId,
        label: pair.trade,
        note: pair.note
      });
    });
    shuffle(cards).forEach((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pair";
      button.dataset.role = card.role;
      button.dataset.trade = card.tradeId;
      button.dataset.label = card.label;
      button.dataset.note = card.note;
      button.textContent = "Face down";
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => turn(button));
      board.append(button);
    });
  }

  function sameTrade(a, b) {
    return a.dataset.role !== b.dataset.role && a.dataset.trade === b.dataset.trade;
  }

  function turn(button) {
    if (!started || lock || button.classList.contains("open") || button.classList.contains("matched")) return;
    face(button, true);
    flips += 1;
    paint();
    open.push(button);
    if (open.length < 2) return;
    const first = open[0];
    const second = open[1];
    open = [];
    lock = true;
    if (sameTrade(first, second)) {
      const alias = first.dataset.role === "alias" ? first : second;
      first.classList.add("matched");
      second.classList.add("matched");
      first.disabled = true;
      second.disabled = true;
      matched += 1;
      becauseEl.textContent = alias.dataset.note;
      lock = false;
      paint();
      if (!board.querySelector(".pair:not(.matched)")) {
        window.setTimeout(deal, 700);
      }
      return;
    }
    becauseEl.textContent = "Not a pair. Match a name to the structure it means.";
    window.setTimeout(() => {
      face(first, false);
      face(second, false);
      becauseEl.textContent = "";
      lock = false;
    }, 800);
  }

  function cleared() {
    started = false;
    overlay.hidden = false;
    overlayTitle.textContent = "Cleared";
    overlayBody.textContent = "Matched " + matched + " names in " + flips + " flips. The study page keeps the longer note on each trade.";
    startBtn.textContent = "Deal again";
  }

  function start() {
    const pairs = allPairs();
    goal = pairs.length;
    pool = shuffle(pairs);
    flips = 0;
    matched = 0;
    started = true;
    becauseEl.textContent = "";
    paint();
    overlay.hidden = true;
    deal();
  }

  startBtn.addEventListener("click", start);
  paint();
})();
