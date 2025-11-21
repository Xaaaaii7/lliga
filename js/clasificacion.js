(async () => {
  const tbody = document.getElementById('tabla-clasificacion');
  if (!tbody) return;

  const showMsg = (txt) => {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center;color:#9fb3c8;padding:14px">
          ${txt}
        </td>
      </tr>`;
  };

  // --- Core helpers ---
  const isNum = CoreStats.isNum;
  const norm  = CoreStats.norm;
  const slug  = CoreStats.slug;
  const dg    = CoreStats.dg;

  const logoPath = (name) => `img/${slug(name)}.png`;

  const jornadas = await CoreStats.getResultados().catch(() => null);
  if (!Array.isArray(jornadas) || !jornadas.length) {
    return showMsg('No se pudieron cargar los resultados.');
  }

  // detectar última jornada jugada
  let lastPlayed = 0;
  jornadas.forEach((j, idx) => {
    if ((j.partidos || []).some(p => isNum(p.goles_local) && isNum(p.goles_visitante))) {
      lastPlayed = idx + 1;
    }
  });
  if (lastPlayed === 0) return showMsg('Aún no se ha jugado ninguna jornada.');

  // crea navegación por jornadas
  const navWrap = document.createElement('div');
  navWrap.className = 'jornada-nav';
  navWrap.innerHTML = `
    <button id="prevJornada" class="nav-btn">◀</button>
    <span id="jornadaLabel" class="jornada-label chip"></span>
    <button id="nextJornada" class="nav-btn">▶</button>
  `;
  tbody.parentElement.insertAdjacentElement('beforebegin', navWrap);

  const label   = document.getElementById('jornadaLabel');
  const prevBtn = document.getElementById('prevJornada');
  const nextBtn = document.getElementById('nextJornada');

  // ======== Modal refs ========
  const teamBackdrop      = document.getElementById('team-backdrop');
  const teamCloseBtn      = document.getElementById('team-modal-close');
  const teamTitleEl       = document.getElementById('team-modal-title');
  const teamSummaryEl     = document.getElementById('team-modal-summary');
  const teamMetaEl        = document.getElementById('team-modal-meta');
  const teamMatchesEl     = document.getElementById('team-modal-matches');
  const teamBadgeImg      = document.getElementById('team-modal-badge');
  const teamPosHistoryEl  = document.getElementById('team-modal-poshistory');

  const openTeamModal = () => {
    if (!teamBackdrop) return;
    teamBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  const closeTeamModal = () => {
    if (!teamBackdrop) return;
    teamBackdrop.hidden = true;
    document.body.style.overflow = '';
    if (teamTitleEl)       teamTitleEl.textContent    = '';
    if (teamSummaryEl)     teamSummaryEl.textContent  = '';
    if (teamMetaEl)        teamMetaEl.textContent     = '';
    if (teamMatchesEl)     teamMatchesEl.innerHTML    = '';
    if (teamPosHistoryEl)  teamPosHistoryEl.innerHTML = '';
    if (teamBadgeImg) {
      teamBadgeImg.removeAttribute('src');
      teamBadgeImg.alt = '';
      teamBadgeImg.style.visibility = '';
    }
  };

  teamCloseBtn?.addEventListener('click', closeTeamModal);
  teamBackdrop?.addEventListener('click', (e) => {
    if (e.target === teamBackdrop) closeTeamModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && teamBackdrop && !teamBackdrop.hidden) {
      closeTeamModal();
    }
  });

  // ======== Historial de partidos del equipo hasta 'hasta' ========
  const obtenerPartidosEquipo = (hasta, teamName) => {
    const matches = [];
    for (let i = 0; i < hasta; i++) {
      const j = jornadas[i];
      for (const p of (j?.partidos || [])) {
        if (!p.local || !p.visitante) continue;
        const gl = isNum(p.goles_local) ? p.goles_local : null;
        const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
        if (gl === null || gv === null) continue;

        if (p.local === teamName || p.visitante === teamName) {
          const isLocal = p.local === teamName;
          const gf = isLocal ? gl : gv;
          const gc = isLocal ? gv : gl;
          let result = 'E';
          if (gf > gc) result = 'V';
          else if (gf < gc) result = 'D';

          matches.push({
            jornada: i + 1,
            local: p.local,
            visitante: p.visitante,
            gl,
            gv,
            gf,
            gc,
            isLocal,
            result
          });
        }
      }
    }
    return matches;
  };

  // ======== Histórico de posiciones (usa el core) ========
  const obtenerPosicionesEquipo = async (hasta, teamName) => {
    const history = [];
    for (let jNum = 1; jNum <= hasta; jNum++) {
      const tabla = await CoreStats.computeClasificacion(jNum); // H2H incluido
      const idx = tabla.findIndex(e => e.nombre === teamName);
      if (idx === -1) continue;
      history.push({
        jornada: jNum,
        pos: idx + 1,
        pts: tabla[idx].pts
      });
    }
    return history;
  };

  const abrirHistorialEquipo = async (equipos, hasta, teamName) => {
    const eq = equipos.find(e => e.nombre === teamName);
    const partidos = obtenerPartidosEquipo(hasta, teamName);
    const posHistory = await obtenerPosicionesEquipo(hasta, teamName);

    if (!eq && partidos.length === 0 && posHistory.length === 0) return;

    if (teamBadgeImg) {
      teamBadgeImg.style.visibility = '';
      teamBadgeImg.src = logoPath(teamName);
      teamBadgeImg.alt = `Escudo ${teamName}`;
      teamBadgeImg.onerror = () => teamBadgeImg.style.visibility = 'hidden';
    }

    if (teamTitleEl) teamTitleEl.textContent = teamName;

    if (eq && teamSummaryEl) {
      const diff = dg(eq);
      const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
      teamSummaryEl.textContent =
        `${eq.pj} PJ · ${eq.g} G ${eq.e} E ${eq.p} P · ${eq.gf} GF · ${eq.gc} GC · DG ${diffStr} · ${eq.pts} pts`;
    } else if (teamSummaryEl) {
      teamSummaryEl.textContent = '';
    }

    if (teamMetaEl) teamMetaEl.textContent = `Resultados hasta la jornada ${hasta}`;

    // posiciones
    if (teamPosHistoryEl) {
      if (!posHistory.length) {
        teamPosHistoryEl.innerHTML = '';
      } else {
        teamPosHistoryEl.innerHTML = `
          <h3 class="team-pos-title">Evolución en la clasificación</h3>
          <div class="team-pos-list">
            ${posHistory.map((h, idx) => {
              const prev = idx > 0 ? posHistory[idx - 1].pos : null;
              let trend = '';
              if (prev !== null) {
                if (h.pos < prev) trend = '↑';
                else if (h.pos > prev) trend = '↓';
              }
              const trendClass =
                !trend ? '' :
                (trend === '↑' ? 'pos-up' : 'pos-down');

              return `
                <div class="team-pos-row">
                  <span class="chip chip-jornada">J${h.jornada}</span>
                  <span class="team-pos-value">
                    ${h.pos}º
                    ${trend ? `<span class="team-pos-trend ${trendClass}">${trend}</span>` : ''}
                  </span>
                  <span class="team-pos-points">${h.pts} pts</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
    }

    // partidos
    if (teamMatchesEl) {
      if (!partidos.length) {
        teamMatchesEl.innerHTML =
          `<p class="hint">Este equipo todavía no ha disputado partidos cerrados hasta la jornada ${hasta}.</p>`;
      } else {
        teamMatchesEl.innerHTML = partidos.map(m => {
          const resClass =
            m.result === 'V' ? 'result-win' :
            m.result === 'D' ? 'result-loss' :
                               'result-draw';
          const label =
            m.result === 'V' ? 'Victoria' :
            m.result === 'D' ? 'Derrota' : 'Empate';

          return `
            <div class="team-match-row ${resClass}">
              <div class="team-match-left">
                <span class="chip chip-jornada">J${m.jornada}</span>
              </div>
              <div class="team-match-center">
                <span class="team-match-team ${m.isLocal ? 'highlight-team' : ''}">${m.local}</span>
                <span class="team-match-score">${m.gl} – ${m.gv}</span>
                <span class="team-match-team ${!m.isLocal ? 'highlight-team' : ''}">${m.visitante}</span>
              </div>
              <div class="team-match-right">
                <span class="result-pill">${label}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    openTeamModal();
  };

  // ======== Render tabla ========
  let current = lastPlayed;

  const render = (equipos, jNum) => {
    label.textContent = `Jornada ${jNum}`;

    const tierClass = (i, len) => (
      i < 8 ? 'tier-top' :
      (i < 12 ? 'tier-mid' :
      (i >= len - 4 ? 'tier-bottom' : ''))
    );

    tbody.innerHTML = equipos.map((e, i) => `
      <tr class="${tierClass(i, equipos.length)}">
        <td class="pos-cell">
          <span class="pos-index">${i + 1}</span>
        </td>
        <td class="team-cell">
          <img class="team-badge"
               src="${logoPath(e.nombre)}"
               alt="Escudo ${e.nombre}"
               onerror="this.style.visibility='hidden'">
          <button type="button"
                  class="team-name-btn"
                  data-team="${e.nombre}">
            ${e.nombre}
          </button>
        </td>
        <td>${e.pj}</td>
        <td>${e.g}</td>
        <td>${e.e}</td>
        <td>${e.p}</td>
        <td>${e.gf}</td>
        <td>${e.gc}</td>
        <td>${dg(e)}</td>
        <td>${e.pts}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.team-name-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const teamName = btn.dataset.team;
        if (!teamName) return;
        await abrirHistorialEquipo(equipos, jNum, teamName);
      });
    });
  };

  const update = async () => {
    const equipos = await CoreStats.computeClasificacion(current); // ✅ H2H ya en core
    render(equipos, current);
    prevBtn.disabled = current <= 1;
    nextBtn.disabled = current >= lastPlayed;
  };

  prevBtn.addEventListener('click', async () => {
    if (current > 1) { current--; await update(); }
  });
  nextBtn.addEventListener('click', async () => {
    if (current < lastPlayed) { current++; await update(); }
  });

  // Por defecto última jornada
  await update();
})();
