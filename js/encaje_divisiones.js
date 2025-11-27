// js/encaje_divisiones.js (corregido)
(async () => {
  const tbody = document.getElementById('tabla-encaje');
  const msgEl = document.getElementById('encaje-msg');
  const minPJInput = document.getElementById('min-pj-total');
  if (!tbody) return;

  const showMsg = (t) => { if (msgEl) msgEl.textContent = t || ''; };

  // ---------- Helpers ----------
  const { loadJSON, normalizeText } = window.AppUtils || {};
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const norm = normalizeText || (s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim());

  const ppm = (pts, pj) => pj > 0 ? pts / pj : 0;
  const gdpm = (gf, gc, pj) => pj > 0 ? (gf - gc) / pj : 0;

  const fetchJSON = loadJSON || (async (p) => (await fetch(p)).json());

  // ---------- Carga de datos ----------
  let jornadas, d1, d2;
  try { jornadas = await fetchJSON('data/resultados.json'); } catch { jornadas = null; }
  try { d1 = await fetchJSON('data/division-primera.json'); } catch { d1 = null; }
  try { d2 = await fetchJSON('data/division-segunda.json'); } catch { d2 = null; }

  if (!Array.isArray(jornadas)) { showMsg('No se pudieron cargar los resultados.'); return; }

  const primera = new Set((d1?.equipos || []).map(e => String(e).trim()));
  const segunda = new Set((d2?.equipos || []).map(e => String(e).trim()));
  const primeraN = new Set(Array.from(primera).map(norm));
  const segundaN = new Set(Array.from(segunda).map(norm));

  // Jugadores a considerar = unión de ambas listas
  const allPlayers = new Set([...primera, ...segunda]);

  // ---------- Acumuladores por jugador ----------
  // Cada jugador tiene DOS buckets:
  //  - D1: partidos del jugador CONTRA rivales de Primera
  //  - D2: partidos del jugador CONTRA rivales de Segunda
  const stats = new Map();
  const ensure = (name) => {
    const k = norm(name);
    if (!stats.has(k)) stats.set(k, {
      nombre: name,
      D1: { pj:0, pts:0, gf:0, gc:0 },
      D2: { pj:0, pts:0, gf:0, gc:0 },
    });
    return stats.get(k);
  };
  for (const p of allPlayers) ensure(p);

  // ---------- Recorrido del calendario ----------
  for (const j of jornadas) for (const p of (j.partidos || [])) {
    if (!p.local || !p.visitante) continue;
    const gl = isNum(p.goles_local) ? p.goles_local : null;
    const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
    if (gl === null || gv === null) continue; // no jugado

    const loc = String(p.local).trim();
    const vis = String(p.visitante).trim();

    const L = ensure(loc);
    const V = ensure(vis);

    // puntos del partido
    let ptsL=0, ptsV=0;
    if (gl > gv) { ptsL = 3; }
    else if (gl < gv) { ptsV = 3; }
    else { ptsL = 1; ptsV = 1; }

    // --- Bucket para el LOCAL: según división del RIVAL (visitante) ---
    const visN = norm(vis);
    const bucketL =
      primeraN.has(visN) ? L.D1 :
      (segundaN.has(visN) ? L.D2 : null);
    if (bucketL) {
      bucketL.pj += 1;
      bucketL.pts += ptsL;
      bucketL.gf  += gl;
      bucketL.gc  += gv;
    }

    // --- Bucket para el VISITANTE: según división del RIVAL (local) ---
    const locN = norm(loc);
    const bucketV =
      primeraN.has(locN) ? V.D1 :
      (segundaN.has(locN) ? V.D2 : null);
    if (bucketV) {
      bucketV.pj += 1;
      bucketV.pts += ptsV;
      bucketV.gf  += gv;
      bucketV.gc  += gl;
    }
  }

  // ---------- Reglas ----------
  const hardRules = (row) => {
    const { D1, D2 } = row;
    const PPM1 = ppm(D1.pts, D1.pj);
    const PPM2 = ppm(D2.pts, D2.pj);
    const GD1 = gdpm(D1.gf, D1.gc, D1.pj);
    const GD2 = gdpm(D2.gf, D2.gc, D2.pj);

    // Dominio claro en Segunda -> subir
    if (D2.pj >= 3 && (PPM2 >= 2.2 && GD2 > 1.0)) return { tag:'Primera', cls:'b-primera' };

    // Muy flojo vs Primera -> Segunda
    if (D1.pj >= 2 && (PPM1 < 0.5 || GD1 < -0.5)) return { tag:'Segunda', cls:'b-segunda' };
    if (D1.pj >= 2 && D1.pts === 0) return { tag:'Segunda', cls:'b-segunda' };

    return null;
  };

  const softRules = (row) => {
    const { D1, D2 } = row;
    const PPM1 = ppm(D1.pts, D1.pj);
    const PPM2 = ppm(D2.pts, D2.pj);
    const GD1 = gdpm(D1.gf, D1.gc, D1.pj);
    const GD2 = gdpm(D2.gf, D2.gc, D2.pj);

    const pjTot = D1.pj + D2.pj;
    if (pjTot < 2) return { tag:'Dudoso', cls:'b-dudoso' };

    // Si rinde bien vs Primera -> “Primera”
    if (D1.pj >= 3 && PPM1 >= 1.3) return { tag:'Primera', cls:'b-primera' };

    // Si rinde flojo vs Primera y mejor vs Segunda -> “Apto segunda”
    if (D1.pj >= 2 && (PPM1 <= 1.0 || GD1 < 0)) return { tag:'Apto segunda', cls:'b-apto2' };

    // Si rinde muy bien vs Segunda pero pocos datos vs Primera -> “Apto primera”
    if (D2.pj >= 3 && PPM2 >= 1.3) return { tag:'Apto primera', cls:'b-apto1' };

    return { tag:'Dudoso', cls:'b-dudoso' };
  };

  const confidence = (row) => {
    const pjTot = row.D1.pj + row.D2.pj;
    return Math.min(1, pjTot / 6);
  };

  const toRow = (r) => {
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
    const minPJ = Math.max(0, parseInt(minPJInput?.value || '0', 10));

    const rows = Array.from(stats.values())
      .map(r => toRow(r))
      .filter(r => (r.D1pj + r.D2pj) >= minPJ);

    const rankTag = t => ({'Primera':0,'Apto primera':1,'Dudoso':2,'Apto segunda':3,'Segunda':4})[t] ?? 5;

    rows.sort((a,b)=>{
      if (rankTag(a.tag) !== rankTag(b.tag)) return rankTag(a.tag) - rankTag(b.tag);
      if (b.conf !== a.conf) return b.conf - a.conf;
      // desempate por mejor PPM (el mayor de sus dos)
      const aBest = Math.max(a.D1ppm, a.D2ppm);
      const bBest = Math.max(b.D1ppm, b.D2ppm);
      if (bBest !== aBest) return bBest - aBest;
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

  render();
  minPJInput?.addEventListener('input', render);
})();
