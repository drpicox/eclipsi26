const D = window.D;
const TIANA = [41.4817, 2.2686];
const MOBIL = matchMedia('(max-width: 860px)').matches;
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const HORES = ['22:30','23:00','00:00','01:00','02:00','03:00','04:00','05:00'];

const tcol = s => s==null ? '#5ec8d8' : s>=90 ? '#f2c14e' : s>=60 ? '#e08b3e' : s>=40 ? '#c85a49' : '#8a4a5e';
const tkey = s => s==null ? 'ref' : s>=90 ? 't90' : s>=60 ? 't60' : s>=40 ? 't40' : 't00';
// Enllaços de navegació. A iOS, Apple Maps primer.
function navLinks(lat, lon, nom){
  const q = encodeURIComponent(nom || '');
  const apple  = `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d${q?'&q='+q:''}`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  const A = `<a href="${apple}" target="_blank" rel="noopener">Apple Maps →</a>`;
  const G = `<a href="${google}" target="_blank" rel="noopener">Google Maps →</a>`;
  return `<div class="navrow">${IOS ? A+G : G+A}</div>`;
}
const mmss = s => s==null ? '—' : (s>=60 ? (Math.floor(s/60)+' min'+(s%60?' '+(s%60)+' s':'')) : s+' s');
const hm   = m => m==null ? '—' : (m>=60 ? Math.floor(m/60)+' h '+(m%60?String(m%60).padStart(2,'0'):'00') : m+' min');

const map = L.map('map',{zoomControl:true, attributionControl:true,
  tap:true, tapTolerance:18}).setView([41.05,0.95], 9);
// zona segura del mòbil: la defineix el CSS (:root) i aquí només la llegim
const _arrel = getComputedStyle(document.documentElement);
const SAFE_DALT = parseFloat(_arrel.getPropertyValue('--sat')) || 0;
const SAFE_BAIX = parseFloat(_arrel.getPropertyValue('--sab')) || 0;
// a baix, el full plegat ocupa 104px + barra d'inici: el popup s'atura per sobre
L.Popup.mergeOptions({autoPanPadding: MOBIL ? [16,16+SAFE_DALT] : [24,24],
                      autoPanPaddingBottomRight: MOBIL ? [16,118+SAFE_BAIX] : [24,24],
                      maxWidth: MOBIL ? 300 : 340});
const ATTR = '&copy; OpenStreetMap · dades: Generalitat de Catalunya / IEEC';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
// Sense {s}: amb HTTP/2 els subdominis no aporten res i, en canvi, farien que la
// mateixa tessel·la tingués quatre URL diferents i no es trobés a la memòria cau.
const BASES = {
  carreteres:{clar:true,  url:'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
              opt:{maxZoom:19, attribution:'&copy; CARTO · '+ATTR}},
  relleu:    {clar:true,  url:ESRI+'World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
              opt:{maxZoom:19, attribution:'&copy; Esri · '+ATTR}},
  satelit:   {clar:false, url:ESRI+'World_Imagery/MapServer/tile/{z}/{y}/{x}',
              opt:{maxZoom:18, attribution:'&copy; Esri · '+ATTR}},
  fosc:      {clar:false, url:'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              opt:{maxZoom:19, attribution:'&copy; CARTO · '+ATTR}},
};
let tiles = null, baseActual = 'carreteres';
function setBase(k){
  if(tiles) map.removeLayer(tiles);
  baseActual = k;
  const b = BASES[k];
  // updateWhenIdle + keepBuffer petit: menys peticions de cop, que és el que
  // feia petar els servidors de relleu en fer zoom des del mòbil
  tiles = L.tileLayer(b.url, Object.assign({
    updateWhenIdle: MOBIL, keepBuffer: MOBIL ? 1 : 2, crossOrigin: true
  }, b.opt));
  // reintent escalonat de les tessel·les que fallen. Sense cobertura no serveix
  // de res insistir: si no la tenim desada, no hi és, i punt.
  tiles.on('tileerror', ev => {
    if(!navigator.onLine) return;
    const t = ev.tile;
    const n = (t._reint = (t._reint||0) + 1);
    if(n > 3) return;
    setTimeout(() => { if(t.parentNode) t.src = ev.tile.src.split('#')[0] + '#r' + n; }, 350*n + Math.random()*250);
  });
  tiles.addTo(map);
  tiles.bringToBack();
  document.getElementById('map').classList.toggle('clar', b.clar);
  document.querySelectorAll('[data-base]').forEach(el=>el.classList.toggle('on', el.dataset.base===k));
}

const DENS = new Set(['Reus','Constantí','Tarragona','Altafulla','Torredembarra','Cambrils','Montbrió del Camp']);
// Capa d'ombres: on el relleu tapa el Sol a la totalitat
const OMB = D.ombres;
const ombres = L.imageOverlay(OMB.png, OMB.bounds, {opacity:1, interactive:false}).addTo(map);
const groups = {};
['t90','t60','t40','t00','ref','bon','poi','home'].forEach(k=>groups[k]=L.layerGroup().addTo(map));
const labels = L.layerGroup().addTo(map);
const labelsZoom = L.layerGroup();

function meteorTable(p){
  const max = Math.max(...HORES.map(h=>p.taxes[h].hr));
  let r = '<table><tr><th>Hora</th><th>Radiant</th><th>Meteors/h</th><th></th></tr>';
  HORES.forEach(h=>{
    const t = p.taxes[h], w = max? Math.round(t.hr/max*54) : 0;
    r += `<tr><td class="num">${h}</td><td class="num">${t.alt}°</td>`+
         `<td class="num"><b>${t.hr}</b></td>`+
         `<td><span class="bar" style="width:${w}px"></span></td></tr>`;
  });
  return r+'</table>';
}

function fitxa(p){
  let h = `<h4>${p.nom}</h4><div style="color:#8d99ad;font-size:11.5px;margin-bottom:9px">${p.lloc}</div>`;
  if(p.tipus==='oficial'){
    h += `<div style="margin-bottom:8px"><span class="pill" style="background:${tcol(p.totalitat_s)};color:#1a1206">`+
         `Totalitat ${mmss(p.totalitat_s)}</span></div>`;
    h += `<div style="font-size:12px;color:#8d99ad;margin-bottom:8px">Aforament: `+
         `${p.aforament_persones? p.aforament_persones.toLocaleString('ca')+' persones · '+p.aforament_vehicles.toLocaleString('ca')+' vehicles':'no publicat'}</div>`;
    if(p.parquings){
      const pq = p.parquings;
      h += `<div style="font-size:12px;color:#8d99ad;margin-bottom:8px">${pq.length} pàrquings oficials marcats al mapa (P${pq[0].n}–P${pq[pq.length-1].n}): apropa-hi el zoom.</div>`;
    }
    if(p.reserva === 'exhaurida')
      h += `<div class="alerta">Cal reserva prèvia i ja està exhaurida.</div>`;
    if(p.nota_web)
      h += `<div style="font-size:12px;color:#c9d2e0;background:#20283a;border-radius:7px;padding:8px 10px;margin-bottom:8px">${p.nota_web}</div>`;
  } else if(p.tipus==='referencia' && p.totalitat_s){
    h += `<div style="margin-bottom:8px"><span class="pill" style="background:#5ec8d8;color:#08222a">Totalitat ${mmss(p.totalitat_s)}</span> <span style="font-size:11px;color:#8d99ad">sense punt oficial</span></div>`;
  } else if(p.tipus==='referencia'){
    h += `<div style="margin-bottom:9px;font-size:12.5px">Dins la franja de totalitat, però <b>sense punt oficial habilitat</b>: no hi haurà aparcament organitzat, ni lavabos, ni ulleres repartides, ni Mossos regulant. I l'accés al municipi sí que estarà regulat amb sentits únics.</div>`;
  }
  if(p.tipus==='bonarea'){
    h += `<div style="font-size:12.5px;margin-bottom:8px">Obert cada dia <b>8:00–22:00</b>. Migdia 9 € entre setmana. Nens fins a 110 cm, gratis.</div>`;
    h += `<div class="note" style="margin:0 0 8px">La totalitat és a les 20:29. Aquí només hi arribes a sopar <b>després</b>, i tanquen a les 22:00.</div>`;
  }
  h += `<div style="font-size:12px;display:flex;gap:14px;margin:9px 0;padding:8px 0;border-top:1px solid #28303f;border-bottom:1px solid #28303f">`+
       `<div><div style="color:#5c677a;font-size:10px;text-transform:uppercase;letter-spacing:.6px">Des de Tiana</div><b class="num">${hm(p.min_tiana)}</b></div>`+
       `<div><div style="color:#5c677a;font-size:10px;text-transform:uppercase;letter-spacing:.6px">Cel</div><b>Bortle ${String(p.bortle).replace('.',',')}</b></div>`+
       `<div><div style="color:#5c677a;font-size:10px;text-transform:uppercase;letter-spacing:.6px">Nit astron.</div><b class="num">${p.nit_ini}</b></div></div>`;
  h += `<div style="font-size:11px;color:#5c677a;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Perseids · meteors per hora</div>`;
  h += meteorTable(p);
  if(p.web) h += `<div class="navrow"><a href="${p.web}" target="_blank" rel="noopener">Pàgina oficial del punt →</a></div>`;
  h += navLinks(p.lat, p.lon, p.municipi);
  return h;
}

function fitxaPoi(p){
  const tanca = /TANCAT/.test(p.horari);
  const exh   = /EXHAURITS/.test(p.horari);
  let h = `<h4>${p.nom}</h4><div style="color:#8d99ad;font-size:11.5px;margin-bottom:8px">${p.municipi} · ${p.comarca}</div>`;
  h += `<div style="font-size:12.5px;margin-bottom:9px">${p.descripcio}</div>`;
  if(p.fresc) h += `<div style="margin-bottom:8px"><span class="pill" style="background:#1d3a44;color:#7fd4e8">Interior · bo per al migdia</span></div>`;
  else h += `<div style="margin-bottom:8px"><span class="pill" style="background:#3d2a18;color:#e8b070">Exterior · evita 13–17 h</span></div>`;
  h += `<table style="font-size:12px">`+
       `<tr><td style="color:#5c677a;width:72px">Horari</td><td${(tanca||exh)?' style="color:#f0a8a8"':''}>${p.horari}</td></tr>`+
       `<tr><td style="color:#5c677a">Preu</td><td>${p.preu}</td></tr>`+
       `<tr><td style="color:#5c677a">Reserva</td><td${/OBLIGAT|IMPRESCIND/.test(p.reserva)?' style="color:#f0c078"':''}>${p.reserva}</td></tr>`+
       `<tr><td style="color:#5c677a">Durada</td><td>${p.durada}</td></tr></table>`;
  h += `<div class="navrow"><a href="${p.url}" target="_blank" rel="noopener">Web oficial →</a></div>`;
  h += navLinks(p.lat, p.lon, p.nom);
  return h;
}

const byName = {};
D.punts.forEach(p=>{
  const k = p.tipus==='bonarea' ? 'bon' : tkey(p.totalitat_s);
  const col = p.tipus==='bonarea' ? '#b48ce0' : tcol(p.totalitat_s);
  const r = p.tipus==='oficial' ? 9 : 7;
  const m = L.marker([p.lat,p.lon],{icon:L.divIcon({className:'',
    html:`<div class="mk" style="width:${r*2}px;height:${r*2}px;background:${col}"></div>`,
    iconSize:[r*2,r*2], iconAnchor:[r,r]})}).bindPopup(fitxa(p),{maxWidth:340});
  m.addTo(groups[k]);
  byName[p.nom] = m;
  if(p.tipus==='oficial'){
    const lab = L.marker([p.lat,p.lon],{icon:L.divIcon({className:'mk-lab',
      html:`<div>${p.municipi}&nbsp;·&nbsp;${p.totalitat_s}s</div>`,
      iconSize:[110,14], iconAnchor:[55,-8]}),interactive:false});
    // El Camp de Tarragona té 7 punts en 25 km: les seves etiquetes només surten en zoom proper
    lab.addTo(DENS.has(p.municipi) ? labelsZoom : labels);
  }
});

// Pàrquings oficials d'un punt (P1 sempre el més gran), amb el rètol
// dimensionat per superfície. Només en zoom proper: de lluny taparien el punt.
const parkings = L.layerGroup();
D.punts.forEach(p=>{
  (p.parquings||[]).forEach(pk=>{
    const lab = 'P'+pk.n;
    const w = Math.max(8 + 6*lab.length, Math.min(28, Math.round(Math.sqrt(pk.m2||0)/4)));
    const h = Math.round(w*.68);
    const dm = Math.hypot((pk.lat-p.lat)*111320,
                          (pk.lon-p.lon)*111320*Math.cos(p.lat*Math.PI/180));
    const dtxt = dm < 950 ? 'uns '+Math.round(dm/50)*50+' m'
                          : 'uns '+String(Math.round(dm/100)/10).replace('.',',')+' km';
    const dades = [];
    if(pk.m2) dades.push(pk.m2.toLocaleString('ca')+' m²');
    // més enllà de ~2 km ja no és «el pàrquing del punt»: la distància confon
    if(dm < 2200) dades.push(`a ${dtxt} del punt d'observació`);
    L.marker([pk.lat,pk.lon],{icon:L.divIcon({className:'',
      html:`<div class="mk-p" style="width:${w}px;height:${h}px">${lab}</div>`,
      iconSize:[w,h], iconAnchor:[w/2,h/2]})})
      .bindPopup(`<h4>Pàrquing ${pk.n} · ${p.municipi}</h4>`
        + (pk.nota ? `<div style="font-size:12.5px;margin-bottom:6px">${pk.nota}</div>` : '')
        + (dades.length ? `<div style="font-size:12px;color:#8d99ad">${dades.join(' · ')}</div>` : '')
        + navLinks(pk.lat, pk.lon, `Pàrquing ${pk.n} ${p.municipi}`), {maxWidth:280})
      .addTo(parkings);
  });
});

D.pois.forEach(p=>{
  L.marker([p.lat,p.lon],{icon:L.divIcon({className:'',
    html:`<div class="mk" style="width:12px;height:12px;background:#7ea8f0;opacity:.9"></div>`,
    iconSize:[12,12], iconAnchor:[6,6]})}).bindPopup(fitxaPoi(p),{maxWidth:330}).addTo(groups.poi);
});

L.marker(TIANA,{icon:L.divIcon({className:'',
  html:`<div class="mk" style="width:16px;height:16px;background:#6fd39a"></div>`,
  iconSize:[16,16],iconAnchor:[8,8]})})
  .bindPopup('<h4>Tiana</h4><div style="font-size:12.5px">Punt de sortida. Bortle 6 — aquí els Perseids es queden en ~10/h a la 01:00.</div>')
  .addTo(groups.home);

// llegim el PNG a un canvas per poder consultar-lo punt per punt
let ombCv = null;
(function(){
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    c.getContext('2d', {willReadFrequently:true}).drawImage(im,0,0);
    ombCv = c;
  };
  im.src = OMB.png;
})();
const ymer = L => Math.log(Math.tan(Math.PI/4 + L*Math.PI/360));
function consultaOmbra(ll){
  if(!ombCv) return null;
  const [[n,w],[s,e]] = OMB.bounds;
  if(ll.lat>n || ll.lat<s || ll.lng<w || ll.lng>e) return null;
  const x = Math.floor((ll.lng-w)/(e-w)*ombCv.width);
  const y = Math.floor((ymer(n)-ymer(ll.lat))/(ymer(n)-ymer(s))*ombCv.height);
  const d = ombCv.getContext('2d').getImageData(Math.max(0,Math.min(ombCv.width-1,x)),
                                                Math.max(0,Math.min(ombCv.height-1,y)),1,1).data;
  return d[3];
}
map.on('click', ev => {
  const a = consultaOmbra(ev.latlng);
  if(a === null) return;
  const ok = a < 40, mig = a >= 40 && a < 110;
  const col = ok ? '#6fd39a' : mig ? '#e8b84b' : '#e07a7a';
  const txt = ok ? 'Aquí es veu el Sol' : mig ? 'Just al límit' : 'Aquí et tapa el relleu';
  const sub = ok ? 'Horitzó lliure a 285,7° · 4,7°. Confirma-ho igualment in situ.'
            : mig ? "Zona de transició. No t'hi juguis: mou-te un centenar de metres."
            : 'La línia de visió cap al Sol topa amb el terreny.';
  L.popup({maxWidth:250}).setLatLng(ev.latlng)
    .setContent(`<div style="font-weight:600;color:${col};margin-bottom:3px">${txt}</div>`+
                `<div style="font-size:12px;color:#8d99ad">${sub}</div>`+
                `<div style="font-size:11px;color:#5c677a;margin-top:7px" class="mono">`+
                `${ev.latlng.lat.toFixed(5)}, ${ev.latlng.lng.toFixed(5)}</div>`+
                navLinks(ev.latlng.lat.toFixed(5), ev.latlng.lng.toFixed(5), '')).openOn(map);
});

document.querySelectorAll('[data-base]').forEach(el=>el.addEventListener('click',()=>setBase(el.dataset.base)));
setBase('carreteres');

// enquadrem la franja de totalitat a la pantalla que toqui
map.fitBounds(L.latLngBounds(
  D.punts.filter(p=>p.tipus==='oficial').map(p=>[p.lat,p.lon])
), {padding: MOBIL ? [26,26] : [60,60], paddingBottomRight: MOBIL ? [26,120] : [60,60]});

document.querySelectorAll('[data-l]').forEach(c=>c.addEventListener('change',e=>{
  const g = groups[e.target.dataset.l];
  e.target.checked ? map.addLayer(g) : map.removeLayer(g);
}));
let lblOn = true;
// al mòbil la pantalla és estreta: pugem el llindar perquè no s'amunteguin
const Z_LAB = MOBIL ? 9 : 0, Z_LAB_DENS = MOBIL ? 11 : 10, Z_PARK = 13;
function syncLabels(){
  const z = map.getZoom();
  (lblOn && z >= Z_LAB)      ? map.addLayer(labels)     : map.removeLayer(labels);
  (lblOn && z >= Z_LAB_DENS) ? map.addLayer(labelsZoom) : map.removeLayer(labelsZoom);
  (z >= Z_PARK) ? map.addLayer(parkings) : map.removeLayer(parkings);
}
document.getElementById('lbl').addEventListener('change',e=>{ lblOn = e.target.checked; syncLabels(); });
const ombChk = document.getElementById('omb'), ombRng = document.getElementById('ombOp');
ombChk.addEventListener('change',e=>{
  e.target.checked ? map.addLayer(ombres) : map.removeLayer(ombres);
});
ombRng.addEventListener('input',e=>{
  const v = +e.target.value;
  ombres.setOpacity(v/100);
  document.getElementById('ombOpV').textContent = v+'%';
  if(v>0 && !ombChk.checked){ ombChk.checked = true; map.addLayer(ombres); }
});
map.on('zoomend', syncLabels);
syncLabels();
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.pane').forEach(x=>x.classList.remove('on'));
  t.classList.add('on');
  document.getElementById('p-'+t.dataset.p).classList.add('on');
  if(MOBIL) obre(true);                    // tocar una pestanya obre el full
}));

/* ---------- full de baix (mòbil) ---------- */
const side = document.getElementById('side'), grab = document.getElementById('grab');
function obre(v){
  document.body.classList.toggle('obert', v);
  setTimeout(()=>map.invalidateSize(), 300);
}
// El cop d'ull surt del CSS, que hi suma la barra d'inici de l'iPhone.
function peek(){
  const v = parseFloat(getComputedStyle(side).getPropertyValue('--peek'));
  return isNaN(v) ? 104 : v;
}
if(MOBIL){
  let y0 = null, t0 = 0;
  grab.addEventListener('click', () => obre(!document.body.classList.contains('obert')));
  grab.addEventListener('pointerdown', e => { y0 = e.clientY; t0 = Date.now();
    side.style.transition = 'none'; grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointermove', e => {
    if(y0 === null) return;
    const obert = document.body.classList.contains('obert');
    const base = obert ? 0 : side.offsetHeight - peek();
    const d = Math.max(0, Math.min(side.offsetHeight, base + (e.clientY - y0)));
    side.style.transform = `translateY(${d}px)`;
  });
  const fi = e => {
    if(y0 === null) return;
    const dy = e.clientY - y0, dt = Date.now() - t0;
    side.style.transition = ''; side.style.transform = '';
    const rapid = Math.abs(dy)/dt > 0.4;
    if(dy < -30 || (rapid && dy < 0)) obre(true);
    else if(dy > 30 || (rapid && dy > 0)) obre(false);
    y0 = null;
  };
  grab.addEventListener('pointerup', fi);
  grab.addEventListener('pointercancel', fi);
  // en obrir un popup, tanquem el full perquè no el tapi
  map.on('popupopen', () => obre(false));
}

/* ---------- Rànquing ---------- */
(function(){
  const of = D.punts.filter(p=>p.tipus==='oficial');
  // puntuació: 55% durada normalitzada + 45% meteors a la 01:00 normalitzats
  const maxT = Math.max(...of.map(p=>p.totalitat_s));
  const maxM = Math.max(...of.map(p=>p.taxes['01:00'].hr));
  of.forEach(p=>{ p._sc = .55*(p.totalitat_s/maxT) + .45*(p.taxes['01:00'].hr/maxM); });
  const rank = [...of].sort((a,b)=>b._sc-a._sc);
  let h = `<div class="note" style="margin-top:0">Combinació de durada de la totalitat (55 %) i meteors visibles a la 01:00 (45 %). Clica per centrar el mapa.</div>`;
  h += `<h2>Els millors per al pla sencer</h2>`;
  rank.forEach((p,i)=>{
    h += `<div class="rank" data-go="${p.nom}">`+
         `<div><div class="n">${i+1}. ${p.municipi}</div>`+
         `<div class="s">${mmss(p.totalitat_s)} · Bortle ${String(p.bortle).replace('.',',')} · ${hm(p.min_tiana)} de cotxe`+
         `${p.reserva==='exhaurida' ? ' · <span style="color:#e07a7a">reserva exhaurida</span>' : ''}</div></div>`+
         `<div class="v" style="color:${tcol(p.totalitat_s)}">${p.taxes['01:00'].hr}/h</div></div>`;
  });
  h += `<h2>Comparativa hora a hora</h2>`;
  const top = rank.slice(0,6);
  h += `<table><tr><th>Hora</th>${top.map(p=>`<th>${p.municipi.replace('les ','').replace("L'",'').slice(0,7)}</th>`).join('')}</tr>`;
  HORES.forEach(hh=>{
    h += `<tr><td class="num" style="color:#8d99ad">${hh}</td>`+
         top.map(p=>`<td class="num">${p.taxes[hh].hr}</td>`).join('')+`</tr>`;
  });
  h += `</table><div class="note">Meteors per hora que veuria un observador amb tot el cel a la vista. A la pràctica, un sol parell d'ulls en capta el 70–80 %.</div>`;
  h += `<div class="warn"><b>Compte amb el rànquing.</b> Puntua astronomia, no logística. Alcanar i Santa Bàrbara guanyen però són 2 h 15 de tornada a les 3 de la matinada.</div>`;
  document.getElementById('p-rank').innerHTML = h;
  document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>{
    const m = byName[el.dataset.go];
    map.flyTo(m.getLatLng(), 12, {duration:.8});
    setTimeout(()=>m.openPopup(), 850);
  }));
})();

/* ---------- El dia ---------- */
document.getElementById('p-dia').innerHTML = `
<h2>Guió del 12 d'agost</h2>
<div class="tl">
  <div class="tl-i"><span class="tl-t">09:30</span> <span class="tl-x">Sortida de Tiana. Anar per l'AP-7 abans del migdia; a partir de les 16:00 hi haurà retencions.</span></div>
  <div class="tl-i"><span class="tl-t">11:30</span> <span class="tl-x">Primera visita exterior, encara suportable de temperatura.</span></div>
  <div class="tl-i"><span class="tl-t">13:30</span> <span class="tl-x"><b>Dinar: doneu per fet que no trobareu taula.</b> Nevera portàtil i entrepans de casa. Els pobles de la franja estaran a rebentar i les cuines petites no donaran l'abast ni amb reserva.</span></div>
  <div class="tl-i"><span class="tl-t">·</span> <span class="tl-x">Pla B si es fa tard: bufet bonÀrea de <b>Montblanc</b> o <b>Reus</b>, oberts 8:00–22:00. No és cap meravella, però tenen capacitat i rotació ràpida, que és exactament el que faltarà aquell dia. Compteu cua igualment.</span></div>
  <div class="tl-i"><span class="tl-t">15:00</span> <span class="tl-x">Hores de forn: cova, mina o museu. Fora fa 35–40 °C.</span></div>
  <div class="tl-i"><span class="tl-t">17:30</span> <span class="tl-x">Cap al punt d'observació. Compreu aigua i gel <b>abans</b>: els pobles de la franja quedaran escurats.</span></div>
  <div class="tl-i key"><span class="tl-t">18:45</span> <span class="tl-x">Ser al punt. Comprovar que l'horitzó oest-nord-oest és net.</span></div>
  <div class="tl-i"><span class="tl-t">19:35</span> <span class="tl-x">Comença la fase parcial. Ulleres homologades <b>obligatòries</b> tota aquesta hora.</span></div>
  <div class="tl-i key"><span class="tl-t">20:29</span> <span class="tl-x"><b>Totalitat.</b> És l'únic moment en què es poden treure les ulleres. Mireu la corona, i mireu les nenes.</span></div>
  <div class="tl-i"><span class="tl-t">20:31</span> <span class="tl-x">Ulleres posades altre cop. El Sol es pon poc després, encara eclipsat.</span></div>
  <div class="tl-i"><span class="tl-t">20:40</span> <span class="tl-x">Comença la caravana de sortida. <b>No marxeu ara.</b> Sopar allà mateix i deixar-la passar.</span></div>
  <div class="tl-i"><span class="tl-t">22:45</span> <span class="tl-x">Nit astronòmica. Cel del tot fosc. Primers Perseids.</span></div>
  <div class="tl-i"><span class="tl-t">23:30</span> <span class="tl-x">Radiant a uns 20°. Ja en cauen de bons, i els que hi ha són llargs i rasants.</span></div>
  <div class="tl-i key"><span class="tl-t">01:00</span> <span class="tl-x"><b>Un cada minut</b>, si sou en cel Bortle 2–3. Aquest és el moment que buscaves.</span></div>
  <div class="tl-i"><span class="tl-t">01:30</span> <span class="tl-x">Hora raonable de plegar amb nenes. Carretera ja buida.</span></div>
</div>
<h2>Què cal portar</h2>
<div class="card"><div style="font-size:12.5px;line-height:1.75">
Ulleres d'eclipsi <b>homologades ISO 12312-2</b> (una per cap, no compartides) · matalassos o esterilles per estirar-se de cara al nord-est · jerseis (a la Terra Alta de nit refresca) · llanterna de <b>llum vermella</b> o cel·lo vermell al mòbil · repel·lent si aneu al Delta · aigua i gel comprats abans d'entrar a la franja · un termo de xocolata desfeta a la matinada guanya qualsevol argument.
</div></div>
<div class="tip"><b>Adaptació a la foscor:</b> 15–20 minuts sense mirar cap pantalla i es multipliquen els meteors que veieu. És la millora gratuïta més gran de tota la nit.</div>
<div class="warn"><b>Mai sense ulleres durant la fase parcial.</b> Ni un segon, ni amb el Sol molt baix, ni a través del mòbil. La totalitat dura 1 minut i és l'única finestra segura a ull nu.</div>
`;

/* ---------- Notes ---------- */
document.getElementById('p-info').innerHTML = `
<h2>Dades i procedència</h2>
<div class="card"><div style="font-size:12.5px;line-height:1.7">
<b>Punts oficials i durades</b> — Generalitat de Catalunya, càlcul de l'IEEC. Són <b>18 punts a 18 municipis</b>, no 23: la xifra que circula compta subzones d'aparcament per separat.<br><br>
<b>Posició del Sol</b> — calculada amb efemèrides per a cada coordenada: azimut 285,6–286,1°, alçada 4,3–4,7°.<br><br>
<b>Perseids</b> — alçada del radiant calculada punt per punt; taxa segons ZHR 100, índex poblacional r = 2,2 i magnitud límit derivada del Bortle.<br><br>
<b>Ombres</b> — càlcul propi sobre el model digital d'elevacions Terrarium (AWS), zoom 11, uns 58 m de resolució. Per a cada píxel es marxa en la direcció del Sol fins a 22 km comprovant si el terreny supera la línia de visió, amb correcció de curvatura terrestre i refracció (radi efectiu 7/6 R). Ulls a 1,6 m.
</div></div>
<div class="warn"><b>El mapa d'ombres no veu els obstacles petits.</b> Modela el terreny, no els edificis, els arbres, els hivernacles ni el camió que t'aparcarà al davant. Amb el Sol a 4,7°, una filera de pollancres a 200 m ja te'l tapa i aquí sortirà verd. Serveix per descartar llocs, no per confirmar-los: l'única confirmació és anar-hi cap a les 20:25 i mirar.</div>
<div class="warn"><b>El Bortle és estimació meva</b>, no mesura de camp. La resta de xifres surten de font oficial o de càlcul astronòmic. Si un punt et convenç, val la pena contrastar-lo amb un mapa de contaminació lumínica.</div>
<h2>Coses que canvien la decisió</h2>
<div class="card"><div style="font-size:12.5px;line-height:1.7">
<b>Museu del Ferrocarril de Móra la Nova: tancat el dia 12.</b> Només obre caps de setmana. Cal reserva telefònica per anar-hi entre setmana.<br><br>
<b>MónNatura Delta: packs de tarda i dia sencer exhaurits.</b> Només queda la visita del matí, i amb reserva obligatòria.<br><br>
<b>Els recintes romans de Tarragona tanquen a les 19:00</b> el dia 12, expressament per l'eclipsi.<br><br>
<b>Mines de Bellmunt i Coves de Benifallet: reserva.</b> Amb l'allau de turisme d'eclipsi, no us hi presenteu sense.<br><br>
<b>Deltebre, la Sénia i Tortosa no tenen punt oficial</b> tot i ser dins la franja. La Sénia i Alcanar són el màxim de Catalunya, ~97 s.<br><br>
<b>Valls: reserva exhaurida.</b> Van ampliar de 4.100 a 5.000 places i es van esgotar en 24 hores. Demanen que qui no hi pugui anar l'anul·li, o sigui que val la pena tornar-ho a mirar.<br><br>
<b>Reserves també exhaurides a Torredembarra, Cambrils, Reus i Lleida.</b> A Montbrió cal reserva de plaça d'aparcament. Els punts de les Terres de l'Ebre i la Terra Alta són d'accés lliure.<br><br>
<b>Tarragona no té un punt únic tancat</b>: reparteixen 23.000 ulleres i concentren la jornada a Marina Port Tàrraco.<br><br>
<b>Comproveu la pàgina oficial de cada punt</b> (botó a la fitxa) abans de sortir: és on publiquen reserves, horaris d'obertura i llançadores. Jo només he verificat la de Valls i la de Tarragona en detall.
</div></div>
<h2>Trànsit</h2>
<div class="card"><div style="font-size:12.5px;line-height:1.7">
Camions prohibits a l'AP-7 sentit sud (Martorell–Ulldecona) i a la N-340 de 17:00 a 24:00. Recomanen <b>A-7 i N-340</b> en lloc de l'AP-7.<br><br>
Regulació especial d'accés amb sentits únics a <b>l'Ampolla, l'Aldea, Deltebre, Sant Jaume d'Enveja, Amposta i la Ràpita</b>.<br><br>
700 Mossos desplegats. Avisen de <b>no fiar-se del GPS</b>: hi haurà desviaments temporals no cartografiats.
</div></div>
<div class="note" style="margin-top:16px">
Fonts: <a href="https://eclipsicatalunya.cat/punts-d-observacio/" target="_blank" rel="noopener">eclipsicatalunya.cat</a> ·
<a href="https://eclipsi26.com/ca/" target="_blank" rel="noopener">eclipsi26.com (IEEC)</a> ·
<a href="https://serviastro.ub.edu/en/phenomena/solar-eclipse/total-solar-eclipse-august-12th-2026" target="_blank" rel="noopener">Serviastro UB</a> ·
<a href="https://www.bonarea.com/ca/default/presentationbuffets" target="_blank" rel="noopener">bonÀrea</a>
</div>
`;

/* ==========================================================================
   Afegits per a mòbil i per a treballar sense cobertura
   ========================================================================== */

/* ---------- avisos flotants ---------- */
const xip = document.getElementById('xip');
let xipTimer = null;
function avis(txt, mena, ms){
  clearTimeout(xipTimer);
  xip.textContent = txt;
  xip.className = 'avis' + (mena ? ' ' + mena : '');
  xip.hidden = false;
  if(ms !== 0) xipTimer = setTimeout(() => { xip.hidden = true; }, ms || 3400);
}
addEventListener('offline', () => avis('Sense connexió. Es fa servir el mapa desat.', 'mal', 0));
addEventListener('online',  () => { if(xip.classList.contains('mal')) xip.hidden = true; });
if(!navigator.onLine) avis('Sense connexió. Es fa servir el mapa desat.', 'mal', 0);


/* ---------- servei de fons ---------- */
if('serviceWorker' in navigator){
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).then(reg => {
      reg.addEventListener('updatefound', () => {
        const nou = reg.installing;
        if(!nou) return;
        nou.addEventListener('statechange', () => {
          // només és una actualització si ja hi havia una versió manant
          if(nou.state === 'installed' && navigator.serviceWorker.controller){
            const banda = document.getElementById('nova');
            banda.hidden = false;
            document.getElementById('nova-b').onclick = () => {
              banda.hidden = true;
              nou.postMessage('activa');
            };
          }
        });
      });
      document.addEventListener('visibilitychange', () => {
        if(!document.hidden) reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
  // La primera visita també canvia de controlador (clients.claim) i allà no cal
  // recarregar res. Però el senyal s'ha d'anar actualitzant: si ens quedéssim
  // amb la foto del moment de carregar, en una primera visita que després rep
  // una actualització el botó «Actualitza» no faria res.
  let jaManava = !!navigator.serviceWorker.controller;
  let recarregant = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(!jaManava){ jaManava = true; return; }   // primera presa de control
    if(recarregant) return;
    recarregant = true;
    location.reload();
  });
}


/* ---------- mapes fora de línia ---------- */
const TCACHE = 'eclipsi-tiles-v1';
// Tot el domini del model d'ombres, i la franja on realment anirem.
const REGIO  = {n:41.80, s:40.40, w:0.05, e:1.65};
const FRANJA = {n:41.70, s:40.45, w:0.20, e:1.60};
// kB per tessel·la, mesurats sobre aquestes mateixes caixes (no és el mateix
// una tessel·la de mar que una de Reus, però la mitjana surt molt estable)
const PES = {carreteres:8, satelit:17, relleu:17, fosc:5};

const lon2x = (lon,z) => Math.floor((lon+180)/360 * Math.pow(2,z));
const lat2y = (lat,z) => {
  const r = lat*Math.PI/180;
  return Math.floor((1 - Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2 * Math.pow(2,z));
};

// Zooms baixos: tota la regió. Zooms alts: només un quadrat al voltant de
// cada punt d'observació, museu o bufet — la resta no la mirarem mai.
function llistaTesseles(zmax){
  const out = [], vist = new Set();
  const afegeix = (z,x,y) => {
    const k = z+'/'+x+'/'+y;
    if(vist.has(k)) return;
    vist.add(k); out.push([z,x,y]);
  };
  const caixa = (z,b) => {
    for(let x = lon2x(b.w,z); x <= lon2x(b.e,z); x++)
      for(let y = lat2y(b.n,z); y <= lat2y(b.s,z); y++) afegeix(z,x,y);
  };
  for(let z = 6; z <= 11; z++) caixa(z, REGIO);
  caixa(12, FRANJA);
  const llocs = [...D.punts.map(p=>[p.lat,p.lon]), ...D.pois.map(p=>[p.lat,p.lon]), TIANA];
  for(let z = 13; z <= zmax; z++){
    const km = z >= 15 ? 2 : 3;
    for(const [lat,lon] of llocs){
      const dl = km/111, dg = km/(111*Math.cos(lat*Math.PI/180));
      caixa(z, {n:lat+dl, s:lat-dl, w:lon-dg, e:lon+dg});
    }
  }
  return out;
}

const urlTessela = (base,z,x,y) => L.Util.template(BASES[base].url, {x:x, y:y, z:z, r:'', s:'a'});

const mb = b => (b/1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';

const offCard   = document.getElementById('off-card');
const offTitol  = document.getElementById('off-titol');
const offSub    = document.getElementById('off-sub');
const offEstim  = document.getElementById('off-estim');
const offProg   = document.getElementById('off-prog');
const offPbar   = document.getElementById('off-pbar');
const offPtxt   = document.getElementById('off-progtxt');
const offBaixa  = document.getElementById('off-baixa');
const offEsborra= document.getElementById('off-esborra');

const hiHaCache = 'caches' in self && isSecureContext;

function zmaxTriat(){
  const b = document.querySelector('#off-detallzoom button.on');
  return b ? +b.dataset.zmax : 14;
}
function basesTriades(){
  return [...document.querySelectorAll('.off-base:checked')].map(e => e.value);
}

function pintaEstimacio(){
  const bases = basesTriades();
  const n = llistaTesseles(zmaxTriat()).length;
  if(!bases.length){ offEstim.textContent = 'Tria almenys un fons de mapa.'; return; }
  const kb = bases.reduce((s,b) => s + PES[b], 0) * n;
  offEstim.innerHTML = `${(n*bases.length).toLocaleString('ca')} tessel·les · <b>uns ${mb(kb*1024)}</b>`;
}

async function pintaEstat(){
  if(!hiHaCache){
    offTitol.textContent = 'No disponible en aquest navegador';
    offSub.textContent = 'Cal HTTPS i un navegador recent.';
    document.getElementById('off-toggle').hidden = true;
    return;
  }
  const c = await caches.open(TCACHE);
  const n = (await c.keys()).length;
  let us = null;
  try{ us = (await navigator.storage.estimate()).usage; }catch(e){}
  // Per sota d'unes quantes centenes són només les engrunes del que has mirat
  // navegant, no una descàrrega de debò: no diguem que ja està llest.
  const llest = n >= 400;
  offCard.classList.toggle('llest', llest);
  if(!llest){
    offTitol.textContent = 'Encara no hi ha mapa desat';
    offSub.textContent = "L'app ja funciona sense connexió, però el fons del mapa no.";
  } else {
    offTitol.textContent = n.toLocaleString('ca') + ' tessel·les desades';
    offSub.textContent = (us ? 'Ocupa uns ' + mb(us) + ' · ' : '') + 'el mapa es veurà sense cobertura';
  }
  offEsborra.classList.toggle('mut', n === 0);
}

let descarrega = null;   // {aturat:boolean}

async function baixaMapes(){
  if(!hiHaCache || descarrega) return;
  const bases = basesTriades();
  if(!bases.length){ avis('Tria almenys un fons de mapa', 'mal'); return; }

  // demanem que el sistema no ens esborri la memòria cau quan vagi just d'espai
  try{ await navigator.storage.persist(); }catch(e){}

  const llista = llistaTesseles(zmaxTriat());
  const feina = [];
  for(const b of bases) for(const [z,x,y] of llista) feina.push(urlTessela(b,z,x,y));

  const cache = await caches.open(TCACHE);
  const estat = {aturat:false};
  descarrega = estat;
  offProg.hidden = false;
  offBaixa.classList.add('mut');

  let fets = 0, nous = 0, bytes = 0, fallats = 0, i = 0;
  const pinta = () => {
    offPbar.style.width = (fets/feina.length*100).toFixed(1) + '%';
    offPtxt.textContent = `${fets.toLocaleString('ca')} / ${feina.length.toLocaleString('ca')}`
      + ` · ${mb(bytes)} baixats` + (fallats ? ` · ${fallats} fallades` : '');
  };
  pinta();

  async function obrer(){
    while(i < feina.length && !estat.aturat){
      const u = feina[i++];
      try{
        if(!(await cache.match(u))){
          const r = await fetch(u, {mode:'cors', credentials:'omit'});
          if(r.ok){
            bytes += (await r.clone().blob()).size;
            await cache.put(u, r);
            nous++;
          } else fallats++;
        }
      } catch(e){ fallats++; }
      fets++;
      if(fets % 10 === 0 || fets === feina.length) pinta();
    }
  }
  // sis a la vegada: prou per anar de pressa, no tant com per ofegar la xarxa
  await Promise.all(Array.from({length:6}, obrer));

  descarrega = null;
  offProg.hidden = true;
  offBaixa.classList.remove('mut');
  await pintaEstat();

  if(estat.aturat)
    avis(`Aturat. ${nous.toLocaleString('ca')} tessel·les noves desades.`, 'be');
  else if(fallats > feina.length*0.2)
    avis(`Acabat, però amb ${fallats} fallades. Torna-hi amb millor cobertura: es reprèn on ho ha deixat.`, 'mal', 7000);
  else
    avis('Mapa desat. Ja pots sortir de casa sense cobertura.', 'be', 5000);
}

if(hiHaCache){
  document.getElementById('off-toggle').addEventListener('click', e => {
    const d = document.getElementById('off-detall');
    d.hidden = !d.hidden;
    e.target.setAttribute('aria-expanded', String(!d.hidden));
    e.target.textContent = d.hidden ? 'Opcions' : 'Amaga';
    if(!d.hidden) pintaEstimacio();
  });
  document.querySelectorAll('#off-detallzoom button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#off-detallzoom button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    pintaEstimacio();
  }));
  document.querySelectorAll('.off-base').forEach(c => c.addEventListener('change', pintaEstimacio));
  offBaixa.addEventListener('click', e => { e.preventDefault(); baixaMapes(); });
  document.getElementById('off-atura').addEventListener('click', e => {
    e.preventDefault();
    if(descarrega) descarrega.aturat = true;
  });
  offEsborra.addEventListener('click', async e => {
    e.preventDefault();
    if(descarrega) descarrega.aturat = true;
    await caches.delete(TCACHE);
    await pintaEstat();
    avis('Mapes esborrats', 'be');
  });
}
pintaEstat();


/* ---------- on sóc ---------- */
const btnJo = document.getElementById('jo');
let joMarca = null, joCercle = null, vigila = null;

function paraJo(){
  if(vigila !== null) navigator.geolocation.clearWatch(vigila);
  vigila = null;
  btnJo.classList.remove('on','cercant');
  if(joMarca){ map.removeLayer(joMarca); joMarca = null; }
  if(joCercle){ map.removeLayer(joCercle); joCercle = null; }
}

function textOmbra(ll){
  const a = consultaOmbra(ll);
  if(a === null) return '<div style="font-size:12px;color:#8d99ad">Fora del mapa d\'ombres.</div>';
  const ok = a < 40, mig = a >= 40 && a < 110;
  const col = ok ? '#6fd39a' : mig ? '#e8b84b' : '#e07a7a';
  const txt = ok ? "D'aquí estant es veu el Sol" : mig ? 'Just al límit' : 'Aquí et tapa el relleu';
  return `<div style="font-weight:600;color:${col};margin-top:5px">${txt}</div>`;
}

btnJo.addEventListener('click', () => {
  if(vigila !== null){ paraJo(); return; }
  if(!navigator.geolocation){ avis('Aquest navegador no sap on ets', 'mal'); return; }
  btnJo.classList.add('cercant');
  let primer = true;
  vigila = navigator.geolocation.watchPosition(pos => {
    btnJo.classList.remove('cercant');
    btnJo.classList.add('on');
    const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
    const prec = pos.coords.accuracy;
    if(!joMarca){
      joMarca = L.marker(ll, {icon:L.divIcon({className:'',
        html:'<div class="jo-punt" style="width:16px;height:16px"></div>',
        iconSize:[16,16], iconAnchor:[8,8]}), zIndexOffset:1000}).addTo(map);
      joCercle = L.circle(ll, {radius:prec, color:'#4c9bff', weight:1,
        fillColor:'#4c9bff', fillOpacity:.12, interactive:false}).addTo(map);
    } else {
      joMarca.setLatLng(ll);
      joCercle.setLatLng(ll).setRadius(prec);
    }
    joMarca.bindPopup(
      `<h4>Ets aquí</h4>`
      + `<div style="font-size:11.5px;color:#8d99ad" class="mono">${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} · ±${Math.round(prec)} m</div>`
      + textOmbra(ll)
      + `<div class="note" style="margin:7px 0 0">El model no veu arbres ni edificis. Mira l'horitzó cap a l'oest-nord-oest.</div>`
      + navLinks(ll.lat.toFixed(5), ll.lng.toFixed(5), ''), {maxWidth:270});
    if(primer){
      primer = false;
      map.setView(ll, Math.max(map.getZoom(), 14));
      if(MOBIL) obre(false);
    }
  }, err => {
    paraJo();
    avis(err.code === 1 ? "Has de donar permís d'ubicació a l'app"
       : err.code === 3 ? 'El GPS triga massa. Prova-ho a fora.'
       : 'No s\'ha pogut saber on ets', 'mal', 5000);
  }, {enableHighAccuracy:true, timeout:20000, maximumAge:5000});
});


/* ---------- instal·lació ---------- */
const soloApp = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const banInstal = document.getElementById('instal');
let promptInstal = null;

function tancaInstal(){
  banInstal.hidden = true;
  try{ localStorage.setItem('instal-vist', '1'); }catch(e){}
}
document.getElementById('instal-x').addEventListener('click', tancaInstal);

let jaVist = false;
try{ jaVist = localStorage.getItem('instal-vist') === '1'; }catch(e){}

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  promptInstal = e;
  if(soloApp || jaVist) return;
  banInstal.hidden = false;
  document.getElementById('instal-b').onclick = async () => {
    banInstal.hidden = true;
    promptInstal.prompt();
    await promptInstal.userChoice;
    promptInstal = null;
  };
});

// A l'iPhone no hi ha cap diàleg d'instal·lació: cal dir-li a mà on és el botó.
if(IOS && !soloApp && !jaVist){
  const b = document.getElementById('instal-b');
  banInstal.querySelector('span').innerHTML =
    'Per tenir-la com a app: <b>Compartir</b> → <b>Afegeix a la pantalla d\'inici</b>';
  b.textContent = 'Entesos';
  b.onclick = tancaInstal;
  setTimeout(() => { banInstal.hidden = false; }, 1500);
}
