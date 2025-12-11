import { Modal } from '../modules/modal.js';

(() => {
  const modal = new Modal('stream-backdrop', 'stream-close');

  const btn = document.getElementById('btn-guia-stream');
  btn?.addEventListener('click', () => modal.open());
})();
