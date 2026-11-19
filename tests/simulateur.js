// Simulateur minimal de Grist, de Leaflet et du navigateur : permet de faire tourner index.html dans Node, sans navigateur.
// Utilisé par verifier.js. Aucune dépendance externe (Node 18 ou plus récent).
const fs = require('fs'), path = require('path');

const HTML = fs.readFileSync(process.env.CIFI_HTML || path.join(__dirname, '..', 'index.html'), 'utf8');   // CIFI_HTML : autre fichier à vérifier
const SCRIPT = HTML.split('<script>')[1].split('</script>')[0];   // le script principal de la page

// Accès à l'état interne du widget (ajouté en fin de script, uniquement pour les tests)
const EXPOSE = `;let _enr; globalThis.__t = { norm, dessiner, construire, modal, VERSION,
  setOnglet(v) { onglet = v; }, setPicker(v) { picker = v; }, setCols(c) { allCols = c; }, setOpts(o) { opts = o; },
  get cfg() { return cfg; }, get opts() { return opts; }, setCfg(c) { cfg = c; },
  fichier, ouvrirFiche, get marq() { return marqueurs; }, get fichePanel() { return panneau.innerHTML; },
  dansCommune, setZone(z) { communeZone = z; }, icone, caseG, typesT, stylesT, filtreSel, filtresBloc, setFiltres(d) { filtresDefs = d; }, get raz() { return document.getElementById('flt-raz'); }, majCluster, ouvrirProg, appliquerFiltres, majListe, majLegende, majSug, progDessiner, dessinerBarre, afficherMsg, setRech(v) { recherche = v; },
  demanderConfig, diagnostic, fermerReglages, iti, itiPanel, itiChercherAdresse, itiPosition, itiDessiner, itiAvert, itiTexte, get ouvert() { return modal.classList.contains('ouvert'); },
  coupeSauvegarde() { _enr = enregistrer; enregistrer = () => {}; }, rendSauvegarde() { if (_enr) enregistrer = _enr; }, get html() { return modal.innerHTML; } };`;

function proxyPermissif() {   // objet qui accepte tout appel et toute lecture (pour les parties de Leaflet sans importance ici)
  const f = function () { return proxyPermissif(); };
  return new Proxy(f, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : (k === 'length' ? 0 : (k === 'forEach' ? () => {} : proxyPermissif())), apply: () => proxyPermissif(), construct: () => proxyPermissif(), set: () => true });
}
function element() {   // faux élément HTML qui garde la trace des écouteurs d'événements
  const o = { _h: '', _cl: new Set(), _ev: {}, children: [], style: { setProperty() {} }, dataset: {},
    setAttribute() {}, removeAttribute() {}, appendChild() {}, querySelectorAll: () => [],
    addEventListener(t, f) { (o._ev[t] = o._ev[t] || []).push(f); },
    get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; if (globalThis.__ecrit) globalThis.__ecrit.push(String(v)); },
    get className() { return [...this._cl].join(' '); }, set className(v) { this._cl = new Set(String(v).split(' ').filter(Boolean)); } };
  o.classList = { add: c => o._cl.add(c), remove: c => o._cl.delete(c), contains: c => o._cl.has(c), toggle: c => { o._cl.has(c) ? o._cl.delete(c) : o._cl.add(c); return o._cl.has(c); } };
  const q = {}; o.querySelector = s => q[s] || (q[s] = { set textContent(v) { this._t = v; }, get textContent() { return this._t || ''; }, addEventListener() {}, classList: { add() {}, remove() {} }, select() {}, value: '' });
  return o;
}

function charger() {
  const els = {}, doc = { querySelector: () => element(), getElementById: id => els[id] || (els[id] = element()), createElement: () => element(),
    body: { appendChild() {}, classList: { toggle() {} } }, addEventListener() {}, execCommand: () => false };
  const rappels = {};
  // Serveur simulé : globalThis.__serveur = { mode: 'accepte' | 'refuse' | 'illisible', echo: true|false }
  const grist = { ready() {}, onOptions(f) { rappels.opt = f; }, onRecords(f) { rappels.rec = f; }, onRecord(f) { rappels.r1 = f; },
    docApi: { async getAccessToken() { return { token: 'JETON-SECRET', baseUrl: 'https://exemple.test/api/docs/abc' }; }, async fetchTable(nom) { const sv = globalThis.__serveur || {}; if (nom !== '_grist_Views_section' || sv.mode === 'illisible') throw new Error('non simulé'); const base = sv.mode === 'inconnu' ? { autre: 1 } : { cfg: { entetes: {} } }; return { options: [JSON.stringify(sv.options || base)] }; } },
    mapColumnNames: r => r.map(x => ({ id: x.id, nom: x.Nom, lat: x.Latitude, lng: x.Longitude })), setSelectedRows() {}, setOption() {}, setOptions(o) { const sv = globalThis.__serveur; if (sv) { if (sv.mode === 'accepte') sv.options = JSON.parse(JSON.stringify(o)); if (sv.echo !== false) setTimeout(() => rappels.opt && rappels.opt(JSON.parse(JSON.stringify(o))), 30); } return Promise.resolve(); } };
  const L = new Proxy(function () {}, { get: (t, k) => {
    if (k === 'marker') return ll => { let pos = ll; return { _cifi: null, getLatLng: () => ({ lat: pos[0], lng: pos[1] }), setLatLng: p => { pos = p; }, setIcon() {}, bindPopup() { return this; }, on() { return this; }, isPopupOpen: () => false, openPopup() {}, addTo() { return this; }, getPopup: () => ({ update() {} }) }; };
    if (k === 'divIcon') return o => o;
    if (k === 'latLng') return (a, b) => ({ lat: a, lng: b });
    if (k === 'markerClusterGroup' || k === 'layerGroup' || k === 'featureGroup') return () => { const s = new Set(); return { addLayer: m => s.add(m), removeLayer: m => s.delete(m), hasLayer: m => s.has(m), clearLayers() { s.clear(); }, on() { return this; }, addTo() { return this; }, getLayers: () => [...s], getBounds: () => ({}) }; };
    return proxyPermissif()[k]; } });
  const run = new Function('L', 'grist', 'document', 'location', 'window', 'alert', 'fetch', 'sessionStorage', SCRIPT + EXPOSE);
  const loc = { search: '' }; globalThis.__loc = loc;   // modifiable par les tests (ex. ?diag=1)
  run(L, grist, doc, loc, { innerWidth: 1000, innerHeight: 700, print() {} }, () => {}, (...a) => (globalThis.__fetch || (() => Promise.resolve({ ok: false })))(...a), { getItem: () => null, setItem() {} });
  return { T: globalThis.__t, rappels };
}
module.exports = { charger, SCRIPT, HTML };
