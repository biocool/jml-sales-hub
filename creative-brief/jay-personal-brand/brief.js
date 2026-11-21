'use strict';
document.querySelectorAll('[data-copy]').forEach((button) => {
  const prompt = document.getElementById(button.dataset.copy);
  const status = button.nextElementSibling;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prompt.textContent.trim());
      status.textContent = 'Prompt copied.';
    } catch {
      prompt.closest('details').open = true;
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(prompt);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      status.textContent = 'Prompt selected. Use your device’s Copy command.';
    }
  });
});
