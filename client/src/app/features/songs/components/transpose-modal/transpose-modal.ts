import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';

import { TransposeService } from '../../services/transpose.service';
import { TransposeResult } from '../../models/transpose-result.model';

@Component({
  selector: 'app-transpose-modal',
  standalone: true,
  templateUrl: './transpose-modal.html',
  styleUrls: ['./transpose-modal.scss']
})
export class TransposeModalComponent implements OnChanges {
  @Input() open = false;
  @Input() currentKey = 'C';
  @Input() currentMode = '';

  @Output() cancel = new EventEmitter<void>();
  @Output() applied = new EventEmitter<TransposeResult>();

  keyOptions: string[] = [];
  selectedKey = 'C';
  semi = 0;
  accidentalPref: null | 'sharp' | 'flat' = null;

  constructor(private transposeService: TransposeService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      this.open &&
      (
        changes['open'] ||
        changes['currentKey'] ||
        changes['currentMode']
      )
    ) {
      this.resetState();
    }
  }

  private resetState(): void {
    this.semi = 0;
    this.selectedKey = this.currentKey || 'C';
    this.accidentalPref =
      this.transposeService.getDefaultAccidentalPref(this.selectedKey);

    this.keyOptions =
      this.transposeService.getKeyOptions(this.accidentalPref);
  }

  setAccidentalPref(pref: 'sharp' | 'flat'): void {
    this.accidentalPref = pref;
    this.keyOptions =
      this.transposeService.getKeyOptions(this.accidentalPref);

    this.selectedKey = this.transposeService.transposeNote(
      this.currentKey,
      this.semi,
      this.accidentalPref
    );

    this.semi = this.transposeService.semisFromKeys(
      this.currentKey,
      this.selectedKey
    );
  }

  changeSemi(delta: number): void {
    this.semi = Math.max(-11, Math.min(11, this.semi + delta));

    this.selectedKey = this.transposeService.transposeNote(
      this.currentKey,
      this.semi,
      this.accidentalPref
    );
  }

  selectKey(key: string): void {
    this.selectedKey = key;
    this.semi = this.transposeService.semisFromKeys(
      this.currentKey,
      key
    );
  }

  apply(): void {
    this.applied.emit({
      semitones: this.semi,
      accidentalPref: this.accidentalPref,
      targetKey: this.selectedKey
    });
  }

  close(): void {
    this.cancel.emit();
  }
}