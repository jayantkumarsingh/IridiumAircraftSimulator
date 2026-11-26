import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { SatelliteProviderService } from './satellite.provider.service';

describe('Satellite.ProviderService', () => {
  let service: SatelliteProviderService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(SatelliteProviderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
