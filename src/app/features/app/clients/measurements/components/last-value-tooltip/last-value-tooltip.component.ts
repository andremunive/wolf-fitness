import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output
} from '@angular/core';

/**
 * Presentational tooltip that floats above an input and shows the client's
 * last recorded value for that field.
 *
 * Rendered by the register-measurement-modal container. The container manages
 * which tooltip is active; this component only emits dismiss requests.
 */
@Component({
  selector: 'app-last-value-tooltip',
  templateUrl: './last-value-tooltip.component.html',
  styleUrls: ['./last-value-tooltip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LastValueTooltipComponent {
  /** The numeric last value to display. null = do not render (parent controls this). */
  @Input() value: number | null = null;
  /** Unit suffix shown after the value (kg, cm, mm, %). */
  @Input() unit = '';
  /**
   * When true, anchors the tooltip to the right edge of the input wrapper
   * instead of the left. Use for inputs in the right column of a two-column grid
   * to prevent the tooltip overflowing outside the viewport.
   */
  @Input() alignRight = false;

  @HostBinding('class.last-value-tooltip--align-right')
  get isAlignRight(): boolean {
    return this.alignRight;
  }

  @Output() dismissed = new EventEmitter<void>();

  dismiss(event: MouseEvent): void {
    event.stopPropagation();
    this.dismissed.emit();
  }

  get formattedValue(): string {
    if (this.value === null) return '—';
    // Show up to 2 decimal places, strip trailing zeros.
    return parseFloat(this.value.toFixed(2)).toString();
  }
}
