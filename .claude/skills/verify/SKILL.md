---
name: verify
summary: Drive the built File Tools app in a browser.
---

1. Run `npm run build`.
2. Serve `.output/chrome-mv3` with `npx serve .output/chrome-mv3 -l 4173 --no-clipboard`.
3. Open `http://localhost:4173/app.html` in a browser.
4. Confirm the offline privacy copy and ZIP drop zone render.
5. Choose a real ZIP through the drop zone, verify the file tree and sizes, download one file, then download all.
6. Probe a non-ZIP input and cancellation. Browser automation needs file-upload support to drive steps 5–6.
