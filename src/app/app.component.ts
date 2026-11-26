import { Component } from '@angular/core';
import { Platform } from '@ionic/angular/lazy';

@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  constructor(private platform: Platform) {
    this.initializeApp();
  }
  initializeApp() {
    this.platform.ready().then(() => {
      const cordovaWindow = window as Window & { StatusBar?: { styleDefault(): void } };
      const cordovaNavigator = navigator as Navigator & { splashscreen?: { hide(): void } };
      cordovaWindow.StatusBar?.styleDefault();
      cordovaNavigator.splashscreen?.hide();
    });
  }
}
