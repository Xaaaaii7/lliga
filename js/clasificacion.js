(async () => {
  const tbody = document.getElementById('tabla-clasificacion');
  if (!tbody) return;

  const showMsg = (txt) => {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#9fb3c8;padding:14px">${txt}</td></tr>`;
  };

  const jornadas = await loadJSON('data/resultados.json').catch(() => null);
  if (!Array.isArray(jornadas)) return showMsg('No se pudieron cargar los resultados.');

  // ======== Helpers ========
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const norm = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim();
  const slug = s => norm(s).replace(/\s+/g,'-');
  const logoPath = (name) => `img/${slug(name)}.png`;
  const dg = e => e.gf - e.gc;

  // ======== Modal historial equipo ========
  const teamBackdrop      = document.getElementById('team-backdrop');
  const teamCloseBtn      = document.getElementById('team-modal-close');
  const teamTitleEl       = document.getElementById('team-modal-title');
  const teamSummaryEl     = document.getElementById('team-modal-summary');
  const teamMetaEl        = document.getElementById('team-modal-meta');
  const teamMatchesEl     = document.getElementById('team-modal-matches');
  const teamBadgeImg      = document.getElementById('team-modal-badge');

  const openTeamModal = () => {
    if (!teamBackdrop) return;
    teamBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  const closeTeamModal = () => {
    if (!teamBackdrop) return;
    teamBackdrop.hidden = true;
    document.body.style.overflow = '';
    if (teamTitleEl)   teamTitleEl.textContent   = '';
    if (teamSummaryEl) teamSummaryEl.textContent = '';
    if (teamMetaEl)    teamMetaEl.textContent    = '';
    if (teamMatchesEl) teamMatchesEl.innerHTML   = '';
    if (teamBadgeImg) {
      teamBadgeImg.src = '';
      teamBadgeImg.alt = '';
    }
  };

  // listeners de cierre modal
  teamCloseBtn?.addEventListener('click', closeTeamModal);
  teamBackdrop?.addEventListener('click', (e) => {
    if (e.target === teamBackdrop) closeTeamModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && teamBackdrop && !teamBackdrop.hidden) {
      closeTeamModal();
    }
  });

  // detectar última jornada jugada
  let lastPlayed = 0;
  jornadas.forEach((j,idx)=>{
    if ((j.partidos||[]).some(p => isNum(p.goles_local) && isNum(p.goles_visitante)))
      lastPlayed = idx+1;
  });
  if (lastPlayed === 0) return showMsg('Aún no se ha jugado ninguna jornada.');

  // crea botones de navegación
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

  // ======== Función principal para calcular clasificación hasta cierta jornada ========
  const calcularClasificacion = (hasta) => {
    const teams = new Map();
    const teamObj = (name) => {
      const k = norm(name);
      if (!teams.has(k)) {
        teams.set(k, { nombre:name, pj:0,g:0,e:0,p:0,gf:0,gc:0,pts:0 });
      }
      return teams.get(k);
    };
    const h2h = {};
    const addH2H = (A,B,gfA,gfB) => {
      const a=norm(A), b=norm(B);
      (h2h[a] ||= {}); (h2h[a][b] ||= {gf:0,gc:0});
      h2h[a][b].gf += gfA; h2h[a][b].gc += gfB;
    };

    for (let i=0; i<hasta; i++) {
      const j = jornadas[i];
      for (const p of (j?.partidos||[])) {
        if (!p.local || !p.visitante) continue;
        const L = teamObj(p.local);
        const V = teamObj(p.visitante);
        const gl = isNum(p.goles_local)?p.goles_local:null;
        const gv = isNum(p.goles_visitante)?p.goles_visitante:null;
        if (gl===null || gv===null) continue;

        L.pj++; V.pj++;
        L.gf += gl; L.gc += gv;
        V.gf += gv; V.gc += gl;

        if (gl>gv){ L.g++;L.pts+=3;V.p++; }
        else if (gl<gv){ V.g++;V.pts+=3;L.p++; }
        else{ L.e++;V.e++;L.pts++;V.pts++; }

        addH2H(p.local,p.visitante,gl,gv);
        addH2H(p.visitante,p.local,gv,gl);
      }
    }

    const equipos = Array.from(teams.values());
    equipos.sort((A,B)=>{
      if (B.pts !== A.pts) return B.pts - A.pts;
      const a=norm(A.nombre), b=norm(B.nombre);
      const ha=h2h[a]?.[b], hb=h2h[b]?.[a];
      if (ha && hb) {
        const difA=(ha.gf||0)-(ha.gc||0);
        const difB=(hb.gf||0)-(hb.gc||0);
        if (difA!==difB) return difB-difA;
      }
      const dA=dg(A), dB=dg(B);
      if (dA!==dB) return dB-dA;
      if (B.gf!==A.gf) return B.gf-A.gf;
      return A.nombre.localeCompare(B.nombre,'es',{sensitivity:'base'});
    });
    return equipos;
  };

  // ======== Historial de un equipo hasta la jornada 'hasta' ========
  const obtenerPartidosEquipo = (hasta, teamName) => {
    const matches = [];
    for (let i = 0; i < hasta; i++) {
      const j = jornadas[i];
      for (const p of (j?.partidos || [])) {
        if (!p.local || !p.visitante) continue;
        const gl = isNum(p.goles_local)    ? p.goles_local    : null;
        const gv = isNum(p.goles_visitante)? p.goles_visitante: null;
        if (gl === null || gv === null) continue;

        if (p.local === teamName || p.visitante === teamName) {
          const isLocal = p.local === teamName;
          const gf = isLocal ? gl : gv;
          const gc = isLocal ? gv : gl;
          let result = 'E';
          if (gf > gc) result = 'V';
          else if (gf < gc) result = 'D';

          matches.push({
            jornada: i+1,
            local: p.local,
            visitante: p.visitante,
            gf,
            gc,
            isLocal,
            result
          });
        }
      }
    }
    // ya están en orden por jornada (i+1)
    return matches;
  };

  const abrirHistorialEquipo = (equipos, hasta, teamName) => {
    const eq = equipos.find(e => e.nombre === teamName);
    const partidos = obtenerPartidosEquipo(hasta, teamName);

    if (!eq && partidos.length === 0) return; // nada que mostrar

    // Título y escudo
    if (teamTitleEl)   teamTitleEl.textContent   = teamName;
    if (teamBadgeImg) {
      teamBadgeImg.src = logoPath(teamName);
      teamBadgeImg.alt = `Escudo ${teamName}`;
      teamBadgeImg.onerror = () => { teamBadgeImg.style.visibility = 'hidden'; };
    }

    // Resumen tipo "PJ 8 · 5G 2E 1P · 15 GF · 7 GC · DG +8 · 17 pts"
    if (eq && teamSummaryEl) {
      const diff = dg(eq);
      const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
      teamSummaryEl.textContent =
        `${eq.pj} PJ · ${eq.g} G ${eq.e} E ${eq.p} P · ${eq.gf} GF · ${eq.gc} GC · DG ${diffStr} · ${eq.pts} pts`;
    } else if (teamSummaryEl) {
      teamSummaryEl.textContent = '';
    }

    if (teamMetaEl) {
      teamMetaEl.textContent = `Resultados hasta la jornada ${hasta}`;
    }

    if (teamMatchesEl) {
      if (!partidos.length) {
        teamMatchesEl.innerHTML = `<p class="hint">Este equipo todavía no ha disputado ningún partido con resultado cerrado hasta la jornada ${hasta}.</p>`;
      } else {
        teamMatchesEl.innerHTML = partidos.map(m => {
          const resClass =
            m.result === 'V' ? 'result-win' :
            m.result === 'D' ? 'result-loss' :
                               'result-draw';
          const label =
            m.result === 'V' ? 'Victoria' :
            m.result === 'D' ? 'Derrota'  : 'Empate';
          return `
            <div class="team-match-row ${resClass}">
              <div class="team-match-left">
                <span class="chip chip-jornada">J${m.jornada}</span>
              </div>
              <div class="team-match-center">
                <span class="team-match-team ${m.isLocal ? 'highlight-team' : ''}">
                  ${m.local}
                </span>
                <span class="team-match-score">${m.gf} – ${m.gc}</span>
                <span class="team-match-team ${!m.isLocal ? 'highlight-team' : ''}">
                  ${m.visitante}
                </span>
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

  // ======== Render ========
  let current = lastPlayed;

  const render = (equipos, jNum) => {
    label.textContent = `Jornada ${jNum}`;
    const tierClass = (i, len) => (
      i < 8 ? 'tier-top' :
      (i < 12 ? 'tier-mid' :
      (i >= len-4 ? 'tier-bottom' : ''))
    );

    tbody.innerHTML = equipos.map((e,i)=>`
      <tr class="${tierClass(i,equipos.length)}">
        <td class="pos-cell">
          <span class="pos-index">${i+1}</span>
        </td>
        <td class="team-cell">
          <img class="team-badge" src="${logoPath(e.nombre)}" alt="Escudo ${e.nombre}" onerror="this.style.visibility='hidden'">
          <button type="button" class="team-name-btn" data-team="${e.nombre}">
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

    // listeners para abrir historial al hacer clic en el nombre
    tbody.querySelectorAll('.team-name-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const teamName = btn.dataset.team;
        if (!teamName) return;
        abrirHistorialEquipo(equipos, jNum, teamName);
      });
    });
  };

  // ======== Navegación ========
  const update = () => {
    const equipos = calcularClasificacion(current);
    render(equipos, current);
    prevBtn.disabled = current <= 1;
    nextBtn.disabled = current >= lastPlayed;
  };
  prevBtn.addEventListener('click',()=>{ if(current>1){current--;update();} });
  nextBtn.addEventListener('click',()=>{ if(current<lastPlayed){current++;update();} });

  // mostrar por defecto última jornada jugada
  update();
})();
