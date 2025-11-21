(async () => {
  const root = document.getElementById('jugadores');

  // -----------------------------
  // Tabs Jugadores (UI only)
  // -----------------------------
  if (root) {
    const tabsContainer = root.querySelector('.tabs-jugadores');
    const tabButtons = tabsContainer?.querySelectorAll('button') || [];
    const panels = root.querySelectorAll('.tab-panel');

    const switchTab = (id) => {
      panels.forEach(p => p.classList.toggle('active', p.id === id));
      tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === id));
    };

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.tab;
        if (id) switchTab(id);
      });
    });
  }

  // -----------------------------
  // Core helpers
  // -----------------------------
  const norm = CoreStats.norm;
  const slug = CoreStats.slug;

  const logoPath = (team) => `img/${slug(team)}.png`;

  const teamCell = (name) => `
    <div class="team-cell">
      <img class="team-badge team-badge-sm"
           src="${logoPath(name)}"
           alt="Escudo ${name}"
           onerror="this.style.visibility='hidden'">
      <span class="team-name">${name}</span>
    </div>
  `;

  const podiumChip = (i) => {
    if (i === 0) return '<span class="chip chip-podium chip-p1">TOP 1</span>';
    if (i === 1) return '<span class="chip chip-podium chip-p2">TOP 2</span>';
    if (i === 2) return '<span class="chip chip-podium chip-p3">TOP 3</span>';
    return '';
  };

  const setHTML = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  const setRows = (id, rows) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = rows.join('');
  };

  // =========================================================
  // 1) PICHICHI / ZAMORA EQUIPOS (GLOBAL)
  //    Totales vienen del core, aquí solo ordenamos/pintamos
  // =========================================================
  const totals = await CoreStats.computeTeamTotals().catch(() => []);

  const gfPJ = t => (t.pj > 0) ? (t.gf / t.pj).toFixed(2) : '—';
  const gcPJ = t => (t.pj > 0) ? (t.gc / t.pj).toFixed(2) : '—';
  const dg   = t => (t.gf - t.gc);

  const pichichiEq = totals.slice().sort((a,b)=>
    (b.gf - a.gf) || (dg(b)-dg(a)) || (a.gc - b.gc) ||
    a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})
  );

  const zamoraEq = totals.slice().sort((a,b)=>
    (a.gc - b.gc) || (dg(b)-dg(a)) || (b.gf - a.gf) ||
    a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})
  );

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

  setHTML('tabla-pichichi', pichichiEq.map(rowPichichi).join(''));
  setHTML('tabla-zamora',   zamoraEq.map(rowZamora).join(''));

  // =========================================================
  // 2) RANKINGS AVANZADOS POR EQUIPO (GLOBAL)
  //    100% CoreStats.computeRankingsPorEquipo()
  // =========================================================
  const adv = await CoreStats.computeRankingsPorEquipo().catch(() => null);

  if (adv) {
    const {
      posesionTop = [],
      fairTop = [],
      passTop = [],
      shotTop = [],
      efectTop = [],
      posMed,
      fair,
      passAcc,
      precisionTiro,
      conversionGol,
      combinedShot,
      efectRival
    } = adv;

    const fmtPct = v => Number.isFinite(v) ? (v*100).toFixed(1)+'%' : '—';

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
        <td>${fmtPct(passAcc(t))}</td>
      </tr>`;

    const rShot= (t,i)=> `
      <tr>
        <td class="jug-pos-cell">${i+1}${podiumChip(i)}</td>
        <td>${teamCell(t.nombre)}</td>
        <td>${t.pj}</td>
        <td>${t.tiros}</td>
        <td>${t.taPuerta}</td>
        <td>${t.goles}</td>
        <td>${fmtPct(precisionTiro(t))}</td>
        <td>${fmtPct(conversionGol(t))}</td>
        <td>${fmtPct(combinedShot(t))}</td>
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

    setRows('tabla-posesion-eq', posesionTop.map(rPos));
    setRows('tabla-fairplay-eq', fairTop.map(rFair));
    setRows('tabla-pass-eq',     passTop.map(rPass));
    setRows('tabla-shot-eq',     shotTop.map(rShot));
    setRows('tabla-efect-rival', efectTop.map(rEfect));
  }

  // =========================================================
  // 3) MVP TEMPORADA (EQUIPOS)
  //    100% CoreStats.computeMvpTemporada()
  // =========================================================
  const mvpSeasonArr = await CoreStats.computeMvpTemporada().catch(() => []);

  const mvpTbody = document.getElementById('tabla-mvp-jornada');
  if (mvpTbody) {
    mvpTbody.innerHTML = mvpSeasonArr.map((s,i)=>{
      const puntos = (s.mvpAvg * 100).toFixed(1);
      return `
        <tr>
          <td class="jug-pos-cell">${i+1}${podiumChip(i)}</td>
          <td>${teamCell(s.nombre)}</td>
          <td>${s.jornadas}</td>
          <td>${s.pj}</td>
          <td>${s.gf}</td>
          <td>${s.gc}</td>
          <td>${puntos}</td>
        </tr>
      `;
    }).join('');
  }

})();
