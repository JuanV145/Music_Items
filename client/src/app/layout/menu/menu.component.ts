import { Component, signal, inject } from '@angular/core';
import { Router, NavigationEnd, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';

interface MenuItem {
  label: string;
  path: string;
  exact?: boolean;
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)'
  }
})
export class MenuComponent {
  private readonly router = inject(Router);

  readonly isMenuOpen = signal(false);

  readonly isHome = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects === '/' || e.urlAfterRedirects === '')
    ),
    { initialValue: this.router.url === '/' || this.router.url === '' }
  );

  readonly menuItems: MenuItem[] = [
    { label: 'Inicio', path: '', exact: true },
    { label: 'Visualizador de canciones', path: 'visualizador' },
    { label: 'Modificar canciones', path: 'modificar' },
    { label: 'Metrónomo', path: 'metronomo' }
  ];

  toggleMenu(): void {
    this.isMenuOpen.update(open => !open);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.menu-wrapper')) {
      this.closeMenu();
    }
  }
}