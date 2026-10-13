import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-editor-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editor-panel.html',
  styleUrls: ['./editor-panel.scss']
})
export class EditorPanelComponent {
  @Input() structureContent = '';
  @Input() songContent = '';

  @Output() structureContentChange = new EventEmitter<string>();
  @Output() songContentChange = new EventEmitter<string>();
  @Output() contentChanged = new EventEmitter<void>();
  @Output() textChanged = new EventEmitter<void>();
  @Output() sectionInserted = new EventEmitter<string>();

  @ViewChild('songEditor')
  editorRef!: ElementRef<HTMLTextAreaElement>;

  onContentChanged(): void {
    this.structureContentChange.emit(this.structureContent);
    this.songContentChange.emit(this.songContent);
    this.contentChanged.emit();
    this.textChanged.emit();
  }

  insertSection(sectionName: string): void {
    if (!this.editorRef) {
      this.sectionInserted.emit(sectionName);
      return;
    }

    const textarea = this.editorRef.nativeElement;
    const insertText = `\n[${sectionName.toUpperCase()}]\n`;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;

    textarea.value =
      textarea.value.substring(0, startPos) +
      insertText +
      textarea.value.substring(endPos);

    textarea.selectionStart =
      textarea.selectionEnd =
      startPos + insertText.length;

    this.songContent = textarea.value;
    this.songContentChange.emit(this.songContent);

    textarea.focus();

    this.textChanged.emit();
    this.contentChanged.emit();
    this.sectionInserted.emit(sectionName);
  }
}