(async () => {
  const tbody = document.getElementById('tabla-clasificacion');
  const labelDiv = document.getElementById('jornadaLabel');
  if (!tbody || !labelDiv) return;

  const divisionPath = document.body?.dataset?.division; // p.ej. data/division-primera.json
  if (!divisionPath) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#9fb3c8;padding:14px">Falta data-division en el &lt;body&gt;</td></tr>`;
    return;
  }

  const showMsg = (txt) => {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#9fb3c8;padding:14px">${txt}</td></tr>`;
  };

  const loadJSON = async (p) => (await fetch(p)).json();

  // ======== Helpers ========
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const norm = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim();
  const slug = s => norm(s).replace(/\s+/g,'-');
  const dg = e => e.gf - e.gc;

  // ======== Carga datos base ========
  let jornadas;
  try {
    jornadas = await loadJSON('data/resultados.json');
  } catch { jornadas = null; }
  if (!Array.isArray(jornadas)) return showMsg('No se pudieron cargar los resultados.');

  let division;
  try {
    division = await loadJSON(divisionPath);
  } catch { division = null; }
  // ✅ Normaliza nombres de división para que coincidan con los del calendario
  const listaRaw = Array.isArray(division?.equipos) ? division.equipos : [];
  const lista = listaRaw.map(n => String(n || '').trim());
  const setDivNorm = new Set(lista.map(norm));
  const nombreDivision = division?.nombre || 'División';

  // Detecta última jornada jugada **dentro de la división** (al menos un partido con ambos equipos en la lista)
  let lastPlayed = 0;
  jornadas.forEach((j, idx) => {
    const jugada = (j.partidos||[]).some(p =>
      p.local && p.visitante &&
      setDiv.has(String(p.local)) && setDiv.has(String(p.visitante)) &&
      isNum(p.goles_local) && isNum(p.goles_visitante)
    );
    if (jugada) lastPlayed = idx + 1;
  });
  if (lastPlayed === 0) return showMsg(`Aún no hay partidos jugados en ${nombreDivision}.`);

  // crea barra de navegación (igual que tu página original)
  const navWrap = document.createElement('div');
  navWrap.className = 'jornada-nav';
  navWrap.innerHTML = `
    <button id="prevJornada" class="nav-btn">◀</button>
    <span id="jornadaLabel"></span>
    <button id="nextJornada" class="nav-btn">▶</button>
  `;
  tbody.parentElement.insertAdjacentElement('beforebegin', navWrap);

  const prevBtn = document.getElementById('prevJornada');
  const nextBtn = document.getElementById('nextJornada');

  // ======== Cálculo clasificación hasta cierta jornada (filtrando por división) ========
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

    // Inicializa todos los equipos de la división para que aparezcan aunque aún no tengan PJ
    lista.forEach(n => teamObj(n));

    for (let i=0; i<hasta; i++) {
      const j = jornadas[i];
      for (const p of (j?.partidos || [])) {
        if (!p.local || !p.visitante) continue;
        // ❗ solo cuentan partidos donde ambos están en la división
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

  // ======== Render ========
  const render = (equipos, jNum) => {
    labelDiv.textContent = `${nombreDivision} — Jornada ${jNum}`;
    const tierClass = (i, len) => (
      i < 8 ? 'tier-top' : (i < 12 ? 'tier-mid' : (i >= len-4 ? 'tier-bottom' : ''))
    );
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

  // ======== Navegación ========
  let current = lastPlayed;
  const update = () => {
    const equipos = calcularClasificacion(current);
    render(equipos, current);
    document.getElementById('prevJornada').disabled = current <= 1;
    document.getElementById('nextJornada').disabled = current >= lastPlayed;
  };
  document.getElementById('prevJornada').addEventListener('click',()=>{ if(current>1){current--;update();} });
  document.getElementById('nextJornada').addEventListener('click',()=>{ if(current<lastPlayed){current++;update();} });

  update();
})();
