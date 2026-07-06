const pet = document.getElementById('pet');
const spriteIdle = document.getElementById('sprite-idle');
const spriteDrinking = document.getElementById('sprite-drinking');
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
const buttons = document.getElementById('buttons');
const yesBtn = document.getElementById('yes-btn');
const snoozeBtn = document.getElementById('snooze-btn');
const confetti = document.getElementById('confetti');

let busy = false; // ignore clicks while an animation is running

const PROMPTS = [
  'Time to drink water to keep your skin glowing!',
  'Hydration check! Take a sip of water 💧',
  "Water break! Your body will thank you.",
  'Psst… a few sips of water? Stay glowing!',
  "Don't forget me — drink some water!",
];

const CHEERS = [
  'Yay! Stay glowing ✨',
  'Amazing! Keep it up 💧',
  'That\'s the spirit! 🥤',
  'Hydrated and happy! ✨',
];

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function showDrinking(on) {
  spriteIdle.classList.toggle('hidden', on);
  spriteDrinking.classList.toggle('hidden', !on);
}

// ------------------------------------------------------------ walk in / out
async function walkIn() {
  showDrinking(false);
  pet.classList.remove('celebrate');
  pet.classList.remove('face-right'); // face forward as she arrives
  pet.classList.add('offstage');
  // force reflow so the transition runs from the offstage position
  void pet.offsetWidth;
  pet.classList.add('walking');
  pet.classList.remove('offstage');
  await wait(1150);
  pet.classList.remove('walking');
}

async function walkOut() {
  bubble.classList.add('hidden');
  pet.classList.add('face-right'); // turn to face the exit direction
  pet.classList.add('walking');
  pet.classList.add('offstage');
  await wait(1150);
  pet.classList.remove('walking');
  pet.classList.remove('face-right');
}

function showBubble(text, withButtons) {
  bubbleText.textContent = text;
  buttons.classList.toggle('hidden', !withButtons);
  bubble.classList.remove('hidden');
}

// -------------------------------------------------------------- celebration
function burstConfetti() {
  const glyphs = ['💧', '✨', '💙', '🫧', '⭐'];
  const colors = ['#37c24a', '#4aa3df', '#ffd447', '#ff7a59', '#8ad6ff'];
  const count = 42;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const useGlyph = Math.random() < 0.5;
    if (useGlyph) {
      piece.textContent = glyphs[(Math.random() * glyphs.length) | 0];
    } else {
      piece.textContent = '■';
      piece.style.color = colors[(Math.random() * colors.length) | 0];
    }
    piece.style.left = Math.random() * 100 + '%';
    piece.style.setProperty('--dur', 0.9 + Math.random() * 0.9 + 's');
    piece.style.setProperty('--fall', 280 + Math.random() * 160 + 'px');
    piece.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
    piece.style.animationDelay = Math.random() * 0.25 + 's';
    confetti.appendChild(piece);
    setTimeout(() => piece.remove(), 2200);
  }
}

async function celebrate() {
  showBubble(CHEERS[(Math.random() * CHEERS.length) | 0], false);
  showDrinking(true); // she takes a sip
  await wait(950);
  showDrinking(false);
  pet.classList.add('celebrate'); // little happy hop
  burstConfetti();
  await wait(1000);
  pet.classList.remove('celebrate');
}

// ------------------------------------------------------------------- flow
async function runReminder() {
  if (busy) return;
  busy = true;
  await walkIn();
  showBubble(PROMPTS[(Math.random() * PROMPTS.length) | 0], true);
  busy = false;
}

async function onYes() {
  if (busy) return;
  busy = true;
  window.hydrate.yes(); // schedule the next nudge (+45 min)
  await celebrate();
  showBubble('See you in a bit! 👋', false);
  await wait(600);
  await walkOut();
  window.hydrate.hide();
  busy = false;
}

async function onSnooze() {
  if (busy) return;
  busy = true;
  window.hydrate.snooze(); // come back in 10 min
  showBubble("I'll come back in 10 mins!", false);
  await wait(1400);
  await walkOut();
  window.hydrate.hide();
  busy = false;
}

yesBtn.addEventListener('click', onYes);
snoozeBtn.addEventListener('click', onSnooze);

// Triggered by the main process every 45 min (and once shortly after launch).
window.hydrate.onShow(() => runReminder());
