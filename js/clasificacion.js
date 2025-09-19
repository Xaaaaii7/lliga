(async () => {
const equipos = await loadJSON('data/clasificacion.json');
// Calcula DG si no viene
equipos.forEach(e=> e.dg = (e.gf - e.gc));
// Orden: pts desc, DG desc, GF desc
equipos.sort((a,b)=> b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);


const tbody = document.getElementById('tabla-clasificacion');
tbody.innerHTML = equipos.map((e,i)=>`
<tr>
<td>${i+1}</td>
<td>${e.nombre}</td>
<td>${e.pj}</td>
<td>${e.g}</td>
<td>${e.e}</td>
<td>${e.p}</td>
<td>${e.gf}</td>
<td>${e.gc}</td>
<td>${e.dg}</td>
<td>${e.pts}</td>
</tr>
`).join('');
})();
