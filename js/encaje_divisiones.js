// js/encaje_divisiones.js
(async () => {
  const tbody = document.getElementById('tabla-encaje');
  const msgEl = document.getElementById('encaje-msg');
  const minPJInput = document.getElementById('min-pj-total');
  if (!tbody) return;

  const showMsg = (t) => { if (msgEl) msgEl.textContent = t || ''; };

  // ---------- Helpers ----------
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const norm = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim();

  // Puntos por partido, GD por partido
  const ppm = (pts, pj) => pj > 0 ? pts / pj : 0;
  const gdpm = (gf, gc, pj) => pj > 0 ? (gf - gc) / pj : 0;

  // Carga JSON
  const loadJSON = async (p) => (await fetch(p)).json();

  // ---------- Carga de datos ----------
  let jornadas, d1, d2;
  try { jornadas = await loadJSON('data/resultados.json'); } catch { jornadas = null; }
  try { d1 = await loadJSON('data/division-primera.json'); } catch { d1 = null; }
  try { d2 = await loadJSON('data/division-segunda.json'); } catch { d2 = null; }

  if (!Array.isArray(jornadas)) { showMsg('No se pudieron cargar los resultados.'); return; }

  const primera = new Set((d1?.equipos || []).map(e => e.trim()));
  const segunda = new Set((d2?.equipos || []).map(e => e.trim()));
  const primeraN = new Set(Array.from(primera).map(norm));
  const segundaN = new Set(Array.from(segunda).map(norm));

  // Jugadores conocidos (en alguna división)
  const allPlayers = new Set([...primera, ...segunda]);

  // ---------- Acumuladores por jugador y división ----------
  // estructura: stats[jugadorNorm] = { nombre, D1:{pj, pts, gf, gc}, D2:{...}, divActual:'D1'|'D2'|null }
  const stats = new Map();
  const get = (name) => {
    const k = norm(name);
    if (!stats.has(k)) stats.set(k, {
      nombre: name,
      divActual: primeraN.has(k) ? 'D1' : (segundaN.has(k) ? 'D2' : null),
      D1: { pj:0, pts:0, gf:0, gc:0 },
      D2: { pj:0, pts:0, gf:0, gc:0 },
    });
    return stats.get(k);
  };

  // Inicializa todos
  for (const p of allPlayers) get(p);

  // Recorre calendario y suma por división correspondiente del rival (solo cuenta partidos reales)
  for (const j of jornadas) for (const p of (j.partidos || [])) {
    if (!p.local || !p.visitante) continue;
    const gl = isNum(p.goles_local) ? p.goles_local : null;
    const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
    if (gl === null || gv === null) continue; // no jugado

    const L = get(p.local);
    const V = get(p.visitante);

    // puntos del partido
    let ptsL=0, ptsV=0;
    if (gl > gv) { ptsL = 3; }
    else if (gl < gv) { ptsV = 3; }
    else { ptsL = 1; ptsV = 1; }

    // Decide en qué división contamos para cada jugador:
    // Su "divActual" determina si esas cifras se suman a D1 o D2 (evaluamos encaje en su división actual).
    const bucketL = L.divActual === 'D1' ? L.D1 : (L.divActual === 'D2' ? L.D2 : null);
    const bucketV = V.divActual === 'D1' ? V.D1 : (V.divActual === 'D2' ? V.D2 : null);

    if (bucketL) {
      bucketL.pj += 1; bucketL.pts += ptsL; bucketL.gf += gl; bucketL.gc += gv;
    }
    if (bucketV) {
      bucketV.pj += 1; bucketV.pts += ptsV; bucketV.gf += gv; bucketV.gc += gl;
    }
  }

  // ---------- Etiquetado ----------
  const hardRules = (row) => {
    const { D1, D2, divActual } = row;
    const PPM1 = ppm(D1.pts, D1.pj);
    const PPM2 = ppm(D2.pts, D2.pj);
    const GD1 = gdpm(D1.gf, D1.gc, D1.pj);
    const GD2 = gdpm(D2.gf, D2.gc, D2.pj);

    // A) Debe estar en Primera (domina Segunda)
    if (D2.pj >= 3 && (PPM2 >= 2.2 && GD2 > 1.0)) return { tag:'Primera', cls:'b-primera' };

    // B) Claramente Segunda (muy flojo en Primera o cero puntos con muestra)
    if (D1.pj >= 2 && (PPM1 < 0.5 || GD1 < -0.5)) return { tag:'Segunda', cls:'b-segunda' };
    if (D1.pj >= 2 && D1.pts === 0) return { tag:'Segunda', cls:'b-segunda' };

    return null; // no se aplica regla dura
  };

  const softRules = (row) => {
    const { D1, D2, divActual } = row;
    const PPM1 = ppm(D1.pts, D1.pj);
    const PPM2 = ppm(D2.pts, D2.pj);
    const GD1 = gdpm(D1.gf, D1.gc, D1.pj);
    const GD2 = gdpm(D2.gf, D2.gc, D2.pj);

    // Sin datos suficientes
    if ((D1.pj + D2.pj) < 2) return { tag:'Dudoso', cls:'b-dudoso' };

    // Si está en Primera
    if (divActual === 'D1') {
      if (D1.pj >= 3 && PPM1 >= 1.3) return { tag:'Primera', cls:'b-primera' };
      if (D1.pj >= 2 && (PPM1 <= 1.0 || GD1 < 0)) return { tag:'Apto segunda', cls:'b-apto2' };
      return { tag:'Dudoso', cls:'b-dudoso' };
    }

    // Si está en Segunda
    if (divActual === 'D2') {
      if (D2.pj >= 3 && PPM2 >= 1.3) return { tag:'Apto primera', cls:'b-apto1' };
      if (D2.pj >= 2 && (PPM2 <= 0.8 && GD2 < 0)) return { tag:'Segunda', cls:'b-segunda' };
      return { tag:'Dudoso', cls:'b-dudoso' };
    }

    // Sin división asignada
    return { tag:'Dudoso', cls:'b-dudoso' };
  };

  const confidence = (row) => {
    const pjTot = row.D1.pj + row.D2.pj;
    return Math.min(1, pjTot / 6); // 6 partidos → 100% (ajustable)
  };

  const toRow = (k, r) => {
    const PPM1 = ppm(r.D1.pts, r.D1.pj);
    const PPM2 = ppm(r.D2.pts, r.D2.pj);
    const GD1 = gdpm(r.D1.gf, r.D1.gc, r.D1.pj);
    const GD2 = gdpm(r.D2.gf, r.D2.gc, r.D2.pj);
    const brecha = PPM1 - PPM2;

    const hard = hardRules(r);
    const soft = softRules(r);
    const chosen = hard || soft;

    const conf = confidence(r);

    return {
      nombre: r.nombre,
      D1pj: r.D1.pj, D1ppm: PPM1, D1gd: GD1,
      D2pj: r.D2.pj, D2ppm: PPM2, D2gd: GD2,
      brecha, conf,
      tag: chosen.tag, cls: chosen.cls
    };
  };

  // ---------- Render ----------
  function render() {
    const minPJ = Math.max(0, parseInt(minPJInput.value || '0', 10));

    const rows = Array.from(stats.values())
      .map((r, i) => toRow(i, r))
      .filter(r => (r.D1pj + r.D2pj) >= minPJ);

    // Orden sugerido: etiqueta (Primera/Apto1/Dudoso/Apto2/Segunda) → conf desc → PPM de su división actual desc
    const rankTag = t => ({'Primera':0,'Apto primera':1,'Dudoso':2,'Apto segunda':3,'Segunda':4})[t] ?? 5;

    rows.sort((a,b)=>{
      if (rankTag(a.tag) !== rankTag(b.tag)) return rankTag(a.tag) - rankTag(b.tag);
      if (b.conf !== a.conf) return b.conf - a.conf;
      const aMain = a.D1pj >= a.D2pj ? a.D1ppm : a.D2ppm;
      const bMain = b.D1pj >= b.D2pj ? b.D1ppm : b.D2ppm;
      if (bMain !== aMain) return bMain - aMain;
      return a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'});
    });

    if (!rows.length) {
      tbody.innerHTML = '';
      showMsg('No hay datos con el filtro actual.');
      return;
    }

    showMsg('');
    tbody.innerHTML = rows.map((r,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${r.nombre}</td>
        <td>${r.D1pj}</td><td>${r.D1ppm.toFixed(2)}</td><td>${r.D1gd.toFixed(2)}</td>
        <td>${r.D2pj}</td><td>${r.D2ppm.toFixed(2)}</td><td>${r.D2gd.toFixed(2)}</td>
        <td>${r.brecha.toFixed(2)}</td>
        <td>${Math.round(r.conf*100)}%</td>
        <td><span class="badge ${r.cls}">${r.tag}</span></td>
      </tr>
    `).join('');
  }

  // Inicial y eventos
  render();
  minPJInput.addEventListener('input', render);
})();
