import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { HttpNativeService } from './http-native.service';

@Injectable({ providedIn: 'root' })
export class SatelliteProviderService {
  private readonly url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-NEXT&FORMAT=tle';

  constructor(private http: HttpClient, private nativeHttp: HttpNativeService) {}

  getData() {
    return this.http.get(this.url, { responseType: 'text' });
  }

  getDataNative() {
    return this.nativeHttp.get(this.url);
  }
}
