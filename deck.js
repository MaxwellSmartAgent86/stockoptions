(function () {
  const sheet = document.getElementById("sheet");
  const progress = document.getElementById("progress");
  const scenarioEl = document.getElementById("scenario");
  const choicesEl = document.getElementById("choices");
  const becauseEl = document.getElementById("because");
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
      because: "Covered call. It is the same shape as the cash-secured put once you own the shares. You sell a call against them. Another short put would be a second promise to buy."
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

  function buttons() {
    return Array.from(choicesEl.querySelectorAll(".choice"));
  }

  function show() {
    const item = deck[index];
    locked = false;
    progress.textContent = (index + 1) + " of " + deck.length;
    scenarioEl.textContent = item.prompt;
    becauseEl.textContent = "";
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
    becauseEl.textContent = (ok ? "Yes. " : "No. ") + item.because;
    studyLink.href = "index.html#" + byName[item.correct];
    nextBtn.textContent = index === deck.length - 1 ? "Finish" : "Next";
    follow.hidden = false;
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
