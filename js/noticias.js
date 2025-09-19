(async () => {
const data = await loadJSON('data/noticias.json');
// Orden por fecha desc
data.sort((a,b)=> new Date(b.fecha) - new Date(a.fecha));


// Destacadas (primeras N con destacado=true)
const destacadas = data.filter(n=>n.destacado).slice(0,8);
document.getElementById('banner').innerHTML = destacadas.map(n=>`
<a class="circle-card" href="${n.link || '#'}" target="${n.link ? '_blank':''}">
<img src="${n.img}" alt="${n.titulo}">
<h4>${n.titulo}</h4>
<time>${fmtDate(n.fecha)}</time>
</a>
`).join('');


// Histórico en cuadrícula
document.getElementById('news-grid').innerHTML = data.map(n=>`
<article class="news-card">
<img src="${n.img}" alt="${n.titulo}">
<div class="content">
<h3>${n.titulo}</h3>
<p>${n.resumen || ''}</p>
<p><small>${fmtDate(n.fecha)}</small></p>
</div>
</article>
`).join('');
})();
