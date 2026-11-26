# IridiumTracker

IridiumTracker plots live Iridium NEXT satellite positions from CelesTrak TLE data. Select a satellite to see its footprint and orbit details. Set an observer location to see current visibility, a 60-minute visibility forecast, and estimated free-space path loss.

## Toolchain

| Tool or package | Version |
| --- | --- |
| Node.js | 26.13.1 LTS |
| npm | 11.20.0 or newer |
| Ionic CLI | 7.2.1 |
| Ionic Framework | 9.0.14 |
| Angular and Angular CLI | 22.3.0 |
| TypeScript | 6.0.3 |
| RxJS | 7.8.2 |
| satellite.js | 7.2.0 |
| Cordova CLI | 13.0.0 |
| Cordova Browser | 7.0.0 |
| Cordova Android | 9.1.0 |

Angular 22 requires TypeScript 6.0.x. The browser and Android apps use Leaflet with OpenStreetMap tiles. The map requires an internet connection.

## Run in a browser on Windows

1. Install Node.js 26.13.1. Open PowerShell in the project root and check `node --version` and `npm.cmd --version`.

2. Install the app dependencies and local command-line tools.

   ```powershell
   npm.cmd ci
   ```

3. Start the Angular web preview.

   ```powershell
   npm.cmd exec -- ng serve
   ```

   Open http://localhost:4200. Click **Load satellites**, then use **My location** or **Pick on map** to set the observer location. Press `Ctrl+C` to stop the preview.

   Click a satellite to see its details and footprint. Use **Show all footprints** to overlay coverage for every loaded satellite. **Hide all footprints** returns to the selected satellite’s footprint if it was visible. Click an empty spot on the map to clear the overlays. The **Minimum elevation** slider adjusts every footprint’s radius.

## Aircraft antenna simulation

Load satellites, then set an observer position with **Pick on map** or **Use my location**. Enable **Aircraft simulation** in the location panel and enter altitude in feet, true heading, pitch, and bank. Choose an antenna location using the labeled top view to see which satellites the generic airframe blocks. The comparison table shows the minimum and average clear satellite count for each mount across the 60-minute forecast.

The simulation holds the aircraft position and attitude fixed while the satellites move. It models geometric blockage with simplified fuselage, wing, and tail volumes. Antenna radiation patterns and RF effects are outside this model.

## Checks

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test -- --watch=false --browsers=ChromeHeadless
npm.cmd run e2e
```

The browser tests use Google Chrome and run against the Angular web build.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| An older Node.js version is active | Run `Get-Command node` and check the terminal PATH. If you previously configured the workspace to use the portable Node.js 12 installation, remove that PATH override or point it at your Node.js 26 installation. |
| PowerShell says scripts are disabled | Use `npm.cmd` as shown above. The npm scripts use the local Angular and Cordova executables. |
| The map loads but satellite markers are missing | Click **Load satellites**. In the browser's Network tab, check that the CelesTrak request succeeded and returned TLE text. |
| The browser cannot get your location | Allow location access for the local preview or select **Pick on map**. |
