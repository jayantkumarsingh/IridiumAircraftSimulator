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
  await page.route('https://celestrak.org/**', route => route.fulfill({
    status: 200,
    contentType: 'text/plain',
    headers: { 'access-control-allow-origin': '*' },
    body: tle,
  }));

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

  const visibility = await page.getByRole('complementary', { name: 'Satellite visibility' }).boundingBox();
  const mapBounds = await map.boundingBox();
  const location = await page.getByRole('complementary', { name: 'My location' }).boundingBox();
  expect(visibility!.x + visibility!.width).toBeLessThanOrEqual(mapBounds!.x);
  expect(mapBounds!.x + mapBounds!.width).toBeLessThanOrEqual(location!.x);
});
