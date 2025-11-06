// js/clasificacion_division.js
(async () => {
  const tbody = document.getElementById('tabla-clasificacion');
  if (!tbody) return;

  const divisionPath = document.body?.dataset?.division; // p.ej. data/division-primera.json
  if (!divisionPath) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#9fb3c8;padding:14px">Falta data-division en el &lt;body&gt;</td></tr>`;
    return;
  }

  const showMsg = (txt) => {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#9fb3c8;padding:14px">${txt}</td></tr>`;
  };

  const loadJSON = async (p) => (await fetch(p, { cache: 'no-store' })).json();

  // ===== Helpers =====
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const norm = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim();
  const slug = s => norm(s).replace(/\s+/g,'-');
  const dg = e => e.gf - e.gc;

  // ===== Carga datos =====
  let jornadas;
  try { jornadas = await loadJSON('data/resultados.json'); } catch { jornadas = null; }
  if (!Array.isArray(jornadas)) return showMsg('No se pudieron cargar los resultados.');

  let division;
  try { division = await loadJSON(divisionPath); } catch { division = null; }
  if (!division?.equipos?.length) return showMsg('El archivo de división no contiene equipos.');

  const lista = division.equipos.map(n => String(n||'').trim());
  const setDivNorm = new Set(lista.map(norm));
  const nombreDivision = division.nombre || 'División';

  // Detecta última jornada jugada dentro de la división
  let lastPlayed = 0;
  jornadas.forEach((j, idx) => {
    const jugada = (j.partidos||[]).some(p =>
      p.local && p.visitante &&
      setDivNorm.has(norm(p.local)) &&
      setDivNorm.has(norm(p.visitante)) &&
      isNum(p.goles_local) && isNum(p.goles_visitante)
    );
    if (jugada) lastPlayed = idx + 1;
  });
  if (lastPlayed === 0) return showMsg(`Aún no hay partidos jugados en ${nombreDivision}.`);

  // ===== Crea barra de navegación (antes de usar jornadaLabel)
  const navWrap = document.createElement('div');
  navWrap.className = 'jornada-nav';
  navWrap.innerHTML = `
    <button id="prevJornada" class="nav-btn">◀</button>
    <span id="jornadaLabel"></span>
    <button id="nextJornada" class="nav-btn">▶</button>
  `;
  // se inserta encima de la tabla
  tbody.parentElement.insertAdjacentElement('beforebegin', navWrap);

  const labelDiv = document.getElementById('jornadaLabel'); // <-- ahora sí existe
  const prevBtn  = document.getElementById('prevJornada');
  const nextBtn  = document.getElementById('nextJornada');

  // ===== Cálculo de clasificación hasta jornada N (solo partidos entre la división)
  const calcularClasificacion = (hasta) => {
    const teams = new Map();
    const teamObj = (name) => {
      const k = norm(name);
      if (!teams.has(k)) teams.set(k, { nombre:name, pj:0,g:0,e:0,p:0,gf:0,gc:0,pts:0 });
      return teams.get(k);
    };
    const h2h = {};
    const addH2H = (A,B,gfA,gfB) => {
      const a=norm(A), b=norm(B);
      (h2h[a] ||= {}); (h2h[a][b] ||= {gf:0,gc:0});
      h2h[a][b].gf += gfA; h2h[a][b].gc += gfB;
    };

    // Inicializa todos los equipos de la división
    lista.forEach(n => teamObj(n));

    for (let i=0; i<hasta; i++) {
      const j = jornadas[i];
      for (const p of (j?.partidos || [])) {
        if (!p.local || !p.visitante) continue;
        if (!setDivNorm.has(norm(p.local)) || !setDivNorm.has(norm(p.visitante))) continue;

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

  // ===== Render
  const render = (equipos, jNum) => {
    if (labelDiv) labelDiv.textContent = `${nombreDivision} — Jornada ${jNum}`;
// tras cargar `division`
const tiers = division?.tiers || null;

const tierClass = (i, len) => {
  if (tiers) {
    const topN = Math.max(0, Math.min(len, +tiers.top || 0));
    const midN = Math.max(0, Math.min(len - topN, +tiers.mid || 0));
    const botN = Math.max(0, Math.min(len - topN - midN, +tiers.bottom || 0));

    if (i < topN) return 'tier-top';
    if (i < topN + midN) return 'tier-mid';
    if (i >= len - botN) return 'tier-bottom';
    return '';
  }
  // fallback (tu lógica antigua)
  if (i < 8) return 'tier-top';
  if (i < 12) return 'tier-mid';
  if (i >= len - 4) return 'tier-bottom';
  return '';
};
    const logoPath = (name) => `img/${slug(name)}.png`;

    tbody.innerHTML = equipos.map((e,i)=>`
      <tr class="${tierClass(i,equipos.length)}">
        <td>${i+1}</td>
        <td class="team-cell">
          <img class="team-badge" src="${logoPath(e.nombre)}" alt="Escudo ${e.nombre}" onerror="this.style.visibility='hidden'">
          <span>${e.nombre}</span>
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
  };

  // ===== Navegación
  let current = lastPlayed;
  const update = () => {
    const equipos = calcularClasificacion(current);
    render(equipos, current);
    if (prevBtn) prevBtn.disabled = current <= 1;
    if (nextBtn) nextBtn.disabled = current >= lastPlayed;
  };

  if (prevBtn) prevBtn.addEventListener('click',()=>{ if(current>1){current--;update();} });
  if (nextBtn) nextBtn.addEventListener('click',()=>{ if(current<lastPlayed){current++;update();} });

  update();
})();
