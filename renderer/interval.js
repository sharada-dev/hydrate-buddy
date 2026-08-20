const input = document.getElementById('mins');
const saveBtn = document.getElementById('save');
const cancelBtn = document.getElementById('cancel');

// Pre-fill with the current interval.
window.hydrate.getInterval().then((mins) => {
  input.value = mins || '';
  input.focus();
  input.select();
});

async function save() {
  const n = Math.round(Number(input.value));
  if (!Number.isFinite(n) || n < 1) {
    input.focus();
    return; // ignore empty/invalid input
  }
  await window.hydrate.saveInterval(n);
  window.hydrate.closeIntervalWindow();
}

saveBtn.addEventListener('click', save);
cancelBtn.addEventListener('click', () => window.hydrate.closeIntervalWindow());
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') save();
  if (e.key === 'Escape') window.hydrate.closeIntervalWindow();
});
