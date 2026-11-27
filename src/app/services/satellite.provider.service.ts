import { HttpClient } from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { catchError, defer, map, Observable, of } from 'rxjs';
import { HttpNativeService } from './http-native.service';

interface CachedTle {
  tle: string;
  fetchedAt: number;
}

@Injectable({ providedIn: 'root' })
export class SatelliteProviderService {
  private readonly document = inject(DOCUMENT);
  private readonly url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-NEXT&FORMAT=tle';
  private readonly cacheKey = 'iridium-next-tle';
  private readonly maxCacheAgeMs = 6 * 60 * 60 * 1000;

  constructor(private http: HttpClient, private nativeHttp: HttpNativeService) {}

  getData() {
    const sharedFile = this.document.querySelector<HTMLMetaElement>('meta[name="tle-cache"]')?.content;
    if (sharedFile) {
      const url = new URL(sharedFile, this.document.baseURI).href;
      return this.load(this.http.get<CachedTle>(url));
    }
    return this.load(this.withFetchTime(this.http.get(this.url, { responseType: 'text' })));
  }

  getDataNative() {
    return this.load(this.withFetchTime(this.nativeHttp.get(this.url)));
  }

  getFreshCachedData(): string | undefined {
    return this.freshTle(this.readCache());
  }

  private freshTle(cached: CachedTle | undefined): string | undefined {
    return cached && Date.now() - cached.fetchedAt < this.maxCacheAgeMs ? cached.tle : undefined;
  }

  private withFetchTime(request: Observable<string>): Observable<CachedTle> {
    return request.pipe(map(tle => ({ tle, fetchedAt: Date.now() })));
  }

  private load(request: Observable<CachedTle>): Observable<string> {
    return defer(() => {
      const cached = this.readCache();
      const fresh = this.freshTle(cached);
      if (fresh) {
        return of(fresh);
      }

      return request.pipe(
        map(entry => {
          if (!this.isValidCacheEntry(entry)) {
            throw new Error('The satellite feed did not return valid TLE data.');
          }
          if (cached && cached.fetchedAt > entry.fetchedAt) {
            return cached.tle;
          }
          try {
            localStorage.setItem(this.cacheKey, JSON.stringify(entry));
          } catch {
            // The download still works when local storage is unavailable.
          }
          return entry.tle;
        }),
        catchError(error => {
          if (cached) {
            return of(cached.tle);
          }
          throw error;
        })
      );
    });
  }

  private readCache(): CachedTle | undefined {
    try {
      const entry: CachedTle | null = JSON.parse(localStorage.getItem(this.cacheKey) ?? 'null');
      if (this.isValidCacheEntry(entry)) {
        return entry;
      }
    } catch {
      // An unreadable cache is treated as a cache miss.
    }
    return undefined;
  }

  private isValidCacheEntry(entry: CachedTle | null): entry is CachedTle {
    return !!entry && Number.isFinite(entry.fetchedAt) && entry.fetchedAt <= Date.now() &&
      typeof entry.tle === 'string' && this.hasTle(entry.tle);
  }

  private hasTle(tle: string): boolean {
    const lines = tle.trim().split(/\r?\n/);
    return lines.some((line, index) =>
      index % 3 === 1 && line.startsWith('1 ') && lines[index + 1]?.startsWith('2 ')
    );
  }
}
