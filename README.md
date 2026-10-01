# Menu Scanner

Snap a photo of a restaurant menu, get an instant English translation, and see which dishes fit your diet (vegetarian, pescatarian or vegan) and which are worth asking about. Built for Japan first (hello, hidden dashi), but it reads menus in any language.

## What it does

- **Scan:** take a photo or pick up to 5 menu pages from your library. Printed menus and handwritten chalkboards both work.
- **Traffic light per dish:** vegetarian / ask the staff / not vegetarian, with a short reason and the hidden ingredients to watch for (fish stock, fish sauce, lard, gelatine …).
- **Venue verdict:** one line on whether you can eat well here at all, e.g. a hint to request a vegetarian course when booking a kaiseki dinner.
- **Show the staff:** a polite sentence about your diet, plus a per-dish question, written in the local language of the country (Japanese, Thai, Korean, Italian …). Opens full-screen so you can hold up your phone.
- **Diet modes:** vegetarian (no meat, no fish, no fish stock), pescatarian (fish and dashi OK, no meat or meat broth), vegan.
- **History:** your last 25 scans stay on the device.
- **Glossary** of hidden ingredients in Japanese cooking.

## How it works

A small installable web app (PWA): plain HTML, CSS and JavaScript with no build step. Menu photos are resized in the browser and sent directly to the [Claude API](https://docs.claude.com), which streams back one dish per line so results appear while it reads.

Your API key is stored only in your browser's local storage on your device. It is never part of this repository.

## Setup

1. Create an API key at [console.anthropic.com](https://console.anthropic.com/settings/keys), add some credit and set a monthly spend limit. A scan costs roughly 1 to 5 cents depending on the model.
2. Open the app (GitHub Pages URL) in Safari on your iPhone → **Share** → **Add to Home Screen**.
3. Open the app, tap the settings icon and paste your key.

## Files

| File | Purpose |
|---|---|
| `index.html` | App layout |
| `style.css` | Styles, light and dark mode |
| `app.js` | Photo handling, Claude request, rendering, history |
| `sw.js` | Service worker: offline app shell |
| `manifest.webmanifest`, `icons/` | Home-screen install |

Results are AI estimates based on dish names and descriptions. For allergies or strict dietary rules, always confirm with the staff.
