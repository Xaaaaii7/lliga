(async () => {
  const jornadas = await loadJSON('data/resultados.json');
  const root = document.getElementById('resultados');

  jornadas.sort((a,b)=> a.numero - b.numero);

  // Render cards SIN enlaces; cada card lleva data-id del partido
  root.innerHTML = jornadas.map(j=>{
    const partidos = (j.partidos||[]).map(p=>{
      const marcador = (p.goles_local ?? '-') + ' - ' + (p.goles_visitante ?? '-');
      const pid = p.id || `${j.numero}-${p.local}-${p.visitante}`; // requiere id en JSON
      return `
        <button class="player-card partido-card" data-partido-id="${pid}" aria-label="Ver estadísticas">
          <div><strong>${p.local}</strong> vs <strong>${p.visitante}</strong></div>
          <div class="meta">${j.fecha ? fmtDate(j.fecha): ''}</div>
          <div style="font-size:1.25rem;margin-top:6px">${marcador}</div>
        </button>`;
    }).join('');

    return `
      <section class="jornada">
        <h2>Jornada ${j.numero} ${j.fecha?`· <small>${fmtDate(j.fecha)}</small>`:''}</h2>
        <div class="team-grid">${partidos}</div>
      </section>`;
  }).join('');

  // Modal handlers
  const backdrop = document.getElementById('stats-backdrop');
  const bodyEl = document.getElementById('stats-body');
  const closeBtn = document.getElementById('stats-close');

  const openModal = () => { backdrop.hidden = false; };
  const closeModal = () => { backdrop.hidden = true; bodyEl.innerHTML = ''; };

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e)=> { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', (e)=> { if (e.key === 'Escape' && !backdrop.hidden) closeModal(); });

  // Carga de estadísticas por id desde data/partidos_stats.json
  const statsIndex = await loadJSON('data/partidos_stats.json'); // { "<id>": { "Equipo A": {...}, "Equipo B": {...} } }

  function renderStatsTable(statsObj){
    const equipos = Object.keys(statsObj||{});
    if (equipos.length !== 2) {
      return `<p>No hay estadísticas disponibles.</p>`;
    }
    const [A,B] = equipos;
    const Adata = statsObj[A], Bdata = statsObj[B];

    // claves ordenadas básicas
    const orden = [
      'goles','posesion','tiros','tiros_a_puerta','faltas','fueras_de_juego','corners',
      'tiros_libres','pases','pases_completados','centros','pases_interceptados','entradas','paradas'
    ];

    const rows = orden
      .filter(k => Adata?.hasOwnProperty(k) || Bdata?.hasOwnProperty(k))
      .map(k => {
        const av = (Adata?.[k] ?? '—');
        const bv = (Bdata?.[k] ?? '—');
        const label = k.replace(/_/g,' ');
        return `<tr><th>${label}</th><td>${av}</td><td>${bv}</td></tr>`;
      }).join('');

    return `
      <table class="stats-table">
        <thead><tr><th>Estadística</th><th>${A}</th><th>${B}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // Click en partido → abre modal
  document.querySelectorAll('.partido-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const id = card.getAttribute('data-partido-id');
      const stats = statsIndex[id];
      bodyEl.innerHTML = renderStatsTable(stats);
      openModal();
    });
  });
})();
