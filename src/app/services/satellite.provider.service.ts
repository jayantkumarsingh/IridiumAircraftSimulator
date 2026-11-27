import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, defer, map, Observable, of } from 'rxjs';
import { HttpNativeService } from './http-native.service';

interface CachedTle {
  tle: string;
  fetchedAt: number;
}

@Injectable({ providedIn: 'root' })
export class SatelliteProviderService {
  private readonly url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-NEXT&FORMAT=tle';
  private readonly cacheKey = 'iridium-next-tle';
  private readonly maxCacheAgeMs = 6 * 60 * 60 * 1000;

  constructor(private http: HttpClient, private nativeHttp: HttpNativeService) {}

  getData() {
    return this.load(this.http.get(this.url, { responseType: 'text' }));
  }

  getDataNative() {
    return this.load(this.nativeHttp.get(this.url));
  }

  getFreshCachedData(): string | undefined {
    return this.freshTle(this.readCache());
  }

  private freshTle(cached: CachedTle | undefined): string | undefined {
    return cached && Date.now() - cached.fetchedAt < this.maxCacheAgeMs ? cached.tle : undefined;
  }

  private load(request: Observable<string>): Observable<string> {
    return defer(() => {
      const cached = this.readCache();
      const fresh = this.freshTle(cached);
      if (fresh) {
        return of(fresh);
      }

      return request.pipe(
        map(tle => {
          if (!this.hasTle(tle)) {
            throw new Error('CelesTrak did not return TLE data.');
          }
          try {
            const entry: CachedTle = { tle, fetchedAt: Date.now() };
            localStorage.setItem(this.cacheKey, JSON.stringify(entry));
          } catch {
            // The download still works when local storage is unavailable.
          }
          return tle;
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
      if (entry && Number.isFinite(entry.fetchedAt) && entry.fetchedAt <= Date.now() &&
          typeof entry.tle === 'string' && this.hasTle(entry.tle)) {
        return entry;
      }
    } catch {
      // An unreadable cache is treated as a cache miss.
    }
    return undefined;
  }

  private hasTle(tle: string): boolean {
    const lines = tle.trim().split(/\r?\n/);
    return lines.some((line, index) =>
      index % 3 === 1 && line.startsWith('1 ') && lines[index + 1]?.startsWith('2 ')
    );
  }
}
