(async () => {
  const root = document.getElementById('jornada');
  if (!root) return;

  // Cargamos config de jornadas (vídeo + poll)
  const jornadasCfg = await loadJSON('data/jornada.json').catch(() => null);
  // Cargamos resultados y stats para poder calcular MVP
  const jornadasRes = await loadJSON('data/resultados.json').catch(() => null);
  const statsIndex  = await loadJSON('data/partidos_stats.json').catch(() => null);

  if (!Array.isArray(jornadasCfg) || !jornadasCfg.length) {
    root.innerHTML = '<p style="text-align:center;color:#9fb3c8">No hay jornadas configuradas todavía.</p>';
    return;
  }

  // Helpers slugs / logos / fotos
  const norm = s => String(s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'')
    .trim();

  const slug = s => norm(s).replace(/\s+/g,'-');

  const logoPath = eq => `img/${slug(eq)}.png`;
  const playerPhotoPath = nombre => `img/jugadores/${slug(nombre)}.jpg`;

  // ==========================
  //   HELPERS DE MÉTRICAS
  // ==========================

  const parsePct01 = v => {
    if (v == null) return null;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(',', '.').replace('%','').trim());
      if (!Number.isFinite(n)) return null;
      return n > 1 ? n/100 : n;
    }
    const n = +v;
    if (!Number.isFinite(n)) return null;
    return n > 1 ? n/100 : n;
  };

  const addNum = (o,k,v)=>{ o[k] += (Number.isFinite(+v)?+v:0); };

  const fair = t => {
    const ROJA_PESO = 5;
    return ((t.entradas||0)+1) / ((t.faltas||0) + ROJA_PESO*(t.rojas||0) + 1);
  };

  const precision  = t => t.tiros>0 ? (t.taPuerta||0)/t.tiros : NaN;
  const conversion = t => (t.tiros>0) ? (t.goles||0)/t.tiros : NaN;
  const combined   = t => {
    const p = precision(t), c = conversion(t);
    return (!isNaN(p) && !isNaN(c)) ? (p+c)/2 : NaN;
  };
  const efectRival = t => t.tirosRival>0 ? t.golesEncajados/t.tirosRival : NaN;

  // ==========================
  //   MVP POR JORNADA (equipo)
  // ==========================

  let mvpPorJornada = {};
  if (Array.isArray(jornadasRes) && statsIndex) {
    mvpPorJornada = computeMvpPorJornada(jornadasRes, statsIndex);
  }

  function computeMvpPorJornada(jornadasRes, statsIndex) {
    const result = {};

    // ranking normalizado 0..1 por métrica
    const rankMetric = (teams, valueFn, { highIsBetter }) => {
      const list = teams
        .map(t => ({ t, v: valueFn(t) }))
        .filter(x => Number.isFinite(x.v));
      const map = Object.create(null);
      if (list.length === 0) return map;

      list.sort((a,b) => highIsBetter ? (b.v - a.v) : (a.v - b.v));

      if (list.length === 1) {
        map[list[0].t.nombre] = 1;
        return map;
      }
      const n = list.length;
      list.forEach((x,idx) => {
        const score = (n - 1 - idx) / (n - 1); // 1º ->1, último->0
        map[x.t.nombre] = score;
      });
      return map;
    };

    const getScore = (map, t) => {
      const v = map[t.nombre];
      return (v === undefined) ? 0.5 : v; // valor neutro si no hay dato
    };

    for (const j of jornadasRes) {
      const jNum = j.numero ?? j.jornada ?? null;
      const partidos = j.partidos || [];
      const teamMap = new Map();

      const getT = (name) => {
        if (!teamMap.has(name)) {
          teamMap.set(name, {
            nombre: name,
            pj:0,
            gf:0,
            gc:0,
            winScore:0,

            posSum:0,posCount:0,
            faltas:0, entradas:0, pases:0, completados:0,
            tiros:0, taPuerta:0, goles:0,
            rojas:0,
            golesEncajados:0,
            tirosRival:0
          });
        }
        return teamMap.get(name);
      };

      // Recorremos partidos de la jornada
      for (const p of partidos) {
        if (!p.local || !p.visitante) continue;

        const L = getT(p.local);
        const V = getT(p.visitante);

        const isNum = v => typeof v === 'number' && Number.isFinite(v);
        const gl = isNum(p.goles_local) ? p.goles_local : null;
        const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;

        if (gl !== null && gv !== null) {
          L.pj++; V.pj++;
          L.gf += gl; L.gc += gv;
          V.gf += gv; V.gc += gl;

          // Ganar / empatar / perder
          if (gl > gv) {
            L.winScore += 1;
          } else if (gl < gv) {
            V.winScore += 1;
          } else {
            L.winScore += 0.5;
            V.winScore += 0.5;
          }
        }

        // Stats avanzadas (partidos_stats.json)
        const matchStats = p.id ? statsIndex[p.id] : null;
        if (matchStats) {
          const equiposPartido = Object.keys(matchStats);
          for (const eqName of equiposPartido) {
            const te = matchStats[eqName] || {};
            const a = getT(eqName);

            const hasAny = [
              'posesion','faltas','entradas','pases','pases_completados',
              'tiros','tiros_a_puerta','goles','expulsiones','rojas','tarjetas_rojas'
            ].some(k => te[k] !== undefined);

            if (hasAny) {
              // pj ya lo suma resultados.json, no repetimos
            }

            const pos = parsePct01(te.posesion);
            if (pos !== null) { a.posSum += pos; a.posCount++; }

            addNum(a,'faltas',      te.faltas);
            addNum(a,'entradas',    te.entradas);
            addNum(a,'pases',       te.pases);
            addNum(a,'completados', te.pases_completados);
            addNum(a,'tiros',       te.tiros);
            addNum(a,'taPuerta',    te.tiros_a_puerta);
            addNum(a,'goles',       te.goles);
            addNum(a,'rojas',       te.expulsiones ?? te.rojas ?? te.tarjetas_rojas);

            const rivalName = equiposPartido.find(n => n !== eqName);
            if (rivalName) {
              const rivalStats = matchStats[rivalName] || {};
              addNum(a,'golesEncajados', rivalStats.goles);
              addNum(a,'tirosRival',     rivalStats.tiros_a_puerta);
            }
          }
        }
      }

      const teamsJ = Array.from(teamMap.values()).filter(t => t.pj > 0);
      if (!teamsJ.length || jNum == null) continue;

      // Rankings por métrica
      const scorePichichi = rankMetric(teamsJ, t => t.gf, { highIsBetter:true });
      const scoreZamora   = rankMetric(teamsJ, t => t.gc, { highIsBetter:false });
      const scoreWin      = rankMetric(teamsJ, t => t.winScore, { highIsBetter:true });
      const scorePos      = rankMetric(teamsJ, t => t.posCount>0 ? (t.posSum/t.posCount) : NaN, { highIsBetter:true });
      const scorePass     = rankMetric(teamsJ, t => t.pases>0 ? (t.completados/t.pases) : NaN, { highIsBetter:true });
      const scoreFair     = rankMetric(teamsJ, t => fair(t), { highIsBetter:true });
      const scoreShot     = rankMetric(teamsJ, t => combined(t), { highIsBetter:true });
      const scoreDef      = rankMetric(teamsJ, t => efectRival(t), { highIsBetter:false });

      // Score final por equipo para ESTA jornada
      for (const t of teamsJ) {
        const sPich = getScore(scorePichichi, t);
        const sZam  = getScore(scoreZamora,   t);
        const sWin  = getScore(scoreWin,      t);
        const sPos  = getScore(scorePos,      t);
        const sPass = getScore(scorePass,     t);
        const sFair = getScore(scoreFair,     t);
        const sShot = getScore(scoreShot,     t);
        const sDef  = getScore(scoreDef,      t);

        t.mvpScore = (
          0.20*sPich +
          0.20*sZam  +
          0.20*sWin  +
          0.05*sPos  +
          0.05*sPass +
          0.10*sFair +
          0.10*sShot +
          0.10*sDef
        );
      }

      // MVP de la jornada = equipo con mayor mvpScore
      teamsJ.sort((a,b) =>
        (b.mvpScore - a.mvpScore) ||
        a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})
      );
      const best = teamsJ[0];
      if (!best) continue;

      result[jNum] = {
        nombre: best.nombre,
        pj: best.pj,
        gf: best.gf,
        gc: best.gc,
        mvpScore: best.mvpScore
      };
    }

    return result;
  }

  // ==========================
  //   ORDENAMOS jornadas cfg
  // ==========================
  const jornadas = jornadasCfg.slice().sort((a,b) =>
    (a.jornada || 0) - (b.jornada || 0)
  );
  let currentIndex = jornadas.length - 1;

  // NAV jornadas ◀ Jornada X ▶
  const navWrap = document.createElement('div');
  navWrap.className = 'jornada-nav';
  navWrap.innerHTML = `
    <button id="prevJornada" class="nav-btn" type="button">◀</button>
    <span id="jornadaLabel" class="jornada-label chip"></span>
    <button id="nextJornada" class="nav-btn" type="button">▶</button>
  `;
  root.insertAdjacentElement('beforebegin', navWrap);

  const prevBtn = navWrap.querySelector('#prevJornada');
  const nextBtn = navWrap.querySelector('#nextJornada');
  const label   = navWrap.querySelector('#jornadaLabel');

  // ==========================
  //   HERO ganador votación
  // ==========================
  function renderWinnerHero(jCfg, num) {
    const poll = jCfg.poll || {};
    const winnerName   = poll.winner;
    if (!winnerName) return '';

    const teamName     = poll.winner_team || poll.team || '';
    const detail       = poll.winner_detail;

    const fotoJugador  = playerPhotoPath(winnerName);
    const escudoTeam   = teamName ? logoPath(teamName) : null;

    return `
      <div class="jornada-winner-hero">
        <div class="jornada-winner-hero-card">
          <div class="jornada-winner-photo-wrapper">
            <img
              src="${fotoJugador}"
              alt="Foto de ${winnerName}"
              class="jornada-winner-photo"
              onerror="this.style.visibility='hidden'">
          </div>
          <div class="jornada-winner-info">
            <div class="jornada-winner-label">
              Ganador votación · Jornada ${num}
            </div>
            <h3 class="jornada-winner-name">${winnerName}</h3>

            ${teamName ? `
              <div class="jornada-winner-team">
                <div class="jornada-winner-team-inner">
                  ${escudoTeam ? `
                    <img
                      src="${escudoTeam}"
                      alt="Escudo ${teamName}"
                      class="jornada-winner-team-logo"
                      onerror="this.style.visibility='hidden'">
                  ` : ''}
                  <span class="jornada-winner-team-name">${teamName}</span>
                </div>
              </div>
            ` : ''}

            ${detail ? `
              <div class="jornada-winner-detail">
                ${detail}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // ==========================
  //   HERO MVP equipo jornada
  // ==========================
  function renderMvpHero(num) {
    const mvp = mvpPorJornada[num];
    if (!mvp) return '';

    const puntos = (mvp.mvpScore * 100).toFixed(1);
    const escudo = logoPath(mvp.nombre);

    return `
      <div class="jornada-mvp-hero">
        <div class="jornada-mvp-card">
          <div class="jornada-mvp-logo-wrap">
            <img
              src="${escudo}"
              alt="Escudo ${mvp.nombre}"
              class="jornada-mvp-logo"
              onerror="this.style.visibility='hidden'">
          </div>
          <div class="jornada-mvp-info">
            <div class="jornada-mvp-label">MVP equipo · Jornada ${num}</div>
            <div class="jornada-mvp-name">${mvp.nombre}</div>
            <div class="jornada-mvp-meta">
              GF ${mvp.gf} · GC ${mvp.gc} · Puntuación MVP: ${puntos}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================
  //   RENDER PRINCIPAL
  // ==========================
  const render = () => {
    const jCfg = jornadas[currentIndex];
    if (!jCfg) return;

    const num = jCfg.jornada ?? (currentIndex + 1);
    if (label) label.textContent = `Jornada ${num}`;

    const hasWinner = !!jCfg.poll?.winner;

    // Vídeo con marco
    const videoHtml = jCfg.gol_youtube
      ? `
        <div class="video-frame">
          <iframe
            class="video"
            src="https://www.youtube.com/embed/${jCfg.gol_youtube}"
            allowfullscreen
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade">
          </iframe>
        </div>
      `
      : '<p>Próximamente…</p>';

    // Poll solo si NO hay winner
    const pollHtml = (!hasWinner && jCfg.poll?.embed_url)
      ? `
        <div class="poll-wrap">
          <h3 style="margin:16px 0 8px">Vota el mejor gol</h3>
          <div class="poll-frame">
            <iframe
              src="${jCfg.poll.embed_url}"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              allowtransparency="true">
            </iframe>
          </div>
          <p class="poll-note">* Voto limitado por IP y navegador.</p>
        </div>
      `
      : '';

    const winnerHeroHtml = hasWinner ? renderWinnerHero(jCfg, num) : '';
    const mvpHeroHtml    = renderMvpHero(num);

    root.innerHTML = `
      <section class="jornada-bloque">
        <h2>Gol de la jornada ${num}</h2>
        ${videoHtml}
        ${pollHtml}
        ${winnerHeroHtml}
        ${mvpHeroHtml}
      </section>
    `;

    // Botones prev/next
    if (prevBtn) prevBtn.disabled = currentIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentIndex >= jornadas.length - 1;
  };

  prevBtn?.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex--;
      render();
    }
  });
  nextBtn?.addEventListener('click', () => {
    if (currentIndex < jornadas.length - 1) {
      currentIndex++;
      render();
    }
  });

  // Render inicial (última jornada)
  render();
})();
