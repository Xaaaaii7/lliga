// Navegación común + utilidades


document.addEventListener('DOMContentLoaded', () => {
const nav = document.getElementById('main-nav');
if (nav) {
const links = [
['index.html','Noticias'],
['clasificacion.html','Clasificación'],
['resultados.html','Resultados'],
['equipos.html','Equipos'],
['jugadores.html','Jugadores'],
['jornada.html','Jornada']
];


nav.innerHTML = links
.map(([href,label]) => `<a href="${href}" data-href="${href}">${label}</a>`)
.join('');


// Marca activo según la página actual
const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
nav.querySelectorAll('a').forEach(a => {
if ((a.getAttribute('data-href')||'').toLowerCase() === here) {
a.classList.add('active');
}
});
}
});


// Util: carga JSON
async function loadJSON(path){
const res = await fetch(path, { cache: 'no-store' });
if(!res.ok) throw new Error('No se pudo cargar '+path);
return res.json();
}


// Util: formatea fecha corta
function fmtDate(iso){
const d = new Date(iso);
if (isNaN(d)) return '';
return d.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
}
```js
// Inserta nav común
(function(){
const nav = document.getElementById('main-nav');
if(!nav) return;
nav.innerHTML = `
<a href="index.html">Noticias</a>
<a href="clasificacion.html">Clasificación</a>
<a href="resultados.html">Resultados</a>
<a href="equipos.html">Equipos</a>
<a href="jugadores.html">Jugadores</a>
<a href="jornada.html">Jornada</a>
`;
})();


// Util: carga JSON
async function loadJSON(path){
const res = await fetch(path);
if(!res.ok) throw new Error('No se pudo cargar '+path);
return res.json();
}


// Util: formatea fecha corta
function fmtDate(iso){
const d = new Date(iso);
return d.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
}
```js
// Inserta nav común
(function(){
const nav = document.getElementById('main-nav');
if(!nav) return;
nav.innerHTML = `
<a href="index.html">Noticias</a>
<a href="clasificacion.html">Clasificación</a>
<a href="resultados.html">Resultados</a>
<a href="jugadores.html">Jugadores</a>
<a href="jornada.html">Jornada</a>
`;
})();


// Util: carga JSON
}
