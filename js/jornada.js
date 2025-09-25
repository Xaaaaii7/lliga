(async () => {
  const jornadas = await loadJSON('data/jornada.json');
  const root = document.getElementById('jornada');

  if (!Array.isArray(jornadas)) return;

  root.innerHTML = jornadas.map(j => `
    <section>
      <h2>Goles de la jornada ${j.jornada}</h2>
      ${
        j.gol_youtube
          ? `<iframe class="video" src="https://www.youtube.com/embed/${j.gol_youtube}" allowfullscreen></iframe>`
          : '<p>Próximamente…</p>'
      }
    </section>
  `).join('');
})();
