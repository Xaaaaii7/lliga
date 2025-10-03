(async () => {
  const tbody = document.getElementById('tabla-clasificacion');
  if (!tbody) return;

  const showMsg = (txt) => {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#9fb3c8;padding:14px">${txt}</td></tr>`;
  };

  // Carga resultados
  const jornadas = await loadJSON('data/resultados.json').catch(() => null);
  if (!Array.isArray(jornadas)) return showMsg('No se pudieron cargar los resultados.');

  // Normalizador base
  const norm = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim();

  // Para nombre de archivo: espacios -> guiones
  const slug = s => norm(s).replace(/\s+/g,'-');

  // 1) Detecta TODOS los equipos presentes en todo el calendario
  const allTeams = new Set();
  for (const j of jornadas) for (const p of (j?.partidos || [])) {
    if (p?.local) allTeams.add(p.local);
    if (p?.visitante) allTeams.add(p.visitante);
  }

  // (Opcional) añadir los de jugadores.json
  try {
    const jug = await loadJSON('data/jugadores.json');
    const lista = jug?.equipos || [];
    for (const e of lista) if (e?.nombre) allTeams.add(e.nombre);
  } catch {}

  // 2) Stats por equipo + índice H2H
  const teams = new Map(); // key norm -> stats
  const teamObj = (name) => {
    const k = norm(name);
    if (!teams.has(k)) {
      teams.set(k, { nombre: name, pj:0, g:0, e:0, p:0, gf:0, gc:0, pts:0 });
    }
    return teams.get(k);
  };

  // Inicializa TODOS
  for (const name of allTeams) teamObj(name);

  // H2H: h2h[a][b] = {gf,gc}
  const h2h = {};
  const addH2H = (A,B,gfA,gfB) => {
    const a = norm(A), b = norm(B);
    (h2h[a] ||= {}); (h2h[a][b] ||= { gf:0, gc:0 });
    h2h[a][b].gf += gfA; h2h[a][b].gc += gfB;
  };

  // 3) Recorrer y acumular solo si hay marcador numérico
  const isNum = v => typeof v === 'number' && Number.isFinite(v);

  for (const j of jornadas) for (const p of (j?.partidos || [])) {
    if (!p?.local || !p?.visitante) continue;
    const L = teamObj(p.local);
    const V = teamObj(p.visitante);

    const gl = isNum(p.goles_local) ? p.goles_local : null;
    const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
    if (gl === null || gv === null) continue;

    L.pj++; V.pj++;
    L.gf += gl; L.gc += gv;
    V.gf += gv; V.gc += gl;

    if (gl > gv) { L.g++; L.pts += 3; V.p++; }
    else if (gl < gv) { V.g++; V.pts += 3; L.p++; }
    else { L.e++; V.e++; L.pts++; V.pts++; }

    addH2H(p.local, p.visitante, gl, gv);
    addH2H(p.visitante, p.local, gv, gl);
  }

  const equipos = Array.from(teams.values());
  if (!equipos.length) return showMsg('No hay equipos.');

  const dg = e => e.gf - e.gc;

  // 4) Orden: Pts → H2H (dif) → DG → GF → alfabético
  equipos.sort((A,B) => {
    if (B.pts !== A.pts) return B.pts - A.pts;

    const a = norm(A.nombre), b = norm(B.nombre);
    const ha = h2h[a]?.[b], hb = h2h[b]?.[a];
    if (ha && hb) {
      const difA = (ha.gf||0) - (ha.gc||0);
      const difB = (hb.gf||0) - (hb.gc||0);
      if (difA !== difB) return difB - difA;
    }

    const dA = dg(A), dB = dg(B);
    if (dA !== dB) return dB - dA;
    if (B.gf !== A.gf) return B.gf - A.gf;
    return A.nombre.localeCompare(B.nombre, 'es', { sensitivity:'base' });
  });

  // 5) Render con colores + escudo
  const tierClass = (i, len) => (
    i < 3 ? 'tier-top' : (i < 6 ? 'tier-mid' : (i >= len-3 ? 'tier-bottom' : ''))
  );
  const logoPath = (name) => `img/${slug(name)}.png`;

  tbody.innerHTML = equipos.map((e,i)=>`
    <tr class="${tierClass(i, equipos.length)}">
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
})();
