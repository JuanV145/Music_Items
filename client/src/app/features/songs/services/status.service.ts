import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StatusService {

  readonly message = signal('');

  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  show(message: string, duration = 0): void {
    this.clearTimeout();

    this.message.set(message);

    if (duration > 0) {
      this.timeoutId = setTimeout(() => {
        this.message.set('');
        this.timeoutId = null;
      }, duration);
    }
  }

  clear(): void {
    this.clearTimeout();
    this.message.set('');
  }

  private clearTimeout(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}