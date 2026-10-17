import { AfterViewInit, Component, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  private revealObserver?: IntersectionObserver;

  constructor(
    private router: Router,
    private elementRef: ElementRef<HTMLElement>
  ) {}

  ngAfterViewInit(): void {
    const revealItems = this.elementRef.nativeElement.querySelectorAll<HTMLElement>(
      '.hero-copy, .hero-art, .hero-index, .section-head, .tool-card, .home-footer'
    );

    if (typeof IntersectionObserver === 'undefined') {
      revealItems.forEach((item) => item.classList.add('is-visible'));
      return;
    }

    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('is-visible', entry.isIntersecting);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    revealItems.forEach((item, index) => {
      item.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 90}ms`);
      this.revealObserver?.observe(item);
    });
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
  }

  // Navigation methods for quick actions buttons
  goToVisualizador(): void {
    this.router.navigate(['/visualizador']);
  }

  goToModificar(): void {
    this.router.navigate(['/modificar']);
  }

  goToMetronomo(): void {
    this.router.navigate(['/metronomo']);
  }

  goToDaw(): void {
    this.router.navigate(['/daw']);
  }
}