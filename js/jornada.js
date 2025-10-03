(async () => {
  const jornadas = await loadJSON('data/jornada.json');
  const root = document.getElementById('jornada');
  if (!Array.isArray(jornadas)) return;

  root.innerHTML = jornadas.map(j => {
    const video = j.gol_youtube
      ? `<iframe class="video" src="https://www.youtube.com/embed/${j.gol_youtube}" allowfullscreen></iframe>`
      : '<p>Próximamente…</p>';

    // 👉 encuesta (solo si hay poll.embed_url)
    const poll = j.poll?.embed_url
      ? `<div class="poll-wrap">
           <h3 style="margin:16px 0 8px">Vota el mejor gol</h3>
           <div class="poll-frame">
             <iframe src="${j.poll.embed_url}"
                     loading="lazy"
                     referrerpolicy="no-referrer-when-downgrade"
                     allowtransparency="true"></iframe>
           </div>
           <p class="poll-note">* Voto limitado por IP y navegador.</p>
         </div>`
      : '';

    return `
      <section class="jornada-bloque">
        <h2>Gol de la jornada ${j.jornada}</h2>
        ${video}
        ${poll}
      </section>`;
  }).join('');
})();
