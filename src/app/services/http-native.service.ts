import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

interface CordovaHttp {
  get(
    url: string,
    parameters: Record<string, string>,
    headers: Record<string, string>,
    success: (response: { data: string }) => void,
    failure: (error: unknown) => void
  ): void;
}

@Injectable({ providedIn: 'root' })
export class HttpNativeService {
  get(url: string): Observable<string> {
    return new Observable(subscriber => {
      const runtime = window as Window & { cordova?: { plugin?: { http?: CordovaHttp } } };
      const http = runtime.cordova?.plugin?.http;
      if (!http) {
        subscriber.error(new Error('Cordova HTTP plugin is unavailable.'));
        return;
      }
      http.get(url, {}, {}, response => {
        subscriber.next(response.data);
        subscriber.complete();
      }, error => subscriber.error(error));
    });
  }
}
