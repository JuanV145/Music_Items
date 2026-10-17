import { Component, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

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
  readonly isMenuOpen = signal(false);

  readonly menuItems: MenuItem[] = [
    { label: 'Inicio', path: '', exact: true },
    { label: 'Visualizador de canciones', path: 'visualizador' },
    { label: 'Modificar canciones', path: 'modificar' },
    { label: 'Metrónomo', path: 'metronomo' },
    { label: 'DAW', path: 'daw' }
  ];

  constructor(private readonly router: Router) {}

  get currentSectionLabel(): string {
    const currentPath = this.router.url.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, '');
    return this.menuItems.find(item => item.path === currentPath)?.label ?? 'Inicio';
  }

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