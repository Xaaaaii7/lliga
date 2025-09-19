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
