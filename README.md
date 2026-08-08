# Eclipsi + Perseids · 12 d'agost de 2026

Mapa dels **18 punts oficials d'observació** de l'eclipsi total de Sol del 12 d'agost
de 2026 a Catalunya, amb la durada de la totalitat de cadascun, el model d'ombres
del relleu, els llocs per passar el dia i la taxa de Perseids hora a hora.

Pensat per fer-lo servir **al mòbil i sense cobertura**: a la franja de la totalitat
hi haurà desenes de milers de persones i la xarxa mòbil no aguantarà.

## Com es fa servir

1. Obre-la al mòbil i **instal·la-la** (a Android surt un botó; a l'iPhone,
   *Compartir → Afegeix a la pantalla d'inici*).
2. A la pestanya **Capes**, secció *Mapes fora de línia*, prem **Opcions** i
   **Descarrega**. Fes-ho **a casa amb wifi**, el dia abans. Amb l'opció
   recomanada són unes 2.600 tessel·les, uns 32 MB.
3. Ja pots sortir. L'app arrenca i el mapa es dibuixa encara que el mòbil no
   tingui ni una ratlla.

El botó rodó de la cantonada del mapa diu **on ets** i, de propina, si des d'allà
el relleu et tapa el Sol a l'hora de la totalitat. El GPS funciona sense cobertura.

## Publicar-ho a GitHub Pages

El repositori ja porta el workflow que ho desplega tot sol. Només cal fer-ho una
vegada:

1. **Settings → Pages**
2. A *Build and deployment* → **Source**, tria **GitHub Actions**
3. Ja està. A cada `push` a `main` es publica a
   `https://drpicox.github.io/eclipsi26/`

> **No triïs *Deploy from a branch*.** Amb aquesta opció el workflow no s'executa,
> i el que fa el workflow és segellar `sw.js` amb l'SHA del commit. Sense aquest
> segell, `sw.js` no canvia mai i els mòbils que ja tinguin l'app instal·lada es
> quedarien per sempre amb la versió antiga: no s'assabentarien que n'hi ha una de
> nova.

La primera vegada, el desplegament triga un parell de minuts. El pots seguir a la
pestanya **Actions**.

## Desenvolupament

Cal servir-ho per HTTP: amb `file://` el service worker no arrenca.

```sh
node tools/servidor.mjs      # http://localhost:8080
node tools/icones.mjs        # regenera les icones a icons/
```

Per provar de veritat el mode sense connexió: carrega la pàgina, descarrega les
tessel·les, **mata el servidor** i recarrega. Ha de continuar funcionant tot.

## Què hi ha a cada fitxer

| Fitxer | Què fa |
| --- | --- |
| `index.html` | Marcatge i capçalera de PWA |
| `app.css` | Estils, incloent-hi el full de baix del mòbil |
| `app.js` | Tota la lògica: mapa, fitxes, rànquing, descàrrega fora de línia, ubicació |
| `sw.js` | Service worker: closca de l'app i memòria cau de tessel·les |
| `data/eclipsi.js` | Punts, llocs d'interès i taxes de Perseids (generat) |
| `data/ombres.png` | Màscara d'ombres del relleu, es llegeix píxel a píxel amb un canvas |
| `vendor/leaflet.*` | Leaflet, copiat al repositori perquè no depenguem de cap CDN |
| `original/` | La versió original en un sol fitxer, d'on surt tot això |

Les dues memòries cau són independents: `eclipsi-app-<versió>` conté l'app i es
renova a cada desplegament; `eclipsi-tiles-v1` conté les tessel·les i **no es
toca mai** en actualitzar, perquè seria una malícia fer baixar 32 MB un altre cop.

## Dades i fonts

Punts oficials i durades de la Generalitat de Catalunya (càlcul de l'IEEC).
Ombres calculades sobre el model d'elevacions Terrarium a ~58 m. Els detalls i les
advertències són a la pestanya **Notes** de la mateixa app — val la pena llegir-la,
sobretot això: **mai sense ulleres homologades durant la fase parcial.**

Tessel·les del mapa de [CARTO](https://carto.com/) i
[Esri](https://www.esri.com/), sobre dades d'OpenStreetMap.
