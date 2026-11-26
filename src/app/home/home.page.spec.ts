import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { IonicModule, Platform } from '@ionic/angular/lazy';

import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ HomePage ],
      imports: [CommonModule, IonicModule.forRoot()],
      providers: [provideHttpClient(), { provide: Platform, useValue: { ready: () => Promise.resolve() } }]
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    spyOn(component, 'initMap');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
