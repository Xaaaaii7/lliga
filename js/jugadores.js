(async () => {
  // ---------- Pichichi/Zamora por EQUIPO desde resultados.json ----------
  const jornadas = await loadJSON('data/resultados.json').catch(() => null);
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s-]/g,'').trim();
  const teams = new Map(); // norm -> {nombre,pj,gf,gc}
  const getTeam = name => { const k = norm(name); if (!teams.has(k)) teams.set(k, { nombre:name, pj:0, gf:0, gc:0 }); return teams.get(k); };

if (Array.isArray(jornadas)) {
  for (const j of jornadas) for (const p of (j.partidos||[])) {
    if (!p.local || !p.visitante) continue;
    const L = getTeam(p.local), V = getTeam(p.visitante);

    // ✅ igual que arriba
    const isNum = v => typeof v === 'number' && Number.isFinite(v);
    const gl = isNum(p.goles_local) ? p.goles_local : null;
    const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
    if (gl === null || gv === null) continue;

    L.pj++; V.pj++;
    L.gf += gl; L.gc += gv;
    V.gf += gv; V.gc += gl;
  }
}

  const dg = t => t.gf - t.gc;
  const equiposArr = Array.from(teams.values());
  const pichichiEq = equiposArr.slice().sort((a,b)=> b.gf - a.gf || (dg(b)-dg(a)) || (a.gc-b.gc) || a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
  const zamoraEq   = equiposArr.slice().sort((a,b)=> a.gc - b.gc || (dg(b)-dg(a)) || (b.gf-a.gf) || a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
  const rowEq = (t,i)=>`<tr><td>${i+1}</td><td>${t.nombre}</td><td>${t.pj}</td><td>${t.gf}</td><td>${t.gc}</td><td>${dg(t)}</td></tr>`;
  const tp = document.getElementById('tabla-pichichi'); if (tp) tp.innerHTML = pichichiEq.map(rowEq).join('');
  const tz = document.getElementById('tabla-zamora');   if (tz) tz.innerHTML = zamoraEq.map(rowEq).join('');

  // ---------- NUEVO: Rankings por EQUIPO desde partidos_stats.json ----------
  const statsIndex = await loadJSON('data/partidos_stats.json').catch(()=>null);

  // 🛟 Si no hay datos de stats, muestra “No hay datos aún” en las 4 tablas y sal.
  const showEmpty = (id, cols) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:#9fb3c8;padding:12px">No hay datos aún</td></tr>`;
  };
  if (!statsIndex || !Object.keys(statsIndex).length) {
    showEmpty('tabla-posesion-eq', 4);
    showEmpty('tabla-fairplay-eq', 6);
    showEmpty('tabla-pass-eq',     6);
    showEmpty('tabla-shot-eq',     7);
    return;
  }

  // Acumuladores por equipo
  const agg = new Map(); // nombreEquipo -> { pj:0,posSum:0,posCount:0,faltas:0,entradas:0,pases:0,completados:0,tiros:0,taPuerta:0,goles:0 }
  const teamAgg = (name) => {
    if (!agg.has(name)) agg.set(name, { nombre:name, pj:0, posSum:0, posCount:0, faltas:0, entradas:0, pases:0, completados:0, tiros:0, taPuerta:0, goles:0 });
    return agg.get(name);
  };
  const parsePct = v => {
    if (typeof v === 'string' && v.includes('%')) return parseFloat(v);
    const n = +v; return Number.isFinite(n) ? n : null;
  };
  const addNum = (o, k, v) => { o[k] += (Number.isFinite(+v) ? +v : 0); };

  for (const matchId of Object.keys(statsIndex)) {
    const porEquipo = statsIndex[matchId] || {};
    for (const eqName of Object.keys(porEquipo)) {
      const te = porEquipo[eqName] || {};
      const a = teamAgg(eqName);
      const hasAny = ['posesion','faltas','entradas','pases','pases_completados','tiros','tiros_a_puerta','goles']
        .some(k => te[k] !== undefined);
      if (hasAny) a.pj++;

      const pos = parsePct(te.posesion);
      if (pos !== null) { a.posSum += pos; a.posCount++; }

      addNum(a,'faltas', te.faltas);
      addNum(a,'entradas', te.entradas);
      addNum(a,'pases', te.pases);
      addNum(a,'completados', te.pases_completados);
      addNum(a,'tiros', te.tiros);
      addNum(a,'taPuerta', te.tiros_a_puerta);
      addNum(a,'goles', te.goles);
    }
  }

  const arr = Array.from(agg.values());

  // Métricas por equipo
  const posMed = t => t.posCount>0 ? (t.posSum / t.posCount) : NaN;                    // %
  const fair   = t => ((t.entradas||0)+1) / ((t.faltas||0)+1);                         // ↑ mejor
  const pass   = t => t.pases>0 ? (t.completados / t.pases) : NaN;                      // 0..1
  const shot   = t => t.tiros>0 ? ((t.taPuerta||0)+(t.goles||0)) / t.tiros : NaN;       // 0..>1
  const fmtPct = v => isNaN(v) ? '—' : (v*100).toFixed(1) + '%';

  const TOP = 20;
  const posesionTop = arr.filter(t=>!isNaN(posMed(t))).sort((a,b)=> posMed(b)-posMed(a)).slice(0,TOP);
  const fairTop     = arr.slice().sort((a,b)=> fair(b)-fair(a)).slice(0,TOP);
  const passTop     = arr.filter(t=>!isNaN(pass(t))).sort((a,b)=> pass(b)-pass(a)).slice(0,TOP);
  const shotTop     = arr.filter(t=>!isNaN(shot(t))).sort((a,b)=> shot(b)-shot(a)).slice(0,TOP);

  const rPos  = (t,i)=> `<tr><td>${i+1}</td><td>${t.nombre}</td><td>${t.pj}</td><td>${isNaN(posMed(t))?'—':posMed(t).toFixed(1)+'%'}</td></tr>`;
  const rFair = (t,i)=> `<tr><td>${i+1}</td><td>${t.nombre}</td><td>${t.pj}</td><td>${t.entradas}</td><td>${t.faltas}</td><td>${fair(t).toFixed(2)}</td></tr>`;
  const rPass = (t,i)=> `<tr><td>${i+1}</td><td>${t.nombre}</td><td>${t.pj}</td><td>${t.pases}</td><td>${t.completados}</td><td>${fmtPct(pass(t))}</td></tr>`;
  const rShot = (t,i)=> `<tr><td>${i+1}</td><td>${t.nombre}</td><td>${t.pj}</td><td>${t.tiros}</td><td>${t.taPuerta}</td><td>${t.goles}</td><td>${fmtPct(shot(t))}</td></tr>`;

  const set = (id, rows) => { const el = document.getElementById(id); if (el) el.innerHTML = rows.join(''); };
  // Si no hay TOPs, pinta vacío en cada tabla
  set('tabla-posesion-eq', posesionTop.length ? posesionTop.map(rPos) : [`<tr><td colspan="4" style="text-align:center;color:#9fb3c8;padding:12px">No hay datos aún</td></tr>`]);
  set('tabla-fairplay-eq', fairTop.length     ? fairTop.map(rFair)   : [`<tr><td colspan="6" style="text-align:center;color:#9fb3c8;padding:12px">No hay datos aún</td></tr>`]);
  set('tabla-pass-eq',     passTop.length     ? passTop.map(rPass)   : [`<tr><td colspan="6" style="text-align:center;color:#9fb3c8;padding:12px">No hay datos aún</td></tr>`]);
  set('tabla-shot-eq',     shotTop.length     ? shotTop.map(rShot)   : [`<tr><td colspan="7" style="text-align:center;color:#9fb3c8;padding:12px">No hay datos aún</td></tr>`]);
})();
