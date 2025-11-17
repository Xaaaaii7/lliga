(async () => {
  const root = document.getElementById('jugadores');

  // ---------- Tabs Jugadores ----------
  if (root) {
    const tabsContainer = root.querySelector('.tabs-jugadores');
    const tabButtons = tabsContainer?.querySelectorAll('button') || [];
    const panels = root.querySelectorAll('.tab-panel');

    const switchTab = (id) => {
      panels.forEach(p => {
        p.classList.toggle('active', p.id === id);
      });
      tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === id);
      });
    };

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.tab;
        if (id) switchTab(id);
      });
    });
  }

  // ---------- Pichichi/Zamora por EQUIPO desde resultados.json ----------
  const jornadas = await loadJSON('data/resultados.json').catch(() => null);

  const norm = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim();
  const slug = s => norm(s).replace(/\s+/g,'-');
  const logoPath = name => `img/${slug(name)}.png`;

  const teams = new Map(); // norm -> {nombre,pj,gf,gc}
  const getTeam = name => {
    const k = norm(name);
    if (!teams.has(k)) teams.set(k, { nombre:name, pj:0, gf:0, gc:0 });
    return teams.get(k);
  };

  if (Array.isArray(jornadas)) {
    for (const j of jornadas) {
      for (const p of (j.partidos||[])) {
        if (!p.local || !p.visitante) continue;
        const L = getTeam(p.local), V = getTeam(p.visitante);

        const isNum = v => typeof v === 'number' && Number.isFinite(v);
        const gl = isNum(p.goles_local) ? p.goles_local : null;
        const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
        if (gl === null || gv === null) continue; // no jugado

        L.pj++; V.pj++;
        L.gf += gl; L.gc += gv;
        V.gf += gv; V.gc += gl;
      }
    }
  }

  const dg = t => t.gf - t.gc;
  const equiposArr = Array.from(teams.values());

  const pichichiEq = equiposArr.slice().sort((a,b)=>
    (b.gf - a.gf) || (dg(b)-dg(a)) || (a.gc - b.gc) ||
    a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})
  );
  const zamoraEq = equiposArr.slice().sort((a,b)=>
    (a.gc - b.gc) || (dg(b)-dg(a)) || (b.gf - a.gf) ||
    a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})
  );

  const gfPJ = t => t.pj > 0 ? (t.gf / t.pj).toFixed(2) : '—';
  const gcPJ = t => t.pj > 0 ? (t.gc / t.pj).toFixed(2) : '—';

  // Escudo al lado del nombre
  const teamCell = (name) => `
    <div class="team-cell">
      <img class="team-badge team-badge-sm"
           src="${logoPath(name)}"
           alt="Escudo ${name}"
           onerror="this.style.visibility='hidden'">
      <span class="team-name">${name}</span>
    </div>
  `;

  // Chip de podio (top 3)
  const podiumChip = (i) => {
    if (i === 0) return '<span class="chip chip-podium chip-p1">TOP 1</span>';
    if (i === 1) return '<span class="chip chip-podium chip-p2">TOP 2</span>';
    if (i === 2) return '<span class="chip chip-podium chip-p3">TOP 3</span>';
    return '';
  };

  const rowPichichi = (t,i)=>`
    <tr>
      <td class="jug-pos-cell">${i+1}${podiumChip(i)}</td>
      <td>${teamCell(t.nombre)}</td>
      <td>${t.pj}</td>
      <td>${t.gf}</td>
      <td>${gfPJ(t)}</td>
    </tr>`;

  const rowZamora = (t,i)=>`
    <tr>
      <td class="jug-pos-cell">${i+1}${podiumChip(i)}</td>
      <td>${teamCell(t.nombre)}</td>
      <td>${t.pj}</td>
      <td>${t.gc}</td>
      <td>${gcPJ(t)}</td>
    </tr>`;

  const setHTML = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  setHTML('tabla-pichichi', pichichiEq.map(rowPichichi).join(''));
  setHTML('tabla-zamora',   zamoraEq.map(rowZamora).join(''));

  // ---------- Rankings por EQUIPO desde partidos_stats.json ----------
  const statsIndex = await loadJSON('data/partidos_stats.json').catch(()=>null);
  if (!statsIndex) return;

  const agg = new Map();
  const teamAgg = (name) => {
    if (!agg.has(name)) agg.set(name, {
      nombre:name,
      pj:0,
      posSum:0,posCount:0,
      faltas:0, entradas:0, pases:0, completados:0,
      tiros:0, taPuerta:0, goles:0,
      rojas:0,
      golesEncajados:0,
      tirosRival:0
    });
    return agg.get(name);
  };

  // Normaliza posesión a 0..1
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

  for (const matchId of Object.keys(statsIndex)) {
    const porEquipo = statsIndex[matchId] || {};
    const equiposPartido = Object.keys(porEquipo);

    for (const eqName of equiposPartido) {
      const te = porEquipo[eqName] || {};
      const a = teamAgg(eqName);

      const hasAny = [
        'posesion','faltas','entradas','pases','pases_completados',
        'tiros','tiros_a_puerta','goles','expulsiones','rojas','tarjetas_rojas'
      ].some(k => te[k] !== undefined);
      if (hasAny) a.pj++;

      const pos = parsePct01(te.posesion);
      if (pos !== null) { a.posSum += pos; a.posCount++; }

      addNum(a,'faltas', te.faltas);
      addNum(a,'entradas', te.entradas);
      addNum(a,'pases', te.pases);
      addNum(a,'completados', te.pases_completados);
      addNum(a,'tiros', te.tiros);
      addNum(a,'taPuerta', te.tiros_a_puerta);
      addNum(a,'goles', te.goles);
      addNum(a,'rojas', te.expulsiones ?? te.rojas ?? te.tarjetas_rojas);

      // DEFENSIVO: datos del rival
      const rivalName = equiposPartido.find(n => n !== eqName);
      if (rivalName) {
        const rivalStats = porEquipo[rivalName] || {};
        addNum(a,'golesEncajados', rivalStats.goles);
        addNum(a,'tirosRival',     rivalStats.tiros_a_puerta);
      }
    }
  }

  const arr = Array.from(agg.values());

  // Métricas
  const posMed = t => t.posCount>0 ? (t.posSum/t.posCount) : NaN;
  const ROJA_PESO = 5;
  const fair   = t => ((t.entradas||0)+1) / ((t.faltas||0) + ROJA_PESO*(t.rojas||0) + 1);
  const pass   = t => t.pases>0 ? (t.completados/t.pases) : NaN;
  const precision  = t => t.tiros>0 ? (t.taPuerta||0)/t.tiros : NaN;
  const conversion = t => (t.tiros>0) ? (t.goles||0)/t.tiros : NaN;
  const combined   = t => {
    const p = precision(t), c = conversion(t);
    return (!isNaN(p) && !isNaN(c)) ? (p+c)/2 : NaN;
  };
  const efectRival = t => t.tirosRival>0 ? t.golesEncajados/t.tirosRival : NaN;

  const fmtPct = v => isNaN(v)?'—':(v*100).toFixed(1)+'%';

  // Rankings
  const posesionTop = arr.filter(t=>!isNaN(posMed(t))).sort((a,b)=> posMed(b)-posMed(a));
  const fairTop     = arr.slice().sort((a,b)=> fair(b)-fair(a));
  const passTop     = arr.filter(t=>!isNaN(pass(t))).sort((a,b)=> pass(b)-pass(a));
  const shotTop     = arr.filter(t=>!isNaN(combined(t))).sort((a,b)=> combined(b)-combined(a));
  const efectTop    = arr.filter(t=>!isNaN(efectRival(t))).sort((a,b)=> efectRival(a)-efectRival(b));

  // Filas con escudo al lado + chip podio en la posición
  const rPos = (t,i)=> `
    <tr>
      <td class="jug-pos-cell">${i+1}${podiumChip(i)}</td>
      <td>${teamCell(t.nombre)}</td>
      <td>${t.pj}</td>
      <td>${fmtPct(posMed(t))}</td>
    </tr>`;

  const rFair= (t,i)=> `
    <tr>
      <td class="jug-pos-cell">${i+1}${podiumChip(i)}</td>
      <td>${teamCell(t.nombre)}</td>
      <td>${t.pj}</td>
      <td>${t.entradas}</td>
      <td>${t.faltas}</td>
      <td>${t.rojas}</td>
      <td>${fair(t).toFixed(2)}</td>
    </tr>`;

  const rPass= (t,i)=> `
    <tr>
      <td class="jug-pos-cell">${i+1}${podiumChip(i)}</td>
      <td>${teamCell(t.nombre)}</td>
      <td>${t.pj}</td>
      <td>${t.pases}</td>
      <td>${t.completados}</td>
      <td>${fmtPct(pass(t))}</td>
    </tr>`;

  const rShot= (t,i)=> `
    <tr>
      <td class="jug-pos-cell">${i+1}${podiumChip(i)}</td>
      <td>${teamCell(t.nombre)}</td>
      <td>${t.pj}</td>
      <td>${t.tiros}</td>
      <td>${t.taPuerta}</td>
      <td>${t.goles}</td>
      <td>${fmtPct(precision(t))}</td>
      <td>${fmtPct(conversion(t))}</td>
      <td>${fmtPct(combined(t))}</td>
    </tr>`;

  const rEfect = (t,i)=> `
    <tr>
      <td class="jug-pos-cell">${i+1}${podiumChip(i)}</td>
      <td>${teamCell(t.nombre)}</td>
      <td>${t.pj}</td>
      <td>${t.golesEncajados}</td>
      <td>${t.tirosRival}</td>
      <td>${fmtPct(efectRival(t))}</td>
    </tr>`;

  const setRows = (id, rows)=> {
    const el = document.getElementById(id);
    if (el) el.innerHTML = rows.join('');
  };
  setRows('tabla-posesion-eq', posesionTop.map(rPos));
  setRows('tabla-fairplay-eq', fairTop.map(rFair));
  setRows('tabla-pass-eq',    passTop.map(rPass));
  setRows('tabla-shot-eq',    shotTop.map(rShot));
  setRows('tabla-efect-rival',efectTop.map(rEfect));
})();
