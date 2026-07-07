const input = document.getElementById('name');
const saveBtn = document.getElementById('save');
const cancelBtn = document.getElementById('cancel');

// Pre-fill with the currently saved name.
window.hydrate.getName().then((name) => {
  input.value = name || '';
  input.focus();
  input.select();
});

async function save() {
  await window.hydrate.saveName(input.value);
  window.hydrate.closeNameWindow();
}

saveBtn.addEventListener('click', save);
cancelBtn.addEventListener('click', () => window.hydrate.closeNameWindow());
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') save();
  if (e.key === 'Escape') window.hydrate.closeNameWindow();
});
