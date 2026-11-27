import { expect, test } from '@playwright/test';

test('the browser preview loads the tracker and location panel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Iridium Aircraft Simulator', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load satellites' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My location' })).toBeVisible();
  await page.getByRole('button', { name: 'Close location panel' }).click();
  await expect(page.getByRole('heading', { name: 'My location' })).toBeHidden();
});

test('loads satellite data and calculates visibility on a tall map', async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1220 });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 45.322, longitude: -75.931 });
  const tle = [
    'IRIDIUM 106',
    '1 41917U 17003A   26329.53984159  .00000050  00000+0  10709-4 0  9994',
    '2 41917  86.3984  21.0817 0002488  94.6564 265.4916 14.34217874516339',
    'IRIDIUM 103',
    '1 41918U 17003B   26329.38761896  .00000040  00000+0  71493-5 0  9996',
    '2 41918  86.3985  21.0449 0002171  98.6342 261.5100 14.34217740516333',
  ].join('\r\n');
  await page.clock.setFixedTime(new Date('2026-11-25T22:00:00Z'));
  let tleRequests = 0;
  await page.route('https://celestrak.org/**', route => {
    tleRequests++;
    return route.fulfill({
      status: 200,
      contentType: 'text/plain',
      headers: { 'access-control-allow-origin': '*' },
      body: tle,
    });
  });

  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=', 'base64'),
  }));
  await page.route('/', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('</head>',
      '<style id="delay-map-layout">#map_canvas { display: none !important; }</style></head>');
    await route.fulfill({ response, body: html });
  });
  await page.goto('/');
  const loadSatellites = page.getByRole('button', { name: 'Load satellites' });
  await expect(loadSatellites).toBeVisible();
  await page.locator('#map_canvas').waitFor({ state: 'attached' });
  await expect(page.locator('#map_canvas')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pick on map' })).toBeDisabled();
  await page.locator('#delay-map-layout').evaluate(style => style.remove());
  const map = page.locator('#map_canvas.leaflet-container');
  await expect(map).toBeVisible();
  await expect(map.getByRole('link', { name: 'OpenStreetMap' })).toBeVisible();
  const footprints = map.locator('.leaflet-overlay-pane svg path');
  const loadPrompt = page.getByText('Click Load satellites to get satellite positions.');
  await expect(loadPrompt).toBeVisible();
  expect(tleRequests).toBe(0);

  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByText('Device location', { exact: false })).toBeVisible();
  await loadSatellites.click();
  await expect(page.getByRole('heading', { name: 'IRIDIUM 106' })).toBeVisible();
  await expect(map.locator('.leaflet-marker-icon')).toHaveCount(3);
  await expect(footprints).toHaveCount(1);
  await page.getByRole('button', { name: 'Show all footprints' }).click();
  await expect(footprints).toHaveCount(2);
  await page.getByRole('button', { name: 'Hide all footprints' }).click();
  await expect(footprints).toHaveCount(1);

  await page.getByRole('button', { name: 'Pick on map' }).click();
  await map.click({ position: { x: 180, y: 180 } });
  await expect(page.getByText('Custom location', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next 60 minutes' })).toBeVisible();
  await expect(page.getByText('Free-space path loss', { exact: true })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Aircraft simulation' }).check();
  await page.getByRole('spinbutton', { name: 'Altitude (ft)' }).fill('28000');
  await page.getByRole('radio', { name: /Underside/ }).check();
  await expect(page.getByRole('img', { name: 'Top view of the aircraft with the Underside mount highlighted' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Clear satellites by mount over 60 minutes' })).toBeVisible();
  await expect(page.getByText(/blocked by the airframe/)).toBeVisible();
  await page.getByRole('radio', { name: /Upper left side/ }).check();
  await expect(page.getByRole('img', { name: 'Top view of the aircraft with the Upper left side mount highlighted' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Upper left side' })).toBeVisible();

  const sky = page.getByRole('img', { name: /Sky view/ });
  const orientation = page.getByRole('combobox', { name: 'Orientation' });
  const aircraftSymbol = sky.locator('.sky-aircraft');
  const heading = page.getByRole('spinbutton', { name: /Heading/ });
  await heading.fill('90');
  await heading.press('Tab');
  await expect(sky).toHaveAccessibleName(/aircraft heading at the top/);
  await expect(sky).toHaveCSS('rotate', '-90deg');
  await expect(sky.getByText('E', { exact: true })).toHaveCSS('rotate', '90deg');
  await expect(aircraftSymbol).toBeVisible();
  await expect(orientation).toHaveValue('heading');
  await orientation.selectOption('north');
  await expect(sky).toHaveAccessibleName(/north at the top/);
  await expect(sky).toHaveCSS('rotate', '0deg');
  await expect(aircraftSymbol).toHaveCSS('transform', 'matrix(0, 1, -1, 0, -11, -11)');
  await orientation.selectOption('heading');
  await expect(sky).toHaveCSS('rotate', '-90deg');
  await page.getByRole('checkbox', { name: 'Aircraft simulation' }).uncheck();
  await expect(sky).toHaveAccessibleName(/north at the top/);
  await expect(sky).toHaveCSS('rotate', '0deg');

  const visibility = await page.getByRole('complementary', { name: 'Satellite visibility' }).boundingBox();
  const mapBounds = await map.boundingBox();
  const location = await page.getByRole('complementary', { name: 'My location' }).boundingBox();
  expect(visibility!.x + visibility!.width).toBeLessThanOrEqual(mapBounds!.x);
  expect(mapBounds!.x + mapBounds!.width).toBeLessThanOrEqual(location!.x);

  await page.unroute('/');
  await page.clock.setFixedTime(new Date('2026-11-26T03:59:59Z'));
  await page.reload();
  await expect(map).toBeVisible();
  await expect(page.getByRole('heading', { name: 'IRIDIUM 106' })).toBeVisible();
  await expect(loadPrompt).toBeHidden();
  expect(tleRequests).toBe(1);

  await page.clock.setFixedTime(new Date('2026-11-26T04:00:00Z'));
  await page.reload();
  await expect(loadPrompt).toBeVisible();
  await expect(map.locator('.leaflet-marker-icon')).toHaveCount(0);
  expect(tleRequests).toBe(1);
  const refresh = page.waitForResponse('https://celestrak.org/**');
  await loadSatellites.click();
  await refresh;
  await expect(page.getByRole('heading', { name: 'IRIDIUM 106' })).toBeVisible();
  expect(tleRequests).toBe(2);

  await page.route('https://celestrak.org/**', route => route.abort());
  await page.clock.setFixedTime(new Date('2026-11-26T10:00:00Z'));
  await page.reload();
  await expect(map).toBeVisible();
  await expect(loadPrompt).toBeVisible();
  const failedRefresh = page.waitForEvent('requestfailed', request =>
    request.url().startsWith('https://celestrak.org/')
  );
  await loadSatellites.click();
  await failedRefresh;
  await expect(page.getByRole('heading', { name: 'IRIDIUM 106' })).toBeVisible();
});
