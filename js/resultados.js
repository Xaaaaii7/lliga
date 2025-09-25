(async () => {
  const root = document.getElementById('resultados');

  // Modal refs
  const backdrop = document.getElementById('stats-backdrop');
  const bodyEl = document.getElementById('stats-body');
  const closeBtn = document.getElementById('stats-close');

  // Helpers modal
  const openModal = () => { backdrop.hidden = false; };
  const closeModal = () => { backdrop.hidden = true; bodyEl.innerHTML = ''; };

  // Cerrar siempre al cargar (por si el HTML quedó sin hidden)
  closeModal();

  // Listeners de cierre
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e)=> { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', (e)=> { if (e.key === 'Escape' && !backdrop.hidden) closeModal(); });

  // Carga datos
  const jornadas = await loadJSON('data/resultados.json').catch(()=>[]);
  jornadas.sort((a,b)=> a.numero - b.numero);

  root.innerHTML = jornadas.map(j=>{
   const partidos = (j.partidos||[]).map(p=>{
  const marcador = (p.goles_local ?? '-') + ' - ' + (p.goles_visitante ?? '-');
   const pid = p.id || `J${j.numero}-P${idx+1}`;

  const fechaHora = (p.fecha && p.hora)
    ? `<div class="fecha-hora">${fmtDate(p.fecha)} · ${p.hora}</div>`
    : '';

  const streamHTML = p.stream
    ? `<div style="margin-top:6px;text-align:center;">
         <a href="${p.stream}" target="_blank" rel="noopener noreferrer">🔴 Ver directo</a>
       </div>`
    : '';

  return `
    <div>
      <button class="player-card partido-card" data-partido-id="${pid}" aria-label="Ver estadísticas">
        <div><strong>${p.local}</strong> vs <strong>${p.visitante}</strong></div>
        ${fechaHora}
        <div style="font-size:1.25rem;margin-top:6px">${marcador}</div>
      </button>
      ${streamHTML}
    </div>`;
}).join('');


    return `
      <section class="jornada">
        <h2>Jornada ${j.numero} ${j.fecha?`· <small>${fmtDate(j.fecha)}</small>`:''}</h2>
        <div class="team-grid">${partidos}</div>
      </section>`;
  }).join('');

  // Cargar índice de stats (tolerante a errores)
  let statsIndex = {};
  try { statsIndex = await loadJSON('data/partidos_stats.json'); } catch { statsIndex = {}; }

  const renderStatsTable = (statsObj)=>{
    const equipos = Object.keys(statsObj||{});
    if (equipos.length !== 2) return `<p>No hay estadísticas disponibles.</p>`;
    const [A,B] = equipos, Adata = statsObj[A], Bdata = statsObj[B];
    const orden = ['goles','posesion','tiros','tiros_a_puerta','faltas','fueras_de_juego','corners','tiros_libres','pases','pases_completados','centros','pases_interceptados','entradas','paradas'];
    const rows = orden.filter(k=>Adata?.hasOwnProperty(k)||Bdata?.hasOwnProperty(k))
      .map(k=>`<tr><th>${k.replace(/_/g,' ')}</th><td>${Adata?.[k] ?? '—'}</td><td>${Bdata?.[k] ?? '—'}</td></tr>`).join('');
    return `<table class="stats-table"><thead><tr><th>Estadística</th><th>${A}</th><th>${B}</th></tr></thead><tbody>${rows}</tbody></table>`;
  };

  // Click en partido → abre modal
  root.querySelectorAll('.partido-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const id = card.getAttribute('data-partido-id');
      const stats = statsIndex[id];
      bodyEl.innerHTML = renderStatsTable(stats);
      openModal();
    });
  });
})();
