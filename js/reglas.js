(() => {
  const btn = document.getElementById('btn-guia-stream');
  const backdrop = document.getElementById('stream-backdrop');
  const closeBtn = document.getElementById('stream-close');
  if (!btn || !backdrop || !closeBtn) return;

  const open = () => { backdrop.hidden = false; document.body.style.overflow = 'hidden'; };
  const close = () => { backdrop.hidden = true; document.body.style.overflow = ''; };

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) close(); });
})();
