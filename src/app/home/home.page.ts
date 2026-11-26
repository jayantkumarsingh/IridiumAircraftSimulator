import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { circle as createCircle, icon, map, marker, tileLayer } from 'leaflet';
import type { Circle, LatLngLiteral, Map as LeafletMap, Marker } from 'leaflet';
import { Platform, ToastController, LoadingController } from "@ionic/angular";
import { SatelliteProviderService } from '../services/satellite.provider.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { twoline2satrec } from 'satellite.js/dist/io';
import { gstime, propagate } from 'satellite.js/dist/propagation';
import { degreesLat, degreesLong, ecfToLookAngles, eciToEcf, eciToGeodetic } from 'satellite.js/dist/transforms';
import type { EcfVec3, GeodeticLocation, SatRec } from 'satellite.js';
import { bodyDirection, drawAirframe, isBlocked, mounts } from './airframe';


const EARTH_RADIUS_KM = 6371;
const MERCATOR_MARKER_LIMIT = 84;
const MAP_TILE_SIZE_PX = 256;
const IRIDIUM_CENTER_FREQUENCY_MHZ = 1621.25;
const RADIANS_PER_DEGREE = Math.PI / 180;

interface SatellitePosition {
  center: LatLngLiteral;
  altitudeKm: number;
  earthFixed: EcfVec3<number>;
}

interface SatelliteDetails {
  name: string;
  orbit: SatRec;
  position: SatellitePosition;
}

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy{

  map: LeafletMap;
  private loadingSatellites = false;
  private markerTimer: number;
  private markerClicks = new Subscription();
  private tracked: (SatelliteDetails & { marker: Marker })[] = [];
  selected: SatelliteDetails;
  showSatellite = false;
  showLocation = true;
  minimumElevation = 20;
  observer: GeodeticLocation;
  aircraftMode = false;
  readonly mounts = mounts;
  mountIndex = 0;
  private aircraftPreview?: HTMLCanvasElement;
  @ViewChild('airframePreview') set airframePreview(element: ElementRef<HTMLCanvasElement> | undefined) {
    this.aircraftPreview = element?.nativeElement;
    if (this.aircraftPreview) {
      drawAirframe(this.aircraftPreview, this.mountIndex);
    }
  }
  readonly aircraftControls = [
    { key: 'altitude', label: 'Altitude (m)', min: 0, max: 20000, step: 100 },
    { key: 'heading', label: 'Heading (°)', min: 0, max: 359, step: 1 },
    { key: 'pitch', label: 'Pitch (°)', min: -90, max: 90, step: 1 },
    { key: 'roll', label: 'Roll (°)', min: -180, max: 180, step: 1 }
  ] as const;
  aircraft = { altitude: 10000, heading: 0, pitch: 0, roll: 0 };
  blocked: HomePage['visible'] = [];
  mountForecast: { minimum: number; average: number }[] = [];
  locationSource: 'device' | 'custom';
  pickingLocation = false;
  private locationMarker: Marker;
  locating = false;
  locationError = '';
  visible: { name: string; elevation: number; azimuth: number; pathLossDb: number | null; x: number; y: number }[] = [];
  forecast: { minute: number; count: number }[] = [];
  forecastMax = 1;
  showAllFootprints = false;
  private footprints = new Map<SatRec, Circle>();
  private footprintVisible = false;
  private mapResizeObserver?: ResizeObserver;
  private destroyed = false;
  constructor(
    private zone: NgZone,
    private changeDetector: ChangeDetectorRef,
    public plt: Platform,
    public loadingCtrl: LoadingController,
    public toastCtrl: ToastController,
    public satDataProvider:SatelliteProviderService)
  { }

  public ngOnInit() {
    this.plt.ready().then(() => {
      if (!this.destroyed) {
        this.initMap();
      }
    });
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.mapResizeObserver?.disconnect();
    this.map?.remove();
    this.markerClicks.unsubscribe();
    window.clearInterval(this.markerTimer);
  }

  private getPosition(orbit: SatRec, time: Date, gmst: number): SatellitePosition | undefined {
    const position = propagate(orbit, time)?.position;
    if (!position || typeof position !== 'object') {
      return;
    }

    const coordinates = eciToGeodetic(position, gmst);
    const latitude = degreesLat(coordinates.latitude);
    const longitude = degreesLong(coordinates.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return {
        center: { lat: latitude, lng: longitude },
        altitudeKm: coordinates.height,
        earthFixed: eciToEcf(position, gmst)
      };
    }
  }

  initMap() {
    const canvas = document.getElementById('map_canvas');
    if (!canvas || this.mapResizeObserver) {
      return;
    }
    this.mapResizeObserver = new ResizeObserver(() => {
      if (this.destroyed || !canvas.clientWidth || !canvas.clientHeight) {
        return;
      }
      const zoom = Math.max(2, Math.ceil(Math.log2(canvas.clientHeight / MAP_TILE_SIZE_PX)));
      if (this.map) {
        this.map.invalidateSize({ animate: false });
        this.map.setMinZoom(zoom);
      } else {
        this.createMap(canvas, zoom);
      }
    });
    this.mapResizeObserver.observe(canvas);
  }

  private markerPosition({ lat, lng }: LatLngLiteral): LatLngLiteral {
    // Web Mercator tiles end near 85 degrees. Keep the icon inside the tile edge.
    return { lat: Math.max(-MERCATOR_MARKER_LIMIT, Math.min(MERCATOR_MARKER_LIMIT, lat)), lng };
  }

  private createMap(canvas: HTMLElement, zoom: number) {
    this.map = map(canvas, { center: [0, 0], zoom, minZoom: zoom, worldCopyJump: true });
    tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);
    this.map.on('click', ({ latlng }) => this.zone.run(() => {
      if (this.pickingLocation) {
        this.pickingLocation = false;
        this.setObserver(latlng.wrap(), 'custom');
      }
      this.footprintVisible = false;
      this.showAllFootprints = false;
      this.updateFootprints();
      this.changeDetector.markForCheck();
    }));
    this.changeDetector.markForCheck();
  }

  async onButtonClick() {
    if (!this.map || this.loadingSatellites) {
      return;
    }

    this.loadingSatellites = true;
    let loading: HTMLIonLoadingElement;
    try {
      loading = await this.loadingCtrl.create({ message: 'Loading satellites…' });
      await loading.present();

      const request = this.plt.is('cordova') && this.plt.is('android')
        ? this.satDataProvider.getDataNative()
        : this.satDataProvider.getData();
      const tle: string = await firstValueFrom(request);
      if (this.destroyed) {
        return;
      }

      const lines = tle.trim().split(/\r?\n/);
      const time = new Date();
      const gmst = gstime(time);
      const satellites: SatelliteDetails[] = [];
      for (let index = 0; index + 2 < lines.length; index += 3) {
        const [name, line1, line2] = lines.slice(index, index + 3);
        if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) {
          continue;
        }

        const orbit = twoline2satrec(line1, line2);
        const position = this.getPosition(orbit, time, gmst);
        if (position) {
          satellites.push({ name: name.trim(), orbit, position });
        }
      }

      if (satellites.length === 0) {
        await this.showToast('No satellite positions were available.');
        return;
      }

      const satelliteIcon = icon({
        iconUrl: 'assets/icon/satellite-512.png',
        iconSize: [28, 28],
        className: 'tracker-satellite-marker'
      });
      window.clearInterval(this.markerTimer);
      this.markerClicks.unsubscribe();
      this.markerClicks = new Subscription();
      for (const { marker } of this.tracked) {
        marker.remove();
      }
      for (const circle of this.footprints.values()) {
        circle.remove();
      }
      this.footprints.clear();

      this.tracked = satellites.map(details => {
        const satelliteMarker = marker(this.markerPosition(details.position.center), {
          icon: satelliteIcon,
          alt: details.name,
          title: details.name
        }).addTo(this.map);
        const entry = { ...details, marker: satelliteMarker };
        const onMarkerClick = () => this.zone.run(() => {
          this.selectSatellite(entry);
        });
        satelliteMarker.on('click', onMarkerClick);
        this.markerClicks.add(() => satelliteMarker.off('click', onMarkerClick));
        return entry;
      });
      this.selectSatellite(this.tracked[0]);
      this.refreshVisibility();
      this.refreshForecast();
      this.markerTimer = window.setInterval(() => this.updateMarkers(), 1000);
    } catch (error) {
      console.error('Unable to load satellite markers', error);
      await this.showToast('Unable to load satellite markers.');
    } finally {
      this.loadingSatellites = false;
      if (loading) {
        await loading.dismiss();
      }
    }
  }

  private updateMarkers() {
    const time = new Date();
    const gmst = gstime(time);
    for (const entry of this.tracked) {
      const position = this.getPosition(entry.orbit, time, gmst);
      if (position) {
        entry.position = position;
        entry.marker.setLatLng(this.markerPosition(position.center));
      }
    }
    this.updateFootprints();
    this.refreshVisibility();
    this.changeDetector.markForCheck();
    if (this.observer && Math.floor(time.getTime() / 60000) !== this.forecastMinute) {
      this.refreshForecast();
    }
  }

  selectSatellite(details: SatelliteDetails) {
    this.selected = details;
    this.footprintVisible = true;
    this.showSatellite = true;
    this.changeDetector.markForCheck();
    this.updateFootprints();
  }

  private forecastMinute = -1;

  async useLocation() {
    this.showLocation = true;
    if (this.locating) {
      return;
    }
    this.pickingLocation = false;
    this.locating = true;
    this.locationError = '';
    try {
      const latLng = await new Promise<LatLngLiteral>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
          reject,
          { timeout: 15000 }
        );
      });
      if (this.destroyed) {
        return;
      }
      this.setObserver(latLng, 'device');
      const canvas = document.getElementById('map_canvas');
      const worldHeight = MAP_TILE_SIZE_PX * 2 ** this.map.getZoom();
      if (canvas && Number.isFinite(worldHeight)) {
        // Limit panning so the viewport stays within the vertical tile range.
        const centerFraction = Math.max(0, 1 - canvas.clientHeight / worldHeight);
        const limit = Math.atan(Math.sinh(Math.PI * centerFraction)) / RADIANS_PER_DEGREE;
        this.map.panTo({ lat: Math.max(-limit, Math.min(limit, latLng.lat)), lng: latLng.lng }, { animate: false });
      }
    } catch {
      this.locationError = 'Location unavailable. Check your location permissions and try again.';
    } finally {
      this.locating = false;
      this.changeDetector.markForCheck();
    }
  }

  toggleLocationPanel() {
    this.showLocation = !this.showLocation;
    if (!this.showLocation) {
      this.pickingLocation = false;
    }
  }

  toggleLocationPicker() {
    this.pickingLocation = !this.pickingLocation;
    this.locationError = '';
  }

  private setObserver(position: LatLngLiteral, source: 'device' | 'custom') {
    this.observer = {
      latitude: position.lat * RADIANS_PER_DEGREE,
      longitude: position.lng * RADIANS_PER_DEGREE,
      height: this.aircraftMode ? this.aircraft.altitude / 1000 : 0
    };
    this.locationSource = source;
    this.changeDetector.markForCheck();

    if (this.locationMarker) {
      this.locationMarker.setLatLng(position);
    } else {
      this.locationMarker = marker(position, {
        icon: icon({ iconUrl: 'assets/icon/observer-location.png', iconSize: [22, 22] }),
        zIndexOffset: 1000,
        interactive: false,
        keyboard: false
      }).addTo(this.map);
    }

    this.refreshVisibility();
    this.refreshForecast();
  }

  get observerLatitude() {
    return this.observer.latitude / RADIANS_PER_DEGREE;
  }

  get observerLongitude() {
    return this.observer.longitude / RADIANS_PER_DEGREE;
  }

  get epoch() {
    return (this.selected.orbit.jdsatepoch - 2440587.5) * 86400000;
  }

  get selectedLook() {
    return this.observer && this.selected ? this.getLook(this.selected.position) : undefined;
  }

  toggleAircraftMode() {
    this.aircraftMode = !this.aircraftMode;
    this.refreshAircraft();
  }

  setAircraftControl(key: keyof HomePage['aircraft'], value: number) {
    const control = this.aircraftControls.find(item => item.key === key);
    if (Number.isFinite(value)) {
      this.aircraft[key] = Math.min(control.max, Math.max(control.min, value));
      this.refreshAircraft();
    }
  }

  setMount(index: number) {
    this.mountIndex = index;
    if (this.aircraftPreview) {
      drawAirframe(this.aircraftPreview, index);
    }
    this.refreshVisibility();
    this.refreshForecast();
  }

  private refreshAircraft() {
    if (this.observer) {
      this.observer = { ...this.observer, height: this.aircraftMode ? this.aircraft.altitude / 1000 : 0 };
    }
    this.refreshVisibility();
    this.refreshForecast();
  }

  private aircraftDirection(azimuth: number, elevation: number) {
    const { heading, pitch, roll } = this.aircraft;
    return bodyDirection(azimuth, elevation, heading, pitch, roll);
  }

  setElevation(value: number) {
    this.minimumElevation = value;
    this.updateFootprints();
    this.refreshVisibility();
    this.refreshForecast();
  }

  private getLook(position: SatellitePosition) {
    const look = ecfToLookAngles(this.observer, position.earthFixed);
    return {
      elevation: look.elevation / RADIANS_PER_DEGREE,
      azimuth: look.azimuth / RADIANS_PER_DEGREE,
      range: look.rangeSat,
      pathLossDb: look.elevation >= 0 && look.rangeSat > 0
        ? 32.44 + 20 * Math.log10(IRIDIUM_CENTER_FREQUENCY_MHZ) + 20 * Math.log10(look.rangeSat)
        : null
    };
  }

  private refreshVisibility() {
    if (!this.observer) {
      return;
    }
    this.blocked = [];
    this.visible = this.tracked.flatMap(({ name, position }) => {
      const { elevation, azimuth, pathLossDb } = this.getLook(position);
      if (!(elevation >= this.minimumElevation)) {
        return [];
      }
      const radius = (90 - elevation) / 90 * 50;
      const angle = azimuth * RADIANS_PER_DEGREE;
      const satellite = {
        name, elevation, azimuth, pathLossDb,
        x: 50 + radius * Math.sin(angle),
        y: 50 - radius * Math.cos(angle)
      };
      if (this.aircraftMode && isBlocked(mounts[this.mountIndex].position, this.aircraftDirection(azimuth, elevation))) {
        this.blocked.push(satellite);
        return [];
      }
      return [satellite];
    }).sort((a, b) => b.elevation - a.elevation);
  }

  private refreshForecast() {
    if (!this.observer || !this.tracked.length) {
      return;
    }
    const now = Date.now();
    this.forecastMinute = Math.floor(now / 60000);
    const mountSamples = mounts.map(() => [] as number[]);
    this.forecast = Array.from({ length: 13 }, (_, index) => {
      const minute = index * 5;
      const time = new Date(now + minute * 60000);
      const gmst = gstime(time);
      const eligible = this.tracked.flatMap(({ orbit }) => {
        const position = this.getPosition(orbit, time, gmst);
        if (!position) {
          return [];
        }
        const look = this.getLook(position);
        return look.elevation >= this.minimumElevation ? [look] : [];
      });
      if (!this.aircraftMode) {
        return { minute, count: eligible.length };
      }
      const directions = eligible.map(({ azimuth, elevation }) => this.aircraftDirection(azimuth, elevation));
      const counts = mounts.map(({ position }, mount) => {
        const count = directions.filter(direction => !isBlocked(position, direction)).length;
        mountSamples[mount].push(count);
        return count;
      });
      return { minute, count: counts[this.mountIndex] };
    });
    this.forecastMax = Math.max(1, ...this.forecast.map(({ count }) => count));
    this.mountForecast = this.aircraftMode ? mountSamples.map(samples => ({
      minimum: Math.min(...samples),
      average: samples.reduce((sum, value) => sum + value, 0) / samples.length
    })) : [];
  }

  footprintRadiusKm(altitudeKm: number): number {
    if (!Number.isFinite(altitudeKm) || altitudeKm <= 0) {
      return 0;
    }
    const elevation = this.minimumElevation * RADIANS_PER_DEGREE;
    const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm);
    return EARTH_RADIUS_KM * (Math.acos(ratio * Math.cos(elevation)) - elevation);
  }

  toggleAllFootprints() {
    this.showAllFootprints = !this.showAllFootprints;
    this.updateFootprints();
  }

  private updateFootprints() {
    for (const entry of this.tracked) {
      const circle = this.footprints.get(entry.orbit);
      const showFootprint = this.showAllFootprints || (this.footprintVisible && entry === this.selected);
      const radius = showFootprint ? this.footprintRadiusKm(entry.position.altitudeKm) * 1000 : 0;
      if (!radius) {
        if (circle) {
          circle.remove();
          this.footprints.delete(entry.orbit);
        }
        continue;
      }

      const { center } = entry.position;
      if (circle) {
        circle.setLatLng(center);
        if (circle.getRadius() !== radius) {
          circle.setRadius(radius);
        }
      } else {
        this.footprints.set(entry.orbit, createCircle(center, {
          radius,
          color: '#091958',
          opacity: 0.32,
          weight: 2,
          fillColor: '#2a3366',
          fillOpacity: 0.05,
          interactive: false
        }).addTo(this.map));
      }
    }
  }

  async showToast(message: string) {
    let toast = await this.toastCtrl.create({
      message: message,
      duration: 2000,
      position: 'middle'
    });

    toast.present();
  }
}
