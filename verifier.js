// Vérifications automatiques de index.html.
//   node tests/verifier.js          vérifie le fichier (code de sortie 1 si un problème est détecté)
//   node tests/verifier.js --maj    enregistre le comportement actuel comme nouvelle référence (après un changement voulu)
//   CIFI_HTML=autre.html node tests/verifier.js    vérifie un autre fichier
const { charger, SCRIPT } = require('./simulateur.js');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const REF = path.join(__dirname, 'reference.json'), MAJ = process.argv.includes('--maj');
let echecs = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) echecs++; };
const copie = x => JSON.parse(JSON.stringify(x));

console.log('1. Contrôles statiques du code');
try { new Function(SCRIPT); ok(true, 'le script est syntaxiquement correct'); } catch (e) { ok(false, 'erreur de syntaxe : ' + e.message); }
ok(!/\beval\(|new Function|document\.write/.test(SCRIPT), 'aucune exécution de code dynamique (eval, new Function, document.write)');
const adresses = [...new Set(SCRIPT.match(/https?:\/\/[A-Za-z0-9.\-]+/g) || [])], permises = ['data.geopf.fr', 'geo.api.gouv.fr', 'grist.numerique.gouv.fr', 'www.w3.org'];
ok(adresses.every(u => permises.some(p => u.includes(p))), 'les seuls services externes cités sont ceux prévus (' + adresses.map(u => u.replace(/^https?:\/\//, '')).join(', ') + ')');
const appelees = new Set(SCRIPT.match(/(?<![\w.$])[A-Za-z_]\w*(?=\()/g)), connus = new Set('if for while switch catch function return typeof await async new Math JSON Object Array String Number Boolean Date Set Map Promise RegExp Error Event parseInt parseFloat isNaN isFinite setTimeout clearTimeout setInterval clearInterval fetch alert encodeURIComponent decodeURIComponent L grist document window location navigator console Intl Symbol super'.split(' '));
const manquantes = [...appelees].filter(n => !connus.has(n) && !new RegExp('\\bfunction\\s+' + n + '\\b|\\b(const|let|var)\\s+' + n + '\\b|[(,{\\[]\\s*' + n + '\\s*[,)=:}]|\\b' + n + '\\s*=>').test(SCRIPT) && /^[a-z]\w*[A-Z_]|^(bloc|carte|menu|sel|auto|opt|fmt|n[A-Z])/.test(n));
ok(manquantes.length === 0, 'aucune fonction appelée sans être définie' + (manquantes.length ? ' : ' + manquantes.join(', ') : ''));

const { T, rappels } = charger();
const ONGLETS = ['points', 'popup', 'fiche', 'filtres', 'encarts', 'messages', 'prog', 'barre', 'general'], COLS = ['Nom', 'Type', 'Statut', 'Date'];
const COMPLETE = { regles: [{ si: [{ c: 'Type', op: '=', v: 'x' }, { c: 'Statut', op: 'contient', v: 'y' }], couleur: '#c1121f', forme: 'carre', o: true, bulle: { t: 'coin', src: 'col', c: 'Type', e: '!', couleur: '#336699', pulse: true }, pulse: { on: true, couleur: '#c1121f', rythme: 'rapide' }, contenu: { t: 'emoji', e: 'A', c: '' } },
    { si: [{ c: 'Statut', op: 'vide', v: '' }], couleur: '#1f4e8c', o: true, bulle: { t: 'texte', src: 'texte', c: '', e: '!', couleur: '#336699' }, contenu: { t: 'valeur', c: 'Type', e: '' } }],
  barre: { boutons: [{ id: 'zoomin', on: true }, { id: 'prog', on: false }] },
  filtres: [{ c: 'Type', type: 'multi' }, { c: 'Statut', type: 'oui', bouton: true }, { c: 'Type', type: 'unique', tous: false }],
  messages: [{ texte: 'Bonjour', actif: true }, { texte: '', actif: false, style: 'perso', rep: 'intervalle' }], recherche: { cols: [{ c: 'Type', nom: '' }], mode: 'choix' },
  prog: { inds: [{ nom: 'a', mode: 'ratio', grp: 'Type', num: 'Statut', den: 'Statut' }, { mode: 'part', cond: { c: 'Statut', op: '=', v: 'x' }, base: { on: true, c: 'Type', op: '=', v: 'y' } }, { mode: 'moyenne', col: 'Date' }] },
  sections: [{ nom: 'Liste', type: 'liste', o: true, cols: [{ c: 'Type' }] }, { nom: 'Tableau', type: 'tableau', o: true, tab: { heads: ['A', 'B'], rows: [{ cells: [{ c: 'Type' }, { v: 'x' }] }, { cells: [{ v: '' }, { c: 'Nom' }] }] } },
    { nom: 'Lié', type: 'lie', o: true, lie: { table: 'T2', cle: 'Type', cols: [{ c: 'Nom' }, { c: '' }], grp: '__annee', dateCol: 'Date' } }] };
// scénarios : configuration, options, sélecteur de colonnes ouvert ?, menu « Ajouter » ouvert ?
const SCENARIOS = [{ nom: 'complète', cfg: COMPLETE }, { nom: 'vide', cfg: {} }, { nom: 'éléments masqués', cfg: COMPLETE, opts: { aff_legende: false, aff_count: false }, menu: true },
  { nom: 'sélecteur de colonnes', cfg: COMPLETE, picker: () => ({ g: 'p', q: '', sel: new Set(['Type']) }) }];

const dec = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function controles(html) {   // champs, listes et boutons actifs de l'écran courant
  const res = [];
  for (const m of html.matchAll(/<(input|select|button)\b([^>]*)>/g)) {
    const at = {}; for (const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) at[a[1]] = a[2] === undefined ? '' : dec(a[2]);
    if (!at['data-a'] && !at['data-o']) continue;
    let options = []; if (m[1] === 'select') { const fin = html.indexOf('</select>', m.index); options = [...html.slice(m.index, fin).matchAll(/<option(?: value="([^"]*)")?[^>]*>([^<]*)/g)].map(o => o[1] !== undefined ? dec(o[1]) : dec(o[2])); }
    res.push({ tag: m[1], at, options });
  }
  return res;
}
function cible(c) {   // faux élément reçu par les gestionnaires, avec une valeur différente de l'actuelle
  const dataset = {}; for (const [k, v] of Object.entries(c.at)) if (k.startsWith('data-')) dataset[k.slice(5).replace(/-(\w)/g, (_, x) => x.toUpperCase())] = v;
  const type = c.at.type || (c.tag === 'select' ? 'select-one' : 'text'); let value = c.at.value || '', checked = 'checked' in c.at;
  if (c.tag === 'select') value = c.options.some(v => v !== value) ? c.options[c.options.length - 1] : value;
  else if (type === 'checkbox') checked = !checked; else if (type === 'number') { const n = (+c.at.min || 0) + 1; value = String(String(n) === value ? n + 1 : n); } else if (type === 'color') value = value.toLowerCase() === '#0a1b2c' ? '#0a1b2d' : '#0a1b2c'; else if (type === 'date') value = value === '2027-05-06' ? '2027-05-07' : '2027-05-06'; else value = value === 'Essai' ? 'Essai 2' : 'Essai';   // valeur toujours différente de l’actuelle
  const t = { tagName: c.tag.toUpperCase(), type, dataset, value, checked, min: c.at.min, max: c.at.max, defaultValue: c.at.value || '', textContent: 'x', classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, matches: () => false, select() {}, focus() {} };
  t.closest = s => (s === 'button[data-a]' && c.tag === 'button' && dataset.a) ? t : null;
  return t;
}
const declencher = c => (T.modal._ev[c.tag === 'button' ? 'click' : 'change'] || []).forEach(f => f({ target: cible(c) }));
function preparer(sc, onglet) {   // remet le widget dans l'état du scénario, sur l'onglet voulu
  T.setCols(COLS); T.setCfg(T.norm(copie(sc.cfg))); T.setOpts(copie(sc.opts || {})); T.setPicker(sc.picker ? sc.picker() : null); T.setOnglet(onglet); T.dessiner();
  if (sc.menu) { const m = controles(T.html).find(c => c.at['data-a'] === 'menu'); if (m) { declencher(m); T.dessiner(); } }
}
const rendre = cfg => { const r = []; T.setCfg(T.norm(copie(cfg))); T.setPicker(null); for (const o of ONGLETS) { T.setOnglet(o); try { T.dessiner(); } catch (e) { r.push(o + ' : ' + e.message); } } return r; };

console.log('2. Affichage de tous les onglets de configuration');
for (const sc of SCENARIOS.slice(0, 2)) { T.setCols(COLS); T.setOpts({}); const r = rendre(sc.cfg); ok(r.length === 0, 'configuration ' + sc.nom + ' : les 9 onglets s’affichent' + (r.length ? ' — ' + r.join(' | ') : '')); }

T.coupeSauvegarde();   // pas d'écriture en arrière-plan pendant les essais
console.log('3. Chaque contrôle de la configuration répond (un clic ou un changement par contrôle)');
let total = 0; const pannes = [], etats = {}, libelles = {}, vues = new Set();
for (const sc of SCENARIOS) for (const o of ONGLETS) {
  const rangs = {}; preparer(sc, o); const liste = controles(T.html); liste.forEach(c => { if (c.at['data-a']) vues.add(c.at['data-a']); });
  for (const [idx, c] of liste.entries()) {
    preparer(sc, o); total++;
    const nomC = `${c.tag} ${c.at['data-a'] || c.at['data-o']}${c.at['data-f'] ? '/' + c.at['data-f'] : ''}`; rangs[nomC] = (rangs[nomC] || 0) + 1;
    try {
      declencher(c);
      const r = rendre(T.cfg); if (r.length) throw new Error('affichage cassé après l’action : ' + r[0]);
      const cle = `${sc.nom}|${o}|${nomC}#${rangs[nomC]}`, op = Object.assign({}, T.opts); delete op._maj;   // empreinte du résultat : repère tout changement de comportement
      etats[cle] = crypto.createHash('sha1').update(JSON.stringify([T.cfg, op])).digest('hex').slice(0, 12); libelles[cle] = nomC;
    } catch (e) { pannes.push(`onglet ${o} (${sc.nom}), ${nomC} : ${e.message}`); }
  }
}
ok(pannes.length === 0, total + ' contrôles essayés, ' + pannes.length + ' en échec');
[...new Set(pannes)].slice(0, 12).forEach(p => console.log('      ' + p));

console.log('3 bis. Le résultat de chaque contrôle est identique à la référence enregistrée');
if (MAJ || !fs.existsSync(REF)) { fs.writeFileSync(REF, JSON.stringify(etats)); ok(true, 'référence enregistrée : ' + Object.keys(etats).length + ' résultats (tests/reference.json)'); }
else { const ref = JSON.parse(fs.readFileSync(REF, 'utf8')), diff = Object.keys(ref).filter(k => ref[k] !== etats[k]), nouv = Object.keys(etats).filter(k => !(k in ref));
  ok(diff.length === 0 && nouv.length === 0, Object.keys(ref).length + ' résultats comparés, ' + diff.length + ' différent(s), ' + nouv.length + ' nouveau(x) contrôle(s)');
  diff.concat(nouv).slice(0, 8).forEach(k => console.log('      ' + k + ' (' + libelles[k] + ')'));
  if (diff.length || nouv.length) console.log('      Changement voulu ? Relancez avec : node tests/verifier.js --maj'); }

console.log('4. Chaque réglage dessiné a un gestionnaire');
const gerees = new Set([...SCRIPT.matchAll(/case '([^']+)'/g)].map(m => m[1])), sansGestion = [...vues].filter(a => !gerees.has(a) && a !== 'pk-q');
ok(sansGestion.length === 0, vues.size + ' types de contrôles dessinés' + (sansGestion.length ? ', sans gestionnaire : ' + sansGestion.join(', ') : ', tous gérés'));
const jamais = [...gerees].filter(c => !vues.has(c) && /^[a-z][\w-]*$/.test(c));
console.log('   (information) gestionnaires jamais exercés par ces essais : ' + jamais.length + ' → ' + jamais.join(', '));
T.rendSauvegarde();
console.log('5. Ouverture de la configuration et diagnostic');
(async () => {
  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const essai = async (mode, echo) => { T.fermerReglages(); globalThis.__serveur = { mode, echo }; rappels.opt({}); await attendre(80); const t0 = Date.now(); await T.demanderConfig(); return { ouvert: T.ouvert, ms: Date.now() - t0 }; };
  let r = await essai('accepte', true); ok(r.ouvert && r.ms < 1500, 'Grist renvoie l’écho de l’enregistrement : le volet s’ouvre tout de suite (' + r.ms + ' ms)');
  r = await essai('accepte', false); ok(!r.ouvert, 'aucun écho de Grist : le volet reste fermé (et le message indique ?config=force)');
  globalThis.__loc.search = '?config=force'; r = await essai('accepte', false); ok(r.ouvert, '?config=force : le volet s’ouvre même sans écho'); globalThis.__loc.search = '';
  T.fermerReglages(); globalThis.__serveur = { mode: 'accepte', echo: true }; globalThis.__fetch = async u => ({ ok: true, status: 200, json: async () => ({}) });
  const lignes = (await T.diagnostic()).join('\n');
  ok(/TROUVÉ/.test(lignes) && /Écho de Grist vers le widget : reçu/.test(lignes) && /HTTP 200/.test(lignes), 'le diagnostic rapporte : relecture du serveur, écho, droit de lire la liste des accès');
  ok(!/JETON-SECRET/.test(lignes), 'le diagnostic n’affiche jamais le jeton d’accès');
  delete globalThis.__serveur; delete globalThis.__fetch;

  console.log('6. Itinéraire : avertissements, départ par adresse ou par position');
  const iti = T.iti; T.setOpts({});
  ok(/peuvent contenir des erreurs/.test(T.itiAvert()) && !/à pied/i.test(T.itiAvert()), 'avertissement général affiché ; rien de spécifique à pied en voiture');
  iti.mode = 'pedestrian'; ok(/À pied : trajet donné à titre indicatif/.test(T.itiAvert()), 'avertissement supplémentaire affiché pour l’itinéraire à pied'); iti.mode = 'car';
  T.setOpts({ iti_avert: '', iti_avert_pied: '' }); iti.mode = 'pedestrian'; ok(T.itiAvert() === '', 'les deux avertissements peuvent être masqués (texte vide)'); iti.mode = 'car'; T.setOpts({});
  T.itiDessiner(); const h = T.itiPanel.innerHTML; ok(/data-i="dep"/.test(h) && /data-i="adr"/.test(h) && /data-i="pos"/.test(h), 'trois façons de choisir le départ : carte, adresse, ma position');
  const pos = x => T.itiPanel.innerHTML.indexOf(x);
  ok(pos('Départ :') < pos('Ajouter des arrivées :') && pos('data-i="pos"') < pos('Ajouter des arrivées :') && pos('Ajouter des arrivées :') < pos('data-i="tous"') && pos('data-i="tous"') < pos('data-i="opt"') && pos('data-i="opt"') < pos('data-i="calc"'), 'mise en page : bloc Départ, puis bloc Arrivées, puis Optimiser et Supprimer, puis Calculer');
  const ligneOpt = (T.itiPanel.innerHTML.match(/<div class="iti-actions">(?:(?!<\/div>).)*data-i="opt"(?:(?!<\/div>).)*<\/div>/) || [''])[0];
  ok(/Optimiser l’ordre des points/.test(ligneOpt) && /data-i="vider">Supprimer</.test(ligneOpt) && !/Vider/.test(T.itiPanel.innerHTML) && !/data-i="calc"/.test(ligneOpt), '« Optimiser l’ordre des points » et « Supprimer » sur la même ligne (le mot « Vider » a disparu)');
  ok(/Pour ajouter des points, cliquez sur le bouton/.test(T.itiPanel.innerHTML), 'message d’indication clair affiché quand la liste est vide');
  T.setOpts({ iti_pos: false }); T.itiDessiner(); ok(!/data-i="pos"/.test(T.itiPanel.innerHTML) && /data-i="adr"/.test(T.itiPanel.innerHTML), '« Ma position » peut être retiré sans toucher aux autres départs');
  rappels.rec([{ id: 1, Nom: 'A', Latitude: 50, Longitude: 2 }], {}); const d1 = T.marq.values().next().value._cifi;
  ok(/btn-iti/.test(T.fichier(d1)), 'bouton « ＋ Itinéraire » affiché dans le popup par défaut');
  T.setOpts({ pop_iti: false }); ok(!/btn-iti/.test(T.fichier(d1)) && /btn-fiche/.test(T.fichier(d1)), 'bouton « ＋ Itinéraire » masqué dans le popup, « Voir la fiche complète » conservé'); T.setOpts({});
  T.setOpts({ pop_fiche: false }); ok(!/btn-fiche/.test(T.fichier(d1)) && /btn-iti/.test(T.fichier(d1)), 'bouton « Voir la fiche complète » masqué : le popup garde « ＋ Itinéraire »');
  T.setOpts({ pop_fiche: false, pop_iti: false }); ok(!/class="pied"/.test(T.fichier(d1)) && /class="corps"/.test(T.fichier(d1)), 'les deux boutons masqués : popup seul, sans bas de page vide'); T.setOpts({});
  T.ouvrirFiche(1, false); ok(/fp-iti/.test(T.fichePanel), 'bouton « Ajouter à l’itinéraire » affiché dans la fiche par défaut');
  T.setOpts({ fiche_iti: false }); T.ouvrirFiche(1, false); ok(!/fp-iti/.test(T.fichePanel), 'bouton « Ajouter à l’itinéraire » masqué dans la fiche'); T.setOpts({});
  let url = ''; globalThis.__fetch = async u => { url = u; return { ok: true, json: async () => ({ features: [{ geometry: { type: 'Point', coordinates: [2.3, 48.85] }, properties: { label: '1 rue de Test 75001 Paris' } }, { geometry: null, properties: { label: 'sans position' } }] }) }; };
  iti.adr.q = 'ab'; await T.itiChercherAdresse(); ok(/au moins 3 caractères/.test(iti.adr.msg) && url === '', 'une saisie trop courte n’interroge pas le service');
  iti.adr.q = '1 rue de Test'; await T.itiChercherAdresse(); ok(url.startsWith('https://data.geopf.fr/geocodage/search?q=1%20rue%20de%20Test') && iti.adr.res.length === 1 && iti.adr.res[0].lat === 48.85 && iti.adr.res[0].lng === 2.3, 'recherche d’adresse : bon service, coordonnées lues dans l’ordre longitude/latitude, résultat sans position ignoré');
  const clic = (i, k) => (T.itiPanel._ev.click || []).forEach(f => f({ target: { closest: () => ({ dataset: { i, k: String(k) } }) } }));
  clic('adr-ok', 0); ok(iti.depart && iti.depart.lat === 48.85 && /^Adresse : 1 rue de Test/.test(iti.departLib) && !iti.adr.ouvert, 'choix d’une adresse : devient le point de départ');
  clic('deldep', 0); ok(!iti.depart && iti.departLib === '', 'le départ peut être retiré');
  globalThis.__fetch = async () => ({ ok: false, status: 504 }); iti.adr.q = 'une adresse'; await T.itiChercherAdresse(); ok(/impossible/.test(iti.adr.msg), 'service en panne : message clair, pas de blocage');
  Object.defineProperty(globalThis, 'navigator', { value: { geolocation: { getCurrentPosition: (okf) => okf({ coords: { latitude: 50.1, longitude: 2.2 } }) } }, configurable: true });
  T.itiPosition(); ok(iti.depart && iti.depart.lat === 50.1 && iti.departLib === 'Ma position', 'ma position : devient le point de départ');
  clic('deldep', 0); Object.defineProperty(globalThis, 'navigator', { value: { geolocation: { getCurrentPosition: (okf, ko) => ko({ code: 1 }) } }, configurable: true });
  T.itiPosition(); ok(!iti.depart && /refusée/.test(iti.msg), 'position refusée : message clair, aucun départ enregistré');
  iti.depart = null; iti.ids = []; ok(/peuvent contenir des erreurs/.test(T.itiTexte()), 'la feuille de route copiée contient l’avertissement');

  console.log('7. Données piégées : aucun texte venant des données ne doit être interprété comme du code de page');
  {
    const PIEGE = '<img src=x onerror=PIEGE>', brut = /<img src=x onerror=PIEGE>/;
    globalThis.__ecrit = []; globalThis.__fetch = async () => ({ ok: true, json: async () => [{ nom: PIEGE, departement: { nom: PIEGE }, codesPostaux: [PIEGE], centre: { coordinates: [2, 48] } }] });
    const cols = ['Nom', 'Type', 'Statut', 'Date', PIEGE];
    T.setCols(cols); T.setOpts({ lib_count: PIEGE + ' {n}', titre_filtres: PIEGE });
    T.setCfg(T.norm(copie({ ...COMPLETE, filtres: [{ c: 'Type', type: 'multi' }, { c: PIEGE, type: 'unique' }], messages: [{ texte: PIEGE, actif: true }], prog: { inds: [{ nom: PIEGE, mode: 'ratio', grp: 'Type', num: 'Statut', den: 'Statut' }, { nom: PIEGE + '2', mode: 'moyenne', col: 'Date' }] }, sections: [{ nom: PIEGE, type: 'liste', o: true, cols: [{ c: 'Type' }, { c: PIEGE }] }, { nom: 'Tableau', type: 'tableau', o: true, tab: { heads: [PIEGE, 'B'], rows: [{ cells: [{ c: 'Type' }, { v: PIEGE }] }] } }] })));
    rappels.rec([{ id: 1, Nom: PIEGE, Latitude: 50, Longitude: 2, Type: PIEGE, Statut: PIEGE, Date: PIEGE, [PIEGE]: PIEGE }, { id: 2, Nom: 'B', Latitude: 51, Longitude: 3, Type: 'x', Statut: 'y' }], {});
    const sorties = [];
    const essayer = (nom, f) => { try { const r = f(); if (typeof r === 'string') sorties.push(r); } catch (e) { sorties.push(''); console.log('   (information) ' + nom + ' : ' + e.message); } };
    const d1 = T.marq.values().next().value._cifi;
    essayer('popup', () => T.fichier(d1)); essayer('fiche', () => { T.ouvrirFiche(1, false); return T.fichePanel; });
    essayer('configuration', () => { for (const o of ONGLETS) { T.setOnglet(o); T.dessiner(); sorties.push(T.html); } return ''; });
    T.setRech('img');
    for (const [nom, f] of [['regroupement', T.majCluster], ['filtres et compteurs', T.appliquerFiltres], ['liste', T.majListe], ['légende', T.majLegende], ['suggestions', T.majSug], ['progression', T.ouvrirProg], ['barre', T.dessinerBarre]]) essayer(nom, f);
    T.setOnglet('points'); essayer('itinéraire', () => { T.iti.depart = { lat: 1, lng: 2 }; T.iti.departLib = PIEGE; T.iti.ids = [1]; T.itiDessiner(); return T.itiPanel.innerHTML; });
    const tous = [...sorties, ...globalThis.__ecrit];
    const vus = ['popup', 'fp-tete', 'sug-i', 'prog-ind', 'leg-', 'rg-boite', 'iti-'].filter(k => !tous.some(t => t.includes(k)));
    ok(vus.length === 0, 'l’essai a exercé popup, fiche, suggestions, progression, légende, configuration, itinéraire (' + tous.length + ' écritures)' + (vus.length ? ' — non exercés : ' + vus.join(', ') : ''));
    ok(tous.some(t => t.includes('PIEGE')), 'le texte piégé est bien affiché quelque part (sous forme de texte)');
    const fautifs = tous.filter(t => brut.test(t));
    ok(fautifs.length === 0, 'aucun texte piégé n’est écrit tel quel dans la page' + (fautifs.length ? ' — ' + fautifs.length + ' écriture(s) fautive(s), début : ' + fautifs[0].slice(0, 100).replace(/\n/g, ' ') : ''));
    T.setFiltres(T.norm({ filtres: [{ c: 'Type', type: 'unique' }, { c: 'Statut', type: 'unique', hors: true }] }).filtres);
    const bloc = T.filtresBloc(), dedans = bloc.slice(bloc.indexOf('<details id="filtres-sec"'), bloc.indexOf('</details>', bloc.indexOf('<details id="filtres-sec"')));
    ok(dedans.includes('data-c="Type"') && !dedans.includes('data-c="Statut"') && bloc.includes('data-c="Statut"'), 'un filtre « toujours visible » reste en dehors de la section Filtres pliable');
    const par = T.norm({}).encarts, dansEnc = par.flatMap(e => e.elts);
    ok(par.length === 4 && new Set(dansEnc).size === dansEnc.length && dansEnc.includes('version'), 'par défaut : 4 encarts (filtres, liste, suivi, outils), chaque élément dans un seul encart');
    const dm = T.norm({ encarts: [{ id: 'a', cote: 'zz', sens: 'x', larg: 30, haut: 5000 }, { id: 'b', cote: 'bd', sens: 'h', larg: 0, haut: 0 }] }).encarts;
    ok(dm[0].cote === 'hg' && dm[0].sens === 'v' && dm[0].larg === 80 && dm[0].haut === 1200 && dm[1].cote === 'bd' && dm[1].sens === 'h' && dm[1].larg === 0 && dm[1].haut === 0, 'encarts : emplacement et sens inconnus remplacés par les valeurs par défaut, largeur et hauteur bornées (0 = automatique)');
    const nz = T.norm({ encarts: [{ id: 'a b!', titre: 'X', fond: false, fondc: 'red;x', bordc: '#fff" onclick="x', elts: ['q', 'zzz', 'q'] }, { id: 'ab', elts: ['q', 'liste'] }, { id: 'ab', elts: [] }] }).encarts;
    ok(nz.map(e => e.id).join() === 'ab,abx,abxx' && nz[0].elts.join() === 'q' && nz[1].elts.join() === 'liste' && nz[0].fondc === '' && nz[0].bordc === '' && nz[0].fond === false, 'encarts : identifiants uniques, élément inconnu ou en double écarté, un élément dans un seul encart, couleurs mal formées écartées')
    T.setFiltres(T.norm({ filtres: [{ c: 'Type', type: 'multi', menu: true }, { c: 'Statut', type: 'multi' }] }).filtres);
    const blocM = T.filtresBloc();
    ok(/class="flt-d menu" data-c="Type"/.test(blocM) && /class="flt-d" data-c="Statut"/.test(blocM), 'un filtre à choix multiples peut s’afficher en liste déroulante (réglage propre à chaque filtre)');
    T.setFiltres(T.norm({ filtres: [{ c: 'Type', type: 'unique' }, { c: 'Statut', type: 'unique', hors: true }] }).filtres);
    T.filtreSel.Type = ['x']; T.appliquerFiltres(); const raz = T.raz;
    ok(raz && raz.hidden === false, 'le bouton « Réinitialiser les filtres » apparaît dès qu’un filtre est actif');
    delete T.filtreSel.Type; T.appliquerFiltres();
    ok(raz && raz.hidden === true, 'et disparaît quand aucun filtre n’est actif');
    const rg = T.norm({ regles: [{ couleur: '#fff" onmouseover="x', forme: 'rond" onclick="x', si: [], bulle: {}, pulse: {}, contenu: {} }] }).regles[0];
    ok(rg.couleur === '' && rg.forme === '', 'une couleur ou une forme mal formée dans la configuration est écartée (pas de code glissé dans un attribut)');
    ok(T.norm({ sections: [{ taille: 99 }, { taille: 'x' }] }).sections.map(x => x.taille).join() === '30,0', 'la taille du texte d’une liste est bornée (0 = par défaut, 30 au plus)');
    const pt = T.marq.values().next().value._cifi, signal = (mode, sel) => { T.setOpts({ sel_signal: mode }); return T.icone(pt, sel).html; };
    ok(/ sel/.test(signal('contour', true)) && !/class="pulse"/.test(signal('contour', true)), 'point sélectionné, signal « contour » : un contour, pas de pulsation');
    ok(!/ sel/.test(signal('pulse', true)) && /class="pulse"/.test(signal('pulse', true)), 'point sélectionné, signal « pulsé » : une pulsation, pas de contour');
    ok(/ sel/.test(signal('both', true)) && /class="pulse"/.test(signal('both', true)), 'point sélectionné, signal « les deux » : contour et pulsation');
    ok(!/ sel/.test(signal('both', false)) && !/class="pulse"/.test(signal('both', false)), 'point non sélectionné : aucun signal');
    const carre = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
    T.setOpts({}); T.setZone(carre);
    ok(T.dansCommune({ lat: 2, lng: 2 }) && !T.dansCommune({ lat: 5, lng: 5 }) && !T.dansCommune({ lat: 20, lng: 2 }), 'filtre par commune : dedans oui, dans un trou ou dehors non');
    T.setZone({ type: 'MultiPolygon', coordinates: [carre.coordinates, [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]] });
    ok(T.dansCommune({ lat: 25, lng: 25 }) && !T.dansCommune({ lat: 15, lng: 15 }), 'filtre par commune : une commune en plusieurs morceaux (MultiPolygon)');
    T.setOpts({ commune_filtre: false }); ok(T.dansCommune({ lat: 99, lng: 99 }), 'filtre par commune désactivé dans la configuration : tout reste visible');
    T.setZone(null); T.setOpts({}); ok(T.dansCommune({ lat: 99, lng: 99 }), 'aucune commune choisie : tout reste visible');
    T.typesT.Tab = { B:'Bool' }; T.stylesT.Tab = { B:{ wo:{} } };
    T.setOpts({ style_grist:true });
    ok(T.caseG('Tab', 'B', true) === '✔︎' && T.caseG('Tab', 'B', false) === '', 'colonne booléenne : coche si vrai, vide si faux, quand le style de Grist est repris');
    T.stylesT.Tab.B.wo = { widget:'TextBox' };
    ok(T.caseG('Tab', 'B', true) === null, 'colonne booléenne réglée en texte dans Grist : pas de case');
    T.stylesT.Tab.B.wo = {}; T.setOpts({});
    ok(T.caseG('Tab', 'B', true) === null, 'sans la reprise du style Grist : texte Oui / Non comme avant');
    delete globalThis.__ecrit; delete globalThis.__fetch;
  }

  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nToutes les vérifications passent');
  process.exit(echecs ? 1 : 0);
})();
