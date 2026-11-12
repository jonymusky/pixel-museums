# Pixel Museums

Recorré en primera persona, y en 8 bits, los museos más famosos del mundo.
Elegís un museo, caminás por sus salas y te acercás a cada pintura o escultura para leer su historia.

**→ [museum.jonymusky.com](https://museum.jonymusky.com)**

*A first-person, 8-bit walk through the world's most famous museums. Pick a museum, wander its rooms and step up to each work to read its story (texts are in Spanish for now).*

## Museos

Louvre · Museo del Prado · Galería Uffizi · Museos Vaticanos · Rijksmuseum · National Gallery ·
Museo de Orsay · The Met · Museo Británico · Hermitage · MoMA

## Controles

| Acción | Teclado | Táctil |
| --- | --- | --- |
| Caminar / girar | Flechas o `W` `A` `S` `D` | Cruceta en pantalla |
| Paso lateral | `Q` / `E` | — |
| Ver la obra que tenés enfrente | `Espacio`, `Enter` o clic | Botón **VER** |
| Mapa | `M` | Botón **MAPA** |
| Cerrar / volver a los museos | `Esc` | Botón **◀ MUSEOS** |

El progreso (obras vistas) se guarda en el navegador. Cada museo tiene enlace directo, por ejemplo `/#prado`.

## Cómo está hecho

- **Motor**: un raycaster propio en TypeScript sobre un `<canvas>` de 320×180, escalado sin suavizado. Sin frameworks ni dependencias en tiempo de ejecución.
- **Salas**: cada museo es un bloque de datos en [`content/museums.json`](content/museums.json): colores, disposición de salas y lista de obras. El mapa, los marcos y los pedestales se generan a partir de eso.
- **Texturas y esculturas**: paredes, pisos, techos, marcos y las siluetas de las esculturas se dibujan por código ([`src/engine/textures.ts`](src/engine/textures.ts)).
- **Obras**: `npm run art` consulta Wikidata (título, autor, año, técnica) y Wikimedia Commons (imagen y licencia), descarga cada imagen una sola vez y genera dos versiones pixeladas con paleta reducida: una para la pared y otra para la ficha. El sitio no pide nada a servicios externos en tiempo de ejecución.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm run art      # regenera public/art, src/data/manifest.json y CREDITS.md
npm run build    # compila a dist/
npm run deploy   # build + wrangler deploy (Cloudflare Workers, museum.jonymusky.com)
```

### Agregar una obra o un museo

1. Buscá la obra en [Wikidata](https://www.wikidata.org) y copiá su identificador (`Q…`). Verificá que su colección sea el museo donde la vas a colgar.
2. Agregala en `content/museums.json` con un `id`, el `qid`, `kind` (`painting` para colgar en la pared, `object` para un pedestal) y su `story`. Los campos `title`, `artist`, `year`, `medium` y `file` permiten corregir lo que venga de Wikidata.
3. Corré `npm run art`. El script falla si la licencia de la imagen no es de dominio público, CC0, CC BY o CC BY-SA.

## Licencias y créditos

- El código es [MIT](LICENSE).
- Las obras son versiones pixeladas de imágenes de Wikimedia Commons, de dominio público o con licencia libre. El detalle por imagen, con autor y licencia, está en [CREDITS.md](CREDITS.md).
- Tipografías: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) y [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans), ambas bajo SIL Open Font License.
- Este proyecto no está afiliado a ninguno de los museos representados.
