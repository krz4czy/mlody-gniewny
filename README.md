# Symulator Młodego Gniewnego

Przeglądarkowa gra driftowa (widok z telefonu, poziomo wygodniej). Ten etap to **wygląd auta** — bez toru, fizyki i sterowania.

Auto: **BMW M3 Coupe (E46)** — model [Mona x Supercars](https://sketchfab.com/Car2022), licencja [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Plik: `public/models/bmw-m3-coupe-e46.glb`. Koła nie są osobnymi meshami.

## Uruchomienie

```bash
npm install
npm run dev
```

Dev server: [http://127.0.0.1:47321](http://127.0.0.1:47321). `base` w Vite to `./`, więc build statyczny da się później wrzucić na GitHub Pages.

```bash
npm run build
npm run preview
```

Ujęcia podglądu: `?pose=front34`, `rear34`, `side`. `?ui=0` chowa nakładkę.

## Co dalej

Kod jest podzielony tak, żeby dołożyć kolejne etapy bez ruszania karoserii:

- `src/car/loadCar.ts` — wczytanie GLB; grupa `e46`
- `src/viewer/` — orbita, światło, kadry
- później: tor, fizyka driftu, gamepad (DualSense / Gamepad API) i sterowanie dotykowe
