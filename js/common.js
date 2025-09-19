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
    nav.innerHTML = links.map(([href,label]) =>
      `<a href="${href}" data-href="${href}">${label}</a>`).join('');
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    nav.querySelectorAll('a').forEach(a => {
      if ((a.getAttribute('data-href')||'').toLowerCase() === here) {
        a.classList.add('active');
      }
    });
  }
});

async function loadJSON(path){
  const res = await fetch(path, { cache: 'no-store' });
  if(!res.ok) throw new Error('No se pudo cargar '+path);
  return res.json();
}
function fmtDate(iso){
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
}

// Genera alineación automática desde esquema "4-4-2"
function genAlineacionFromEsquema(esquema){
  const [def, mid, fwd] = (esquema||'4-4-2').split('-').map(n=>parseInt(n,10)||0);
  const fila = (n, row, pref) =>
    Array.from({length:n},(_,i)=>({slot:`${pref}${i+1}`,posicion:pref==='POR'?'POR':pref,fila:row,col:i+1}));
  return [
    ...fila(fwd,2,'DEL'),
    ...fila(mid,3,'MED'),
    ...fila(def,4,'DEF'),
    {slot:'POR1',posicion:'POR',fila:5,col:3}
  ];
}
