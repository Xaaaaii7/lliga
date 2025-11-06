(async () => {
  const tbody = document.getElementById("tabla-analisis");
  if (!tbody) return;

  // Popup refs
  const popup = document.getElementById("analisis-backdrop");
  const closeBtn = document.getElementById("analisis-close");
  const titleEl  = document.getElementById("analisis-title");
  const etiquetaEl  = document.getElementById("analisis-etiqueta");
  const contentEl = document.getElementById("analisis-content");

  const open = ()=>{ popup.hidden = false; document.body.style.overflow = "hidden"; };
  const close = ()=>{ popup.hidden = true; document.body.style.overflow = ""; };
  closeBtn?.addEventListener("click", close);
  popup?.addEventListener("click", e=>{ if(e.target===popup) close(); });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") close(); });

  const loadJSON = async p => (await fetch(p)).json();
  const isNum = v => typeof v==="number" && Number.isFinite(v);

  // ====== Carga ======
  let jornadas, div1, div2;
  try { jornadas = await loadJSON("data/resultados.json"); } catch {}
  try { div1 = await loadJSON("data/division-primera.json"); } catch {}
  try { div2 = await loadJSON("data/division-segunda.json"); } catch {}

  if (!Array.isArray(jornadas) || !div1 || !div2) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#9fb3c8;padding:12px">Error cargando datos.</td></tr>`;
    return;
  }

  const D1 = new Set((div1.equipos||[]).map(x=>String(x)));
  const D2 = new Set((div2.equipos||[]).map(x=>String(x)));
  const jugadores = [...new Set([...D1, ...D2])];

  // ====== Acumuladores por jugador ======
  // Guardamos rendimiento "vs Primera" y "vs Segunda" según el rival.
  const stats = {};
  jugadores.forEach(j => stats[j] = {
    nombre: j,
    pj_vs_d1:0, pts_vs_d1:0, gd_vs_d1:0,
    pj_vs_d2:0, pts_vs_d2:0, gd_vs_d2:0
  });

  // Recorre todos los partidos
  for (const j of jornadas) {
    for (const p of (j.partidos||[])) {
      if (!p.local || !p.visitante) continue;
      const gl = isNum(p.goles_local) ? p.goles_local : null;
      const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
      if (gl===null || gv===null) continue;

      const A = String(p.local), B = String(p.visitante);
      const sA = stats[A], sB = stats[B];
      if (!sA || !sB) continue; // ignora equipos fuera de D1/D2

      // Puntos desde la perspectiva de cada equipo
      const ptsA = (gl>gv)?3:(gl===gv?1:0);
      const ptsB = (gv>gl)?3:(gl===gv?1:0);
      const gdA  = gl - gv;
      const gdB  = gv - gl;

      // Para A, clasifica por la división del RIVAL (B)
      if (D1.has(B)) { sA.pj_vs_d1++; sA.pts_vs_d1+=ptsA; sA.gd_vs_d1+=gdA; }
      else if (D2.has(B)) { sA.pj_vs_d2++; sA.pts_vs_d2+=ptsA; sA.gd_vs_d2+=gdA; }

      // Para B, clasifica por la división del RIVAL (A)
      if (D1.has(A)) { sB.pj_vs_d1++; sB.pts_vs_d1+=ptsB; sB.gd_vs_d1+=gdB; }
      else if (D2.has(A)) { sB.pj_vs_d2++; sB.pts_vs_d2+=ptsB; sB.gd_vs_d2+=gdB; }
    }
  }

  // ====== Helpers métricas ======
  const ppm = (pts,pj)=> pj>0? pts/pj : null;
  const gdpm = (gd,pj)=> pj>0? gd/pj : null;

  // === Etiquetado revisado (criterios suaves, sin regla estricta) ===
  function etiqueta(s){
    const PJ1 = s.pj_vs_d1, PJ2 = s.pj_vs_d2;
    const ppm1 = ppm(s.pts_vs_d1, PJ1);
    const ppm2 = ppm(s.pts_vs_d2, PJ2);
    const brecha = (ppm2??0) - (ppm1??0);

    // Datos muy escasos
    if ((PJ1 + PJ2) <= 1) return "Dudoso";

    // Primera clara
    if (ppm1 !== null && ppm1 >= 2.0 && PJ1 >= 2) return "Primera";
    if (brecha < -0.8 && PJ1 >= 2) return "Primera";

    // Segunda clara
    if (ppm2 !== null && ppm2 <= 1.0 && PJ2 >= 2) return "Segunda";

    // Apto Primera (destaca en Segunda, podría subir)
    if (ppm2 !== null && ppm2 >= 1.5 && PJ2 >= 2) return "Apto Primera";

    // Apto Segunda (sufre en Primera, podría bajar)
    if (ppm1 !== null && ppm1 <= 0.9 && PJ1 >= 2) return "Apto Segunda";

    // Indefinido / señales mixtas
    return "Dudoso";
  }

  // Brecha = PPM vs Segunda - PPM vs Primera
  const getBrecha = s => {
    const p1 = ppm(s.pts_vs_d1, s.pj_vs_d1);
    const p2 = ppm(s.pts_vs_d2, s.pj_vs_d2);
    if (p1===null && p2===null) return 0;
    return (p2||0) - (p1||0);
  };

  // Mapa de clases por etiqueta (fila coloreada)
  const classByTag = {
    "Primera":       "tag-primera",
    "Apto Primera":  "tag-apto1",
    "Dudoso":        "tag-dudoso",
    "Apto Segunda":  "tag-apto2",
    "Segunda":       "tag-segunda"
  };

  // Orden final
  const orderTag = { "Primera":1, "Apto Primera":2, "Dudoso":3, "Apto Segunda":4, "Segunda":5 };

  const rows = jugadores.map(nombre => {
    const s = stats[nombre];
    const data = {
      nombre,
      pj1: s.pj_vs_d1,
      ppm1: ppm(s.pts_vs_d1, s.pj_vs_d1),
      gd1: gdpm(s.gd_vs_d1, s.pj_vs_d1),
      pj2: s.pj_vs_d2,
      ppm2: ppm(s.pts_vs_d2, s.pj_vs_d2),
      gd2: gdpm(s.gd_vs_d2, s.pj_vs_d2),
      brecha: getBrecha(s),
      etiqueta: etiqueta(s)
    };
    return data;
  });

  rows.sort((a,b)=>{
    if (orderTag[a.etiqueta] !== orderTag[b.etiqueta]) return orderTag[a.etiqueta] - orderTag[b.etiqueta];
    if (b.brecha !== a.brecha) return b.brecha - a.brecha;
    // desempate por PPM total
    const at = ((a.ppm1||0)*(a.pj1||0) + (a.ppm2||0)*(a.pj2||0)) / Math.max(1,(a.pj1||0)+(a.pj2||0));
    const bt = ((b.ppm1||0)*(b.pj1||0) + (b.ppm2||0)*(b.pj2||0)) / Math.max(1,(b.pj1||0)+(b.pj2||0));
    if (bt !== at) return bt - at;
    return a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'});
  });

  // Render tabla
  tbody.innerHTML = rows.map((r,i)=>`
    <tr class="row-analisis ${classByTag[r.etiqueta]||''}" data-j="${r.nombre}">
      <td>${i+1}</td>
      <td>${r.nombre}</td>
      <td>${r.pj1}</td><td>${r.ppm1?.toFixed(2) ?? "—"}</td><td>${r.gd1?.toFixed(2) ?? "—"}</td>
      <td>${r.pj2}</td><td>${r.ppm2?.toFixed(2) ?? "—"}</td><td>${r.gd2?.toFixed(2) ?? "—"}</td>
      <td>${r.brecha.toFixed(2)}</td>
      <td>${r.etiqueta}</td>
    </tr>
  `).join("");

  // Popup bonito con chips + dos tarjetas
  const chip = (text, cls) => `<span class="chip ${cls||''}">${text}</span>`;

  document.querySelectorAll(".row-analisis").forEach(tr=>{
    tr.addEventListener('click', ()=>{
      const name = tr.dataset.j;
      const r = rows.find(x=>x.nombre===name);
      if (!r) return;

      titleEl.textContent = r.nombre;
      etiquetaEl.innerHTML = chip(r.etiqueta, classByTag[r.etiqueta]||'');

      contentEl.innerHTML = `
        <div class="cards-2col">
          <div class="card">
            <h3>Rendimiento vs <strong>Primera</strong></h3>
            <ul class="kv">
              <li><b>Partidos:</b> ${r.pj1}</li>
              <li><b>PPM:</b> ${r.ppm1?.toFixed(2) ?? "—"}</li>
              <li><b>GD/Partido:</b> ${r.gd1?.toFixed(2) ?? "—"}</li>
            </ul>
          </div>
          <div class="card">
            <h3>Rendimiento vs <strong>Segunda</strong></h3>
            <ul class="kv">
              <li><b>Partidos:</b> ${r.pj2}</li>
              <li><b>PPM:</b> ${r.ppm2?.toFixed(2) ?? "—"}</li>
              <li><b>GD/Partido:</b> ${r.gd2?.toFixed(2) ?? "—"}</li>
            </ul>
          </div>
        </div>

        <div class="hint" style="margin-top:8px">
          <p><b>Cómo leerlo:</b> separamos el rendimiento contra rivales de Primera y Segunda.
          La etiqueta resume en qué división encaja mejor según PPM y diferencia de goles por partido.
          La “brecha” es PPM(Segunda) − PPM(Primera): positiva ⇒ rinde mejor en Segunda.</p>
        </div>
      `;
      open();
    });
  });

})();
