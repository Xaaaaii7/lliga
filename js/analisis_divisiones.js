(async () => {

  const tbody = document.getElementById("tabla-analisis");
  if (!tbody) return;

  const popup = document.getElementById("analisis-backdrop");
  const closeBtn = document.getElementById("analisis-close");
  const titleEl  = document.getElementById("analisis-title");
  const etiquetaEl  = document.getElementById("analisis-etiqueta");
  const contentEl = document.getElementById("analisis-content");

  const open = ()=> { popup.hidden = false; document.body.style.overflow = "hidden"; };
  const close = ()=> { popup.hidden = true; document.body.style.overflow = ""; };
  closeBtn.onclick = close;
  popup.onclick = (e)=>{ if(e.target===popup) close(); };
  document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") close(); });

  const loadJSON = async p => (await fetch(p)).json();
  const isNum = v => typeof v==="number" && Number.isFinite(v);

  // === Carga datos base ===
  let jornadas;
  let div1, div2;

  try { jornadas = await loadJSON("data/resultados.json"); } catch {}
  try { div1 = await loadJSON("data/division-primera.json"); } catch {}
  try { div2 = await loadJSON("data/division-segunda.json"); } catch {}

  if (!Array.isArray(jornadas) || !div1 || !div2) {
    tbody.innerHTML = `<tr><td colspan="10">Error cargando datos.</td></tr>`;
    return;
  }

  const D1 = new Set(div1.equipos.map(x=>String(x)));
  const D2 = new Set(div2.equipos.map(x=>String(x)));

  const jugadores = [...D1, ...D2];

  // === estadísticas por jugador ===
  const stats = {};
  jugadores.forEach(j => stats[j] = {
    nombre: j,
    pj1:0, pts1:0, gd1:0,
    pj2:0, pts2:0, gd2:0
  });

  for (const j of jornadas) {
    for (const p of (j.partidos||[])) {
      if (!p.local || !p.visitante) continue;
      const gl = isNum(p.goles_local)?p.goles_local:null;
      const gv = isNum(p.goles_visitante)?p.goles_visitante:null;
      if (gl===null || gv===null) continue;

      const A = p.local;
      const B = p.visitante;

      const sA = stats[A];
      const sB = stats[B];
      if (!sA || !sB) continue;

      const winA = gl>gv ? 3 : (gl===gv?1:0);
      const winB = gv>gl ? 3 : (gl===gv?1:0);

      // Primera
      if (D1.has(A) && D1.has(B)) {
        sA.pj1++; sA.pts1 += winA; sA.gd1 += (gl-gv);
        sB.pj1++; sB.pts1 += winB; sB.gd1 += (gv-gl);
      }

      // Segunda
      if (D2.has(A) && D2.has(B)) {
        sA.pj2++; sA.pts2 += winA; sA.gd2 += (gl-gv);
        sB.pj2++; sB.pts2 += winB; sB.gd2 += (gv-gl);
      }
    }
  }

  // === cálculo de ratios ===
  function calcPPM(pts,pj){ return pj>0? pts/pj : null; }
  function calcGDpm(gd,pj){ return pj>0? gd/pj : null; }

  // === nueva lógica de etiquetas ===
  function etiqueta(s){
    const ppm1 = calcPPM(s.pts1, s.pj1);
    const ppm2 = calcPPM(s.pts2, s.pj2);

    // casos con pocos datos
    if ((s.pj1 + s.pj2) === 0) return "Dudoso";

    // Primera muy clara
    if (ppm1 !== null && ppm1 >= 2.0) return "Primera";
    if (ppm2 !== null && ppm1 !== null && ppm1 >= ppm2 + 0.5) return "Primera";

    // Segunda muy clara
    if (ppm2 !== null && ppm2 <= 0.5 && s.pj2 >= 4) return "Segunda";
    if (ppm2 !== null && ppm1 !== null && ppm1 <= ppm2 - 0.5) return "Segunda";

    // Apto para primera (juega en segunda y destaca)
    if (s.pj2 >= 4 && ppm2 !== null && ppm2 >= 1.6)
      return "Apto Primera";

    // Apto segunda (juega en primera y sufre)
    if (s.pj1 >= 4 && ppm1 !== null && ppm1 <= 0.9)
      return "Apto Segunda";

    return "Dudoso";
  }

  // === brecha ===
  function brecha(s){
    const ppm1 = calcPPM(s.pts1, s.pj1);
    const ppm2 = calcPPM(s.pts2, s.pj2);
    if (ppm1===null && ppm2===null) return 0;
    return ((ppm2||0) - (ppm1||0));
  }

  // === tabla ===
  const data = jugadores.map(j => {
    const s = stats[j];
    return {
      nombre: j,
      pj1: s.pj1,
      ppm1: calcPPM(s.pts1,s.pj1),
      gd1: calcGDpm(s.gd1,s.pj1),
      pj2: s.pj2,
      ppm2: calcPPM(s.pts2,s.pj2),
      gd2: calcGDpm(s.gd2,s.pj2),
      brecha: brecha(s),
      etiqueta: etiqueta(s)
    };
  });

  const ordenEtiqueta = {
    "Primera":1,
    "Apto Primera":2,
    "Dudoso":3,
    "Apto Segunda":4,
    "Segunda":5
  };

  data.sort((a,b)=>{
    if (ordenEtiqueta[a.etiqueta] !== ordenEtiqueta[b.etiqueta])
      return ordenEtiqueta[a.etiqueta] - ordenEtiqueta[b.etiqueta];
    return b.brecha - a.brecha;
  });

  // === Render tabla ===
  tbody.innerHTML = data.map((r,i)=>`
    <tr class="row-analisis" data-j="${r.nombre}">
      <td>${i+1}</td>
      <td>${r.nombre}</td>
      <td>${r.pj1}</td><td>${r.ppm1?.toFixed(2) || "—"}</td><td>${r.gd1?.toFixed(2)||"—"}</td>
      <td>${r.pj2}</td><td>${r.ppm2?.toFixed(2) || "—"}</td><td>${r.gd2?.toFixed(2)||"—"}</td>
      <td>${r.brecha.toFixed(2)}</td>
      <td>${r.etiqueta}</td>
    </tr>
  `).join("");

  // === Popup detallado ===
  document.querySelectorAll(".row-analisis").forEach(row=>{
    row.onclick = ()=>{
      const name = row.dataset.j;
      const r = data.find(d=>d.nombre===name);
      if (!r) return;

      titleEl.textContent = r.nombre;
      etiquetaEl.textContent = r.etiqueta;

      contentEl.innerHTML = `
        <p><strong>Primera División:</strong></p>
        <ul>
          <li>Partidos: ${r.pj1}</li>
          <li>PPM: ${r.ppm1?.toFixed(2) || "—"}</li>
          <li>GD/Partido: ${r.gd1?.toFixed(2) || "—"}</li>
        </ul>

        <p><strong>Segunda División:</strong></p>
        <ul>
          <li>Partidos: ${r.pj2}</li>
          <li>PPM: ${r.ppm2?.toFixed(2) || "—"}</li>
          <li>GD/Partido: ${r.gd2?.toFixed(2) || "—"}</li>
        </ul>

        <p><strong>Brecha:</strong> ${r.brecha.toFixed(2)}</p>
      `;
      open();
    };
  });

})();
