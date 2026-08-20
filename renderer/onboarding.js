const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const nameInput = document.getElementById('name');
const minsInput = document.getElementById('mins');
const chips = document.getElementById('chips');
const nextBtn = document.getElementById('next');
const backBtn = document.getElementById('back');
const doneBtn = document.getElementById('done');

// Pre-fill from whatever's already saved.
window.hydrate.getName().then((n) => {
  nameInput.value = n || '';
  nameInput.focus();
  nameInput.select();
});
window.hydrate.getInterval().then((m) => {
  minsInput.value = m || 45;
  syncChips();
});

function syncChips() {
  const v = Math.round(Number(minsInput.value));
  chips.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', Number(c.dataset.min) === v);
  });
}

chips.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  minsInput.value = btn.dataset.min;
  syncChips();
});
minsInput.addEventListener('input', syncChips);

function goStep2() {
  window.hydrate.saveName(nameInput.value); // persist the name before moving on
  step1.classList.add('hidden');
  step2.classList.remove('hidden');
  minsInput.focus();
  minsInput.select();
}

function finish() {
  const n = Math.round(Number(minsInput.value));
  if (Number.isFinite(n) && n >= 1) window.hydrate.saveInterval(n);
  window.hydrate.closeOnboarding();
}

nextBtn.addEventListener('click', goStep2);
backBtn.addEventListener('click', () => {
  step2.classList.add('hidden');
  step1.classList.remove('hidden');
  nameInput.focus();
});
doneBtn.addEventListener('click', finish);

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') goStep2();
  if (e.key === 'Escape') window.hydrate.closeOnboarding();
});
minsInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') finish();
  if (e.key === 'Escape') window.hydrate.closeOnboarding();
});
