import { ChartDataItem } from '@ghostfolio/common/interfaces';

import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip
} from 'chart.js';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip
);

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  selector: 'gf-ai-chat-chart',
  styleUrls: ['./ai-chat-chart.component.scss'],
  template: `
    <div class="chart-container">
      <div class="chart-label">{{ chartItem.label }}</div>

      @if (chartItem.chartType === 'table') {
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                @for (col of tableColumns; track col) {
                  <th>{{ col }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of tableRows; track $index) {
                <tr>
                  @for (cell of row; track $index) {
                    <td>{{ cell }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <canvas #chartCanvas></canvas>
      }
    </div>
  `
})
export class AiChatChartComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input() chartItem: ChartDataItem;
  @ViewChild('chartCanvas') canvasRef: ElementRef<HTMLCanvasElement>;

  public tableColumns: string[] = [];
  public tableRows: string[][] = [];

  private chartInstance: Chart | null = null;

  private static readonly COLORS = [
    '#5c6bc0',
    '#26a69a',
    '#ff7043',
    '#ab47bc',
    '#42a5f5',
    '#66bb6a',
    '#ffa726',
    '#ef5350',
    '#8d6e63',
    '#78909c',
    '#d4e157'
  ];

  public ngAfterViewInit(): void {
    this.renderChart();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartItem'] && !changes['chartItem'].firstChange) {
      this.destroyChart();
      this.prepareTableData();
      this.renderChart();
    } else {
      this.prepareTableData();
    }
  }

  public ngOnDestroy(): void {
    this.destroyChart();
  }

  private prepareTableData(): void {
    if (this.chartItem?.chartType === 'table') {
      const data = this.chartItem.data;
      this.tableColumns = (data['columns'] as string[]) ?? [];
      this.tableRows = (data['rows'] as string[][]) ?? [];
    }
  }

  private renderChart(): void {
    if (
      !this.canvasRef?.nativeElement ||
      this.chartItem.chartType === 'table'
    ) {
      return;
    }

    const data = this.chartItem.data;
    const items =
      (data['items'] as Array<{
        name?: string;
        date?: string;
        value: number;
      }>) ?? [];

    switch (this.chartItem.chartType) {
      case 'doughnut':
        this.renderDoughnut(items);
        break;
      case 'horizontalBar':
        this.renderHorizontalBar(items);
        break;
      case 'line':
        this.renderLine(items as Array<{ date: string; value: number }>);
        break;
    }
  }

  private renderDoughnut(items: Array<{ name?: string; value: number }>): void {
    this.chartInstance = new Chart(this.canvasRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: items.map((i) => i.name ?? ''),
        datasets: [
          {
            data: items.map((i) => i.value),
            backgroundColor: AiChatChartComponent.COLORS.slice(0, items.length)
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { font: { size: 11 }, boxWidth: 14, padding: 10 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%`
            }
          }
        }
      }
    });
  }

  private renderHorizontalBar(
    items: Array<{ name?: string; value: number }>
  ): void {
    this.chartInstance = new Chart(this.canvasRef.nativeElement, {
      type: 'bar',
      data: {
        labels: items.map((i) => i.name ?? ''),
        datasets: [
          {
            data: items.map((i) => i.value),
            backgroundColor: AiChatChartComponent.COLORS.slice(0, items.length)
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { ticks: { font: { size: 10 } } },
          y: { ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  private renderLine(items: Array<{ date: string; value: number }>): void {
    this.chartInstance = new Chart(this.canvasRef.nativeElement, {
      type: 'line',
      data: {
        labels: items.map((i) => i.date),
        datasets: [
          {
            data: items.map((i) => i.value),
            borderColor: '#5c6bc0',
            backgroundColor: 'rgba(92, 107, 192, 0.1)',
            fill: true,
            pointRadius: 0,
            borderWidth: 1.5,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: {
              font: { size: 9 },
              maxTicksLimit: 6
            }
          },
          y: {
            ticks: { font: { size: 10 } }
          }
        }
      }
    });
  }

  private destroyChart(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }
}
