(async () => {
  const j = await loadJSON('data/jornada.json');
  const root = document.getElementById('jornada');

  // Gol de la jornada
  const golHTML = `
    <section>
      <h2>Gol de la jornada ${j.jornada}</h2>
      ${
        j.gol_youtube
          ? `<iframe class="video" src="https://www.youtube.com/embed/${j.gol_youtube}" allowfullscreen></iframe>`
          : '<p>Próximamente…</p>'
      }
    </section>`;

  root.innerHTML = golHTML;
})();
