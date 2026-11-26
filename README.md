# Iridium Aircraft Simulator

Iridium Aircraft Simulator plots live Iridium NEXT satellite positions from CelesTrak TLE data. Select a satellite to see its footprint and orbit details. Set an observer location to see current visibility, a 60-minute visibility forecast, and estimated free-space path loss.

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

## Mathematics

The simulator propagates the loaded satellite orbits, calculates their directions from the observer, and checks those directions against the selected antenna mount. Orbital and observer distances are in kilometers, airframe dimensions are in meters, and aircraft altitude is entered in feet. Displayed angles are in degrees. Trigonometric functions use radians, with $a_\mathrm{rad}=a_\mathrm{deg}\pi/180$.

### TLEs, orbit propagation, and Earth rotation

The CelesTrak feed provides two-line element sets (TLEs). Each TLE gives an orbital epoch and mean elements including inclination, right ascension of the ascending node, eccentricity, argument of perigee, mean anomaly, and mean motion, plus the drag parameter. The app passes these to satellite.js 7.2.0. Its SGP4 implementation propagates the orbit by $\Delta t=1440(JD-JD_\mathrm{epoch})$ minutes and returns a position in kilometers in the true equator, mean equinox (TEME) frame. The app uses the position component. SGP4's perturbation equations and initialization are implemented by the library. [Vallado et al., Revisiting Spacetrack Report #3](https://celestrak.org/publications/AIAA/2006-6753/)

The displayed TLE epoch is converted from Julian days to Unix milliseconds with $(JD_\mathrm{epoch}-2440587.5)\times86400000$.

To account for Earth rotation, satellite.js calculates Greenwich mean sidereal time $\theta$. With $T=(JD-2451545.0)/36525$ and the app's JavaScript date as the time input, the library evaluates the following polynomial in sidereal seconds, then converts it to radians modulo $2\pi$.

$$
s=67310.54841+(876600\cdot3600+8640184.812866)T
+0.093104T^2-0.0000062T^3,\qquad
\theta=(s\pi/43200)\bmod 2\pi.
$$

The Earth-fixed position $(x_f,y_f,z_f)$ follows from the TEME position $(x,y,z)$ by a rotation about the polar axis.

$$
x_f=x\cos\theta+y\sin\theta,\qquad
y_f=-x\sin\theta+y\cos\theta,\qquad z_f=z.
$$

For the map subpoint, the library wraps the longitude $\lambda=\mathrm{atan2}(y,x)-\theta$ into $[-\pi,\pi)$. Set $p=\sqrt{x^2+y^2}$, $a=6378.137$ km, $b=6356.7523142$ km, $f=(a-b)/a$, and $e^2=2f-f^2$. Starting from $\phi=\mathrm{atan2}(z,p)$, satellite.js iterates the geodetic latitude and then computes the ellipsoidal satellite altitude.

$$
N(\phi)=\frac{a}{\sqrt{1-e^2\sin^2\phi}},\qquad
\phi_\mathrm{next}=\mathrm{atan2}(z+e^2N(\phi)\sin\phi,p),\qquad
h=p\cos\phi+z\sin\phi-a\sqrt{1-e^2\sin^2\phi}.
$$

### Observer position, azimuth, and elevation

The observer's latitude and longitude are geodetic. Ground mode sets height to zero. Aircraft mode uses $h_o=0.0003048\times h_\mathrm{ft}$ km and treats that height as ellipsoidal height. With observer latitude $\phi_o$, longitude $\lambda_o$, and $N_o=N(\phi_o)$, the observer's Earth-fixed position is

$$
\mathbf r_o=
\begin{bmatrix}
(N_o+h_o)\cos\phi_o\cos\lambda_o\\
(N_o+h_o)\cos\phi_o\sin\lambda_o\\
(N_o(1-e^2)+h_o)\sin\phi_o
\end{bmatrix}.
$$

Subtract the observer position from the satellite position, $\Delta\mathbf r=\mathbf r_f-\mathbf r_o$, and project the difference into local east, north, and up directions.

$$
\begin{aligned}
E &= -\sin\lambda_o\,\Delta x+\cos\lambda_o\,\Delta y,\\
N &= -\sin\phi_o\cos\lambda_o\,\Delta x-\sin\phi_o\sin\lambda_o\,\Delta y+\cos\phi_o\,\Delta z,\\
U &= \cos\phi_o\cos\lambda_o\,\Delta x+\cos\phi_o\sin\lambda_o\,\Delta y+\sin\phi_o\,\Delta z.
\end{aligned}
$$

Slant range is $\rho=\sqrt{E^2+N^2+U^2}$ km. Elevation is $\epsilon=\arcsin(U/\rho)$, and azimuth is $A=\mathrm{atan2}(E,N)$ wrapped to one full turn clockwise from true north. A satellite qualifies when its elevation is at least the minimum elevation setting. Aircraft mode also requires a clear path from the selected mount. The visible list is sorted by elevation.

### Aircraft attitude and antenna blockage

Aircraft body coordinates point forward, right, and down. Heading $\psi$ is clockwise from true north. Positive pitch $\eta$ raises the nose and positive bank $\beta$ lowers the right wing. The satellite direction after removing heading has components

$$
F=\cos\epsilon\cos(A-\psi),\qquad R=\cos\epsilon\sin(A-\psi),\qquad D=-\sin\epsilon.
$$

The inverse pitch and bank rotations give the ray direction $\mathbf d$ in body coordinates.

$$
D_p=F\sin\eta+D\cos\eta,\qquad
\mathbf d=(F\cos\eta-D\sin\eta,\ R\cos\beta+D_p\sin\beta,\ -R\sin\beta+D_p\cos\beta).
$$

The generic airframe uses four axis-aligned ellipsoids. Centers and semi-axes are measured from the body origin in meters.

| Volume | Center (forward, right, down) | Semi-axes (forward, right, down) |
| --- | --- | --- |
| Fuselage | (0, 0, 0) | (18, 2, 2) |
| Wing | (−2, 0, 1.1) | (4.8, 16, 0.45) |
| Horizontal tail | (−14.5, 0, −0.4) | (2.9, 5.5, 0.28) |
| Vertical tail | (−14, 0, −2.5) | (2.6, 0.35, 2.7) |

| Mount | Position (forward, right, down), meters |
| --- | --- |
| Forward roof | (9, 0, −1.76) |
| Rear roof | (−9, 0, −1.76) |
| Upper right side | (0, 1.5, −1.35) |
| Upper left side | (0, −1.5, −1.35) |
| Underside | (0, 0, 2.01) |

For a mount at $\mathbf m$, the line of sight is the ray $\mathbf m+t\mathbf d$ with $t\ge0$. For an ellipsoid centered at $\mathbf c$ with semi-axes $r_i$, scale each coordinate to turn the ellipsoid into a unit sphere. Let $q_i=(m_i-c_i)/r_i$ and $v_i=d_i/r_i$. The intersection equation is

$$
at^2+2bt+c=0,\qquad a=\sum_i v_i^2,\qquad b=\sum_i q_i v_i,\qquad c=\sum_i q_i^2-1.
$$

An ellipsoid blocks the ray if $b^2-ac\ge0$ and the farther intersection $(-b+\sqrt{b^2-ac})/a$ exceeds $0.001$ m. The small threshold avoids counting an intersection at the mount itself. A hit on any volume blocks the satellite. Mount offsets affect the blockage test. The orbital look angles and slant range are computed from the shared aircraft position.

### Footprint and propagation loss

The map footprint uses a separate spherical Earth approximation with radius $R_\oplus=6371$ km. For satellite altitude $h$ and minimum elevation $\epsilon_\min$, the central angle from the subpoint to the boundary follows from the Earth-center, observer, and satellite triangle. The footprint radius is the corresponding surface arc length.

$$
\gamma=\arccos\!\left(\frac{R_\oplus}{R_\oplus+h}\cos\epsilon_\min\right)-\epsilon_\min,\qquad
r_\mathrm{footprint}=R_\oplus\gamma.
$$

The renderer receives the radius in meters. This circle represents the threshold for a surface observer, independent of the aircraft altitude, antenna mount, or beam pattern.

Free-space path loss is derived from $20\log_{10}(4\pi\rho/\lambda_\mathrm{RF})$, with wavelength $\lambda_\mathrm{RF}$ determined by frequency. The app uses the equivalent formula for $\rho$ in kilometers and frequency $f_\mathrm{RF}$ in megahertz.

$$
L_\mathrm{FS}=32.44+20\log_{10}(f_\mathrm{RF})+20\log_{10}(\rho)\quad\mathrm{dB}.
$$

The fixed frequency is 1621.25 MHz. The estimate is shown for paths at or above the local horizon with positive range. It describes distance loss alone. Gain, aircraft blockage loss, and transmit power require separate inputs.

### Forecast, sky plot, and drawing coordinates

The forecast repropagates the loaded satellites at 13 times spaced five minutes apart, including now and +60 minutes. The observer's position, aircraft attitude, and minimum elevation stay fixed throughout the forecast. At each time, each mount gets a count of satellites that meet the elevation threshold and clear the airframe. The table's minimum is the smallest of those 13 counts. Its average is the sum of the 13 counts divided by 13. Bars are scaled to the maximum count for the displayed forecast, with a denominator of at least one. The forecast refreshes as the current minute changes, and live satellite positions update once per second.

The sky plot uses a percentage coordinate system with zenith at $(50,50)$. The horizon is 50 units from center. With elevation in degrees and azimuth used as an angle, the plotted coordinates are

$$
r=50\frac{90-\epsilon_\mathrm{deg}}{90},\qquad
x=50+r\sin A,\qquad y=50-r\cos A.
$$

For the top-down aircraft drawing, a mount at body coordinates $(m_f,m_r,m_d)$ is placed at $(210+8.5m_r,\ 147-6m_f)$ in the 420-pixel-wide design. Positive $m_d$ marks the underside. The drawing is schematic. The ellipsoid intersection calculation uses the actual model coordinates.

The basemap uses Leaflet's Web Mercator projection. The app clamps displayed satellite marker latitudes to ±84° while retaining their computed latitudes for tracking. With canvas height $H$ pixels, its minimum zoom is $\max(2,\lceil\log_2(H/256)\rceil)$. When centering the map on a device location, it limits the center latitude through inverse Mercator. At zoom $z$, let $W=256\cdot2^z$ and $q=\max(0,1-H/W)$. The latitude limit is $\arctan(\sinh(\pi q))$ in radians.

The app's calculations are in [home.page.ts](src/app/home/home.page.ts) and [airframe.ts](src/app/home/airframe.ts).

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
