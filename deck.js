(function () {
  const sheet = document.getElementById("sheet");
  const progress = document.getElementById("progress");
  const scenarioEl = document.getElementById("scenario");
  const choicesEl = document.getElementById("choices");
  const becauseEl = document.getElementById("because");
  const fit = document.getElementById("fit");
  const fitChart = document.getElementById("fit-chart");
  const fitCap = document.getElementById("fit-cap");
  const follow = document.getElementById("follow");
  const studyLink = document.getElementById("study");
  const nextBtn = document.getElementById("next");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayBody = document.getElementById("overlay-body");
  const startBtn = document.getElementById("start");

  const SCENARIOS = [
    {
      prompt: "Wynn Resorts sits near $100. The usual range, one standard deviation, is about $91 to $111. You do not own the shares. You expect a run toward $113 to $115, outside that band, and you want the gain left open if it keeps going.",
      correct: "Long call",
      choices: ["Long call", "Bull call spread", "Covered call", "Long straddle"],
      because: "Long call. Outlook +2, no shares, gain uncapped. A rise that stays inside the band is the bull call spread. A covered call needs shares you would sell."
    },
    {
      prompt: "You are bullish, and a rise inside the usual range is enough. You want less cash at risk than buying the call outright. You can live with the gain stopping at a higher strike.",
      correct: "Bull call spread",
      choices: ["Bull call spread", "Long call", "Cash-secured put", "Calendar spread"],
      because: "Bull call spread. Outlook +1. Buy a call, sell a higher strike, same month. In the lesson’s arithmetic that debit is about 40% of the naked call, and the gain caps."
    },
    {
      prompt: "You own 100 shares of Coca-Cola at $70. A quiet month, or a climb only as far as $75, is a fine outcome. You would sell the shares at 75.",
      correct: "Covered call",
      choices: ["Covered call", "Protective put", "Cash-secured put", "Bull call spread"],
      because: "Covered call. Credit, outlook 0 to +1. The shares cover the call you sold. The lesson’s example is the 75 call sold for $2."
    },
    {
      prompt: "You do not own the shares. The stock is at $62, and the usual range runs about $56 to $68. You want to be paid while you wait, and you are willing to buy shares if price comes to the 55 put. A collapse through that strike is the loss you accept.",
      correct: "Cash-secured put",
      choices: ["Cash-secured put", "Covered call", "Long put", "Bear put spread"],
      because: "Cash-secured put. Same shape as the covered call, and you do not own the shares yet. The 55 put sits outside the band. The cash to buy is reserved."
    },
    {
      prompt: "You already own Coca-Cola at $70, and you will keep the shares. You think the next move can explode up or down. You want the downside cut off and the upside of the shares left open.",
      correct: "Protective put",
      choices: ["Protective put", "Long straddle", "Covered call", "Long put"],
      because: "Protective put. Long stock plus a long put. A long straddle wants the same explosion and does not own the shares. A covered call sells the upside away."
    },
    {
      prompt: "The stock is at $150. The usual range is about $135 to $165. You expect a decline that stays inside that band. You want less cash at risk than a long put, and you accept that both the gain and the loss are capped.",
      correct: "Bear put spread",
      choices: ["Bear put spread", "Long put", "Iron condor", "Cash-secured put"],
      because: "Bear put spread. Outlook −1. Buy a higher-strike put, sell the 135. The long strike in the lesson is unnamed. Both ends of the payoff are capped."
    },
    {
      prompt: "You expect a drop that leaves the usual range. You do not want to borrow the shares. You want the most you can lose to be the premium, and you want the gain to keep extending as the stock falls.",
      correct: "Long put",
      choices: ["Long put", "Bear put spread", "Protective put", "Iron condor"],
      because: "Long put. Outlook −2, no shares. An ordinary decline inside the range is the bear put spread. A protective put is for shares you already own and will keep."
    },
    {
      prompt: "You are neutral. Volatility is high into earnings, or a Fed meeting, and you expect that fear to calm down. You want to be paid if the stock finishes inside its usual range, and you want the loss defined on both sides.",
      correct: "Iron condor",
      choices: ["Iron condor", "Long straddle", "Calendar spread", "Covered call"],
      because: "Iron condor. Outlook 0. A put credit spread and a call credit spread. The lesson’s condor collects two credits. Buying an iron condor is the opposite trade: you pay, and you want a large move."
    },
    {
      prompt: "The stock is at $85. The tape has been calm, and you think a move is about to break the usual range. You do not know the direction. You want the trade to start paying near the current price.",
      correct: "Long straddle",
      choices: ["Long straddle", "Long strangle", "Iron condor", "Protective put"],
      because: "Long straddle. Buy the 85 call and the 85 put. A strangle is the same idea bought away from the price, so the stock has to travel farther. An iron condor wants the range to hold."
    },
    {
      prompt: "eBay is at $90. You expect an explosion and you still cannot call the direction. You want less cash in the trade than buying both options at the money, and you can stand the stock needing to travel through $95 or through $85.",
      correct: "Long strangle",
      choices: ["Long strangle", "Long straddle", "Iron condor", "Bear put spread"],
      because: "Long strangle. Buy the 95 call and the 85 put. The loss is a flat band between the strikes. The lesson does not price the two premiums."
    },
    {
      prompt: "You expect a slow, steady climb, not a spike. You want a November call, and you want to sell August against it, then September, then October, at the same strike. A diagonal was suggested. You do not want the later month at a different strike.",
      correct: "Calendar spread",
      choices: ["Calendar spread", "Long call", "Iron condor", "Bull call spread"],
      because: "Calendar spread. Same strike, different months. A diagonal changes the strike and the month. A sharp rally is the long call. A bull call spread changes the strike and keeps the month."
    },
    {
      prompt: "You hold a covered call on shares you intend to keep. You now fear a collapse.",
      correct: "Protective put",
      choices: ["Protective put", "Long put", "Cash-secured put", "Iron condor"],
      because: "Switch to the protective put. The shares stay, and the put cuts off the downside. A long put would drop the shares. A cash-secured put is for stock you do not own yet."
    },
    {
      prompt: "You hold a long call. The rise you now expect is only an ordinary one, inside the usual range. You no longer need the gain left open.",
      correct: "Bull call spread",
      choices: ["Bull call spread", "Covered call", "Long straddle", "Calendar spread"],
      because: "Switch to the bull call spread. A normal rise is enough, and selling the higher strike pays for part of the call. A covered call needs shares you already own."
    },
    {
      prompt: "You hold an iron condor. You now think the range will break. You cannot call the direction, and you want the payoff to start near the current price.",
      correct: "Long straddle",
      choices: ["Long straddle", "Long strangle", "Calendar spread", "Covered call"],
      because: "Switch to the long straddle. The condor’s job was a range that holds. A strangle is the same direction-unknown bet with strikes set farther out. A calendar still wants a steady path near one strike."
    },
    {
      prompt: "You hold a protective put. You no longer want the insurance. You would rather be paid, and you would sell the shares at a higher price.",
      correct: "Covered call",
      choices: ["Covered call", "Cash-secured put", "Long call", "Bull call spread"],
      because: "Switch to the covered call. You still own the shares, and you sell a call above the market. The protective put was the insurance. You are done with it."
    },
    {
      prompt: "You do not own the shares, and you are not willing to be assigned. You need a violent rally, and you want the gain left open. A friend tells you to sell a put and get paid to wait.",
      correct: "Long call",
      choices: ["Long call", "Cash-secured put", "Bull call spread", "Covered call"],
      because: "Long call. A cash-secured put pays you and can force you to buy shares. That is the assignment you refused. A bull call spread fits an ordinary rise, and the gain is capped."
    },
    {
      prompt: "You own the shares. A sideways tape would be a win. You do not fear a collapse this month. The idea on the table is to buy a put so the shares are insured.",
      correct: "Covered call",
      choices: ["Covered call", "Protective put", "Long straddle", "Calendar spread"],
      because: "Covered call. Insurance is the protective put, and you do not need it. You would rather be paid for a quiet tape, with the shares covering the call."
    },
    {
      prompt: "You expect the stock to sit near one strike. You want to sell the near month, and sell the next month after that, against a later month you keep. You are not trying to be paid because fear on both wings is about to collapse.",
      correct: "Calendar spread",
      choices: ["Calendar spread", "Iron condor", "Long straddle", "Covered call"],
      because: "Calendar spread. One strike, two months, and the front month can be sold again. An iron condor is the both-wings credit, used when high volatility is expected to calm down."
    },
    {
      prompt: "You were assigned on a cash-secured put, so the shares are yours now. You still expect sideways movement or a small climb, and you want to be paid for that.",
      correct: "Covered call",
      choices: ["Covered call", "Cash-secured put", "Protective put", "Bull call spread"],
      because: "Covered call. It is the same shape as the cash-secured put once you own the shares. You sell a call against them. Another short put would be a second promise to buy. The wheel is that second sale only if you plan to keep cycling after the shares are called away."
    },
    {
      prompt: "You do not own the shares. You are willing to buy them if the put assigns, and once you own them you will sell calls until they are called away, then sell the put again. Sideways, or a mild rise, is enough. You do not need a violent rally.",
      correct: "The wheel",
      choices: ["The wheel", "Cash-secured put", "Covered call", "Long call"],
      because: "The wheel. Phase one is the cash-secured put. After assignment, phase two is the covered call. A cash-secured put alone stops when you own the shares. A covered call assumes you already own them. A long call leaves the upside open and does not take assignment."
    },
    {
      prompt: "You have been running the wheel. You now need the upside left open, and you are no longer willing to have the shares called away.",
      correct: "Long call",
      choices: ["Long call", "The wheel", "Covered call", "Protective put"],
      because: "Long call. The wheel’s call phase sells the move above the strike. A covered call does the same sale against shares you keep. A protective put keeps the shares and insures them. You asked for the gain left open."
    },
    {
      prompt: "You expect an explosion and you do not know the direction. You already own the shares, you will keep them, and you want their upside left open while the downside is insured.",
      correct: "Protective put",
      choices: ["Protective put", "Long straddle", "Long strangle", "Covered call"],
      because: "Protective put. The shares are the long side. The put is the insurance. A straddle or a strangle does not include the shares. A covered call would sell the upside you want to keep."
    },
    {
      prompt: "You want to be paid if the stock sits inside its usual range. Selling the call and the put with nothing outside them would leave the loss open. You want wings that make the loss finite.",
      correct: "Iron condor",
      choices: ["Iron condor", "Long strangle", "Long straddle", "Calendar spread"],
      because: "Iron condor. A short strangle is the two short options. The long wings outside them are what cap the loss. That package is the credit condor the lesson teaches."
    }
  ];

  const byName = {};
  TRADES.forEach((trade) => {
    byName[trade.name] = trade.id;
  });
  SCENARIOS.forEach((item, index) => {
    if (!byName[item.correct]) throw new Error("Unknown correct answer at " + index);
    if (item.choices.indexOf(item.correct) === -1) throw new Error("Correct missing at " + index);
    item.choices.forEach((name) => {
      if (!byName[name]) throw new Error("Unknown choice " + name);
    });
  });

  let deck = [];
  let index = 0;
  let picked = 0;
  let correctCount = 0;
  let misses = [];
  let locked = false;

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

  const SHAPES = {
    "long-call": [[0.04, -0.42], [0.46, -0.42], [0.94, 0.74]],
    "long-put": [[0.06, 0.74], [0.54, -0.42], [0.96, -0.42]],
    "covered-call": [[0.04, -0.78], [0.5, 0.36], [0.96, 0.36]],
    "cash-secured-put": [[0.04, -0.78], [0.5, 0.36], [0.96, 0.36]],
    "wheel": [[0.04, -0.78], [0.5, 0.36], [0.96, 0.36]],
    "protective-put": [[0.04, -0.38], [0.44, -0.38], [0.96, 0.74]],
    "bull-call": [[0.04, -0.46], [0.34, -0.46], [0.64, 0.4], [0.96, 0.4]],
    "bear-put": [[0.04, 0.4], [0.36, 0.4], [0.66, -0.46], [0.96, -0.46]],
    "iron-condor": [[0.04, -0.4], [0.18, -0.4], [0.34, 0.4], [0.66, 0.4], [0.82, -0.4], [0.96, -0.4]],
    "straddle": [[0.08, 0.74], [0.5, -0.58], [0.92, 0.74]],
    "strangle": [[0.06, 0.7], [0.28, -0.42], [0.72, -0.42], [0.94, 0.7]],
    "calendar": [[0.08, -0.36], [0.26, -0.06], [0.38, 0.28], [0.5, 0.58], [0.62, 0.28], [0.74, -0.06], [0.92, -0.36]]
  };

  function buttons() {
    return Array.from(choicesEl.querySelectorAll(".choice"));
  }

  function svgNode(name, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs).forEach((key) => node.setAttribute(key, attrs[key]));
    return node;
  }

  function arrow(svg, x, y, dx, dy) {
    const len = 8;
    const wing = 3.6;
    const points = [
      [x, y],
      [x - dx * len + -dy * wing, y - dy * len + dx * wing],
      [x - dx * len - -dy * wing, y - dy * len - dx * wing]
    ].map((pair) => pair[0].toFixed(1) + "," + pair[1].toFixed(1)).join(" ");
    svg.append(svgNode("polygon", { points: points, fill: "var(--color-ink)" }));
  }

  function drawFit(id) {
    const points = SHAPES[id];
    fitChart.replaceChildren();
    if (!points) {
      fit.hidden = true;
      return;
    }
    const left = 52;
    const right = 184;
    const top = 36;
    const bottom = 180;
    const zero = (top + bottom) / 2;
    const span = (bottom - top) / 2;
    const svg = svgNode("svg", {
      viewBox: "0 0 220 220",
      class: "fit-svg",
      role: "img",
      "aria-labelledby": "fit-title"
    });
    const title = svgNode("title", { id: "fit-title" });
    const trade = TRADES.find((item) => item.id === id);
    title.textContent = (trade ? trade.name : "Trade") + " payoff";
    svg.append(title);
    const defs = svgNode("defs", {});
    const clip = svgNode("clipPath", { id: "fit-clip" });
    clip.append(svgNode("circle", { cx: "110", cy: "108", r: "84" }));
    defs.append(clip);
    svg.append(defs);

    function X(t) { return left + t * (right - left); }
    function Y(value) { return zero - value * span * 0.92; }
    const mapped = points.map((pair) => ({ x: X(pair[0]), y: Y(pair[1]), v: pair[1] }));
    const plot = svgNode("g", { "clip-path": "url(#fit-clip)" });

    function poly(pts, fill) {
      const d = pts.map((point, index) => (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1)).join(" ") + " Z";
      plot.append(svgNode("path", { d: d, fill: fill }));
    }

    for (let i = 0; i < mapped.length - 1; i += 1) {
      const a = mapped[i];
      const b = mapped[i + 1];
      const sameSide = (a.v >= 0 && b.v >= 0) || (a.v <= 0 && b.v <= 0);
      if (sameSide) {
        const sign = a.v > 0 || b.v > 0 ? 1 : -1;
        if (a.v === 0 && b.v === 0) continue;
        poly(
          [a, b, { x: b.x, y: zero }, { x: a.x, y: zero }],
          sign > 0 ? "var(--color-gain-wash)" : "var(--color-loss-wash)"
        );
      } else {
        const t = (0 - a.v) / (b.v - a.v);
        const mid = { x: a.x + t * (b.x - a.x), y: zero, v: 0 };
        poly([a, mid, { x: a.x, y: zero }], a.v > 0 ? "var(--color-gain-wash)" : "var(--color-loss-wash)");
        poly([mid, b, { x: b.x, y: zero }], b.v > 0 ? "var(--color-gain-wash)" : "var(--color-loss-wash)");
      }
    }

    plot.append(svgNode("path", {
      d: mapped.map((point, index) => (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1)).join(" "),
      fill: "none",
      stroke: "var(--color-ink)",
      "stroke-width": "2.5",
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    }));
    svg.append(plot);
    svg.append(svgNode("circle", {
      cx: "110",
      cy: "108",
      r: "86",
      fill: "none",
      stroke: "var(--color-ink)",
      "stroke-width": "3"
    }));
    const axisX = left + 4;
    svg.append(svgNode("line", {
      x1: String(axisX),
      y1: String(top + 10),
      x2: String(axisX),
      y2: String(bottom - 8),
      stroke: "var(--color-ink)",
      "stroke-width": "1.6"
    }));
    arrow(svg, axisX, top + 2, 0, -1);
    arrow(svg, axisX, bottom, 0, 1);
    svg.append(svgNode("line", {
      x1: String(left),
      y1: String(zero),
      x2: String(right - 10),
      y2: String(zero),
      stroke: "var(--color-ink)",
      "stroke-width": "1.6",
      "stroke-dasharray": "2 3"
    }));
    arrow(svg, right, zero, 1, 0);
    fitChart.append(svg);
    fitCap.textContent = trade ? trade.name : "";
    fit.hidden = false;
  }

  function show() {
    const item = deck[index];
    locked = false;
    progress.textContent = (index + 1) + " of " + deck.length;
    scenarioEl.textContent = item.prompt;
    becauseEl.textContent = "";
    fit.hidden = true;
    fitChart.replaceChildren();
    follow.hidden = true;
    choicesEl.replaceChildren();
    shuffle(item.choices).forEach((name) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.dataset.name = name;
      button.textContent = name;
      button.addEventListener("click", () => choose(button));
      choicesEl.append(button);
    });
  }

  function choose(button) {
    if (locked) return;
    locked = true;
    const item = deck[index];
    const ok = button.dataset.name === item.correct;
    picked += 1;
    if (ok) correctCount += 1;
    else misses.push(item);
    buttons().forEach((choice) => {
      choice.disabled = true;
      if (choice.dataset.name === item.correct) choice.classList.add("right");
      else if (choice === button) choice.classList.add("wrong");
    });
    becauseEl.textContent = ok
      ? "Right. " + item.because
      : "Wrong. You chose " + button.dataset.name + ". " + item.because;
    drawFit(byName[item.correct]);
    studyLink.href = "index.html#" + byName[item.correct];
    nextBtn.textContent = index === deck.length - 1 ? "Finish" : "Next";
    follow.hidden = false;
    becauseEl.scrollIntoView({ block: "nearest" });
    nextBtn.focus();
  }

  function showMisses() {
    const old = overlay.querySelector(".misses");
    if (old) old.remove();
    if (!misses.length) return;
    const list = document.createElement("ul");
    list.className = "misses";
    misses.forEach((item) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = "index.html#" + byName[item.correct];
      link.textContent = item.correct;
      li.append(link);
      list.append(li);
    });
    overlayBody.after(list);
  }

  function finish() {
    sheet.hidden = true;
    overlay.hidden = false;
    overlayTitle.textContent = correctCount === deck.length ? "Deck clear" : "Deck finished";
    overlayBody.textContent = correctCount + " of " + deck.length + ". The trades you missed are below. Each link opens that study page.";
    if (correctCount === deck.length) {
      overlayBody.textContent = correctCount + " of " + deck.length + ". Every setup matched the trade from the study page.";
    }
    showMisses();
    startBtn.textContent = "Run the deck again";
    progress.textContent = "Scenario deck";
  }

  function advance() {
    if (follow.hidden) return;
    if (index === deck.length - 1) {
      finish();
      return;
    }
    index += 1;
    show();
    sheet.querySelector("h1").focus();
  }

  function start() {
    const old = overlay.querySelector(".misses");
    if (old) old.remove();
    deck = shuffle(SCENARIOS);
    index = 0;
    picked = 0;
    correctCount = 0;
    misses = [];
    overlay.hidden = true;
    sheet.hidden = false;
    show();
  }

  document.addEventListener("keydown", (event) => {
    const key = "1234".indexOf(event.key);
    if (key !== -1 && !sheet.hidden && !locked) {
      const choice = buttons()[key];
      if (choice) {
        event.preventDefault();
        choose(choice);
      }
      return;
    }
    if (event.key === "Enter" && !follow.hidden) {
      event.preventDefault();
      advance();
    }
  });

  nextBtn.addEventListener("click", advance);
  startBtn.addEventListener("click", start);
})();
