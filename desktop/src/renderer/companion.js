const API_HOST = "http://127.0.0.1:8000";

const companionContainer = document.getElementById("companion-container");
const spriteImg = document.getElementById("companion-sprite");
const spriteWrapper = document.getElementById("sprite-wrapper");
const speechBubble = document.getElementById("speech-bubble");
const speechText = document.getElementById("speech-text");
const speechTail = document.getElementById("speech-tail");
const sleepContainer = document.getElementById("sleep-container");
const companionName = document.getElementById("companion-name");

let currentCompanion = null;
let currentState = "sleep";
let undisturbedTimer = null;
let stepTimer = null;
let hideBubbleTimeout = null;
let clickTimer = null;
let upcomingEvents = [];
let quotes = [
  "Lock in. Your future self is watching.",
  "Do it tired. Do it scared. Just do it.",
];

async function fetchQuotes() {
  try {
    const res = await fetch(`${API_HOST}/api/calendar/quotes`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.quotes?.length) quotes = data.quotes;
  } catch {}
}

function showBubble(
  text,
  duration = 5000,
  bgColor = "#ffffff",
  textColor = "#000000",
  tag = "",
) {
  if (!text) return;
  if (hideBubbleTimeout) clearTimeout(hideBubbleTimeout);

  const tagHtml = tag ? `<span class="quote-tag">${tag}</span>` : "";
  speechText.innerHTML = `${tagHtml}${text}`;
  speechBubble.style.backgroundColor = bgColor;
  speechBubble.style.color = textColor;
  speechTail.style.borderTopColor = bgColor;
  speechBubble.classList.remove("hidden");

  hideBubbleTimeout = setTimeout(() => {
    speechBubble.classList.add("hidden");
    hideBubbleTimeout = null;
  }, duration);
}

function triggerRandomQuote() {
  if (!quotes.length) return;
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  showBubble(quote, 5000, "#ffffff", "#0f172a");
}

function showNextCalendarEvent() {
  const now = new Date();
  const nextEvent =
    upcomingEvents.find((ev) => {
      const st = new Date(ev.start);
      const en = ev.end ? new Date(ev.end) : new Date(st.getTime() + 3600000);
      return st >= now || (now >= st && now <= en);
    }) || upcomingEvents[0];

  if (nextEvent) {
    const st = new Date(nextEvent.start);
    const timeStr = st.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    showBubble(
      `📅 ${nextEvent.title} at ${timeStr}`,
      5000,
      "#BAE6FD",
      "#0C4A6E",
      "CALENDAR",
    );
  } else {
    showBubble(
      "📅 No upcoming events today!",
      5000,
      "#BAE6FD",
      "#0C4A6E",
      "CALENDAR",
    );
  }
}

function setState(newState) {
  currentState = newState;
  spriteWrapper.className = `sprite-wrapper anim-${newState}`;
  sleepContainer.classList.toggle("hidden", newState !== "sleep");
}

function clearUndisturbed() {
  if (undisturbedTimer) clearTimeout(undisturbedTimer);
  if (stepTimer) clearTimeout(stepTimer);
  undisturbedTimer = null;
  stepTimer = null;
}

function startUndisturbed(initialDelay = 1000) {
  clearUndisturbed();
  undisturbedTimer = setTimeout(() => {
    setState("step");
    spriteImg.style.transform = "scaleX(1)";
    stepTimer = setTimeout(() => {
      spriteImg.style.transform = "scaleX(-1)";
    }, 700);

    undisturbedTimer = setTimeout(() => {
      setState("shake");
      spriteImg.style.transform = "scaleX(1)";
      undisturbedTimer = setTimeout(() => setState("sleep"), 1200);
    }, 1500);
  }, initialDelay);
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

function handleSingleClick() {
  clearUndisturbed();
  playChime();
  setState("wave");
  triggerRandomQuote();
  startUndisturbed(6000);
}

function handleDoubleClick() {
  clearUndisturbed();
  playChime();
  setState("celebrate");
  showNextCalendarEvent();
  startUndisturbed(6000);
}

let isMouseDown = false;
let downX = 0;
let downY = 0;
let hasDragged = false;

companionContainer.addEventListener("mouseenter", () => {
  window.pixelleDesktop?.setInteractive(true);
});

companionContainer.addEventListener("mouseleave", () => {
  if (!isMouseDown) window.pixelleDesktop?.setInteractive(false);
});

spriteWrapper.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  spriteWrapper.setPointerCapture(e.pointerId);
  clearUndisturbed();
  setState("idle");

  isMouseDown = true;
  hasDragged = false;
  downX = e.screenX;
  downY = e.screenY;

  window.pixelleDesktop?.startDrag();
});

spriteWrapper.addEventListener("pointermove", (e) => {
  if (!isMouseDown) return;
  if (Math.hypot(e.screenX - downX, e.screenY - downY) > 5) {
    hasDragged = true;
  }
});

function handlePointerUp(e) {
  if (!isMouseDown) return;
  isMouseDown = false;

  try {
    if (e?.pointerId) spriteWrapper.releasePointerCapture(e.pointerId);
  } catch {}

  window.pixelleDesktop?.endDrag();

  if (hasDragged) {
    setState("idle");
    startUndisturbed(600);
  } else {
    if (clickTimer !== null) {
      clearTimeout(clickTimer);
      clickTimer = null;
      handleDoubleClick();
    } else {
      clickTimer = setTimeout(() => {
        clickTimer = null;
        handleSingleClick();
      }, 260);
    }
  }
}

spriteWrapper.addEventListener("pointerup", handlePointerUp);
spriteWrapper.addEventListener("pointercancel", handlePointerUp);
window.addEventListener("blur", () => {
  if (isMouseDown) handlePointerUp();
});

speechBubble.addEventListener("click", (e) => {
  e.stopPropagation();
  speechBubble.classList.add("hidden");
  if (hideBubbleTimeout) clearTimeout(hideBubbleTimeout);
});

async function syncCompanion() {
  try {
    const res = await fetch(`${API_HOST}/api/characters`);
    if (!res.ok) return;
    const characters = await res.json();
    if (!characters?.length) return;

    const active = characters.find((c) => c.is_active) || characters[0];
    if (!currentCompanion || currentCompanion.id !== active.id) {
      currentCompanion = active;
      companionName.textContent = active.name;
      spriteImg.src = `${API_HOST}${active.sprite_scaled_url}`;
    }
  } catch {}
}

async function checkCalendarEvents() {
  try {
    const res = await fetch(`${API_HOST}/api/calendar/events?max_results=10`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const events = await res.json();
    if (Array.isArray(events)) upcomingEvents = events;
  } catch {}
}

speechBubble.classList.add("hidden");
fetchQuotes();
syncCompanion();
checkCalendarEvents();

setInterval(fetchQuotes, 30000);
setInterval(syncCompanion, 10000);
setInterval(checkCalendarEvents, 20000);

startUndisturbed(800);
