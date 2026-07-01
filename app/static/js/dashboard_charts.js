/**
 * dashboard_charts.js
 * Renders the rating graph (Chart.js line) and activity heatmap.
 * Data is injected by the template as JSON in data attributes.
 */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Rating Graph ─────────────────────────────────────────── */
  const graphCanvas = document.getElementById('rating-graph');
  if (graphCanvas) {
    const labels  = JSON.parse(graphCanvas.dataset.labels  || '[]');
    const values  = JSON.parse(graphCanvas.dataset.values  || '[]');
    const sources = JSON.parse(graphCanvas.dataset.sources || '[]');

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor  = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
    const labelColor = isDark ? '#8b949e' : '#57606a';

    new Chart(graphCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data:            values,
          borderColor:     '#58a6ff',
          backgroundColor: 'rgba(88,166,255,.12)',
          borderWidth:     2.5,
          pointRadius:     4,
          pointHoverRadius:6,
          pointBackgroundColor: values.map((v, i) => {
            if (i === 0) return '#58a6ff';
            return values[i] >= values[i-1] ? '#3fb950' : '#f85149';
          }),
          fill: true,
          tension: 0.35,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: ctx => sources[ctx[0].dataIndex] || ctx[0].label,
              label: ctx => ` Rating: ${ctx.parsed.y}`,
            },
            backgroundColor: isDark ? '#1c2128' : '#fff',
            titleColor:  isDark ? '#e6edf3' : '#24292f',
            bodyColor:   isDark ? '#8b949e' : '#57606a',
            borderColor: isDark ? '#30363d' : '#d0d7de',
            borderWidth: 1,
          }
        },
        scales: {
          x: {
            ticks: { color: labelColor, maxTicksLimit: 8, maxRotation: 0 },
            grid:  { color: gridColor },
          },
          y: {
            ticks: { color: labelColor },
            grid:  { color: gridColor },
            beginAtZero: false,
          }
        }
      }
    });
  }

  /* ── Activity Heatmap ─────────────────────────────────────── */
  const heatmapEl = document.getElementById('activity-heatmap');
  if (!heatmapEl) return;

  const rawData = JSON.parse(heatmapEl.dataset.heatmap || '{}');
  // rawData: { "2024-07-01": 3, ... }

  const grid = document.getElementById('heatmap-grid');
  if (!grid) return;

  // Build 52-week grid ending today
  const today = new Date();
  today.setHours(0,0,0,0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 364);
  // rewind to Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const maxCount = Math.max(...Object.values(rawData), 1);

  const cells = [];
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const key   = d.toISOString().slice(0,10);
    const count = rawData[key] || 0;
    const level = count === 0 ? 0 :
                  count <= Math.ceil(maxCount*.25) ? 1 :
                  count <= Math.ceil(maxCount*.5)  ? 2 :
                  count <= Math.ceil(maxCount*.75) ? 3 : 4;

    const cell = document.createElement('div');
    cell.className   = 'heatmap-cell';
    cell.dataset.count = count;
    cell.dataset.level = level;
    cell.title = `${key}: ${count} submission${count !== 1 ? 's' : ''}`;
    cells.push(cell);
    grid.appendChild(cell);
  }
});