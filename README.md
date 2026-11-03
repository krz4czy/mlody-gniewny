# Symulator Młodego Gniewnego

Przeglądarkowa gra driftowa (widok z telefonu, poziomo wygodniej). Ten etap to **wygląd auta** — bez toru, fizyki i sterowania.

Auto: **BMW E46 sedan po liftingu (LCI, 2001–2005)** — angel eyes, nerki, tylne lampy LCI. Nadwozie to „gruz”: spłowiały czarny lakier, rdza progów i nadkoli, dziury, wgniecenia, drzwi kierowcy w podkładzie, klapa w szpachli, urwane naroże zderzaka na trytytkach, taśma na lampie, krzywy spoiler, tablica `WGM 6RUZ`.

Geometria jest proceduralna (Three.js). Żadnych zrzutów modeli.

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

- `src/car/buildCar.ts` — model; grupa `e46` ma `userData.model`
- `src/viewer/` — orbita, światło, kadry
- później: tor, fizyka driftu, gamepad (DualSense / Gamepad API) i sterowanie dotykowe
