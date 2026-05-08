import { formatDuration, todayISO } from './util.js';

// ============================================================
// Leaderboard computation
// ============================================================
export function computeLeaderboard(players) {
  return [...players]
    .map((p) => {
      const games = p.gamesPlayed || 0;
      return {
        id: p.id,
        name: p.name,
        wins: p.wins || 0,
        losses: p.losses || 0,
        games,
        winRate: games > 0 ? p.wins / games : 0,
        bestStreak: p.bestStreak || 0,
      };
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.games !== a.games) return b.games - a.games;
      return a.name.localeCompare(b.name);
    });
}

// ============================================================
// File download helper
// ============================================================
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFilenamePart(session) {
  const name = (session.name || 'session').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40);
  return `${name}_${session.date || todayISO()}`;
}

// ============================================================
// CSV
// ============================================================
export function exportCsv(session) {
  const board = computeLeaderboard(session.players);
  const escapeCsv = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = [];
  rows.push(['Session', session.name, 'Date', session.date].map(escapeCsv).join(','));
  rows.push(['Players', session.players.length, 'Games', session.history.length].map(escapeCsv).join(','));
  rows.push('');
  rows.push(['Rank', 'Name', 'Wins', 'Losses', 'Games', 'Win Rate', 'Best Streak'].map(escapeCsv).join(','));
  board.forEach((p, i) => {
    const rate = p.games > 0 ? (p.winRate * 100).toFixed(1) + '%' : '';
    rows.push([i + 1, p.name, p.wins, p.losses, p.games, rate, p.bestStreak].map(escapeCsv).join(','));
  });
  rows.push('');
  rows.push(['Game Log'].map(escapeCsv).join(','));
  rows.push(['#', 'Time', 'Court', 'Source', 'Duration', 'Winners', 'Losers'].map(escapeCsv).join(','));
  [...session.history].reverse().forEach((h, i) => {
    const time = new Date(h.time).toLocaleString();
    const dur = h.durationMs != null ? formatDuration(h.durationMs) : '';
    rows.push(
      [i + 1, time, h.court, h.source || '', dur, h.winners.join(' & '), h.losers.join(' & ')]
        .map(escapeCsv)
        .join(',')
    );
  });
  downloadFile(`pickleball_${safeFilenamePart(session)}.csv`, rows.join('\n'), 'text/csv');
}

// ============================================================
// Markdown (clipboard with download fallback)
// ============================================================
export async function exportMarkdown(session, onResult) {
  const board = computeLeaderboard(session.players);
  const lines = [];
  lines.push(`# ${session.name || 'Pickleball Session'}`);
  lines.push('');
  lines.push(`**Date:** ${session.date}  `);
  lines.push(
    `**Players:** ${session.players.length} (${session.players.filter((p) => p.gamesPlayed > 0).length} played)  `
  );
  lines.push(`**Games:** ${session.history.length}  `);
  const totalMs = session.history.reduce((s, h) => s + (h.durationMs || 0), 0);
  lines.push(`**Total Play Time:** ${formatDuration(totalMs)}`);
  lines.push('');
  lines.push('## Leaderboard');
  lines.push('');
  lines.push('| # | Name | W | L | GP | Win% | Best Streak |');
  lines.push('|---|------|---|---|----|------|-------------|');
  board.forEach((p, i) => {
    const rate = p.games > 0 ? (p.winRate * 100).toFixed(0) + '%' : '—';
    lines.push(`| ${i + 1} | ${p.name} | ${p.wins} | ${p.losses} | ${p.games} | ${rate} | ${p.bestStreak} |`);
  });
  if (session.history.length > 0) {
    lines.push('');
    lines.push('## Game Log');
    lines.push('');
    [...session.history].reverse().forEach((h, i) => {
      const t = new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dur = h.durationMs != null ? ` (${formatDuration(h.durationMs)})` : '';
      lines.push(`${i + 1}. **Court ${h.court}**${dur} — ${h.winners.join(' & ')} def. ${h.losers.join(' & ')} _(${t})_`);
    });
  }
  const md = lines.join('\n');
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(md);
      onResult?.('Markdown copied to clipboard');
      return;
    } catch {}
  }
  downloadFile(`pickleball_${safeFilenamePart(session)}.md`, md, 'text/markdown');
  onResult?.('Markdown downloaded (clipboard unavailable)');
}

// ============================================================
// JSON
// ============================================================
export function exportJson(session) {
  const data = {
    sessionName: session.name,
    sessionDate: session.date,
    endedAt: session.endedAt || null,
    exportedAt: new Date().toISOString(),
    summary: {
      totalPlayers: session.players.length,
      playedAtLeastOnce: session.players.filter((p) => p.gamesPlayed > 0).length,
      totalGames: session.history.length,
      totalPlayTimeMs: session.history.reduce((s, h) => s + (h.durationMs || 0), 0),
    },
    leaderboard: computeLeaderboard(session.players).map((p, i) => ({ rank: i + 1, ...p })),
    games: [...session.history].reverse().map((h, i) => ({
      index: i + 1,
      court: h.court,
      source: h.source,
      time: new Date(h.time).toISOString(),
      durationMs: h.durationMs,
      winners: h.winners,
      losers: h.losers,
    })),
  };
  downloadFile(`pickleball_${safeFilenamePart(session)}.json`, JSON.stringify(data, null, 2), 'application/json');
}

// ============================================================
// PDF (formatted HTML → print dialog → Save as PDF)
// ============================================================
export function exportPdf(session) {
  const board = computeLeaderboard(session.players);
  const totalMs = session.history.reduce((s, h) => s + (h.durationMs || 0), 0);
  const playedCount = session.players.filter((p) => p.gamesPlayed > 0).length;

  const boardRows = board
    .map((p, i) => {
      const rate = p.games > 0 ? (p.winRate * 100).toFixed(0) + '%' : '—';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `<tr>
        <td>${medal}</td>
        <td>${esc(p.name)}</td>
        <td class="num">${p.wins}</td>
        <td class="num">${p.losses}</td>
        <td class="num">${p.games}</td>
        <td class="num">${rate}</td>
        <td class="num">${p.bestStreak}</td>
      </tr>`;
    })
    .join('');

  const gameRows = [...session.history]
    .reverse()
    .map((h, i) => {
      const t = new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dur = h.durationMs != null ? ` <span class="dur">${formatDuration(h.durationMs)}</span>` : '';
      return `<tr>
        <td class="num">${i + 1}</td>
        <td>Court ${h.court}</td>
        <td class="win">${esc(h.winners.join(' & '))}</td>
        <td class="loss">${esc(h.losers.join(' & '))}</td>
        <td>${t}${dur}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(session.name || 'Pickleball Session')}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #18181b; padding: 32px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; color: #15803d; }
    .meta { color: #71717a; font-size: 0.85rem; margin-bottom: 24px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat { background: #f0fdf4; border-radius: 8px; padding: 10px 14px; border: 1px solid #bbf7d0; }
    .stat-label { font-size: 0.65rem; text-transform: uppercase; color: #71717a; letter-spacing: 0.05em; font-weight: 600; }
    .stat-value { font-size: 1.4rem; font-weight: 700; color: #15803d; }
    h2 { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 20px 0 8px; color: #18181b; }
    table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
    th { font-size: 0.68rem; text-transform: uppercase; color: #71717a; letter-spacing: 0.05em; border-bottom: 2px solid #e4e4e7; padding: 5px 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #f4f4f5; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .win { color: #15803d; font-weight: 500; }
    .loss { color: #71717a; }
    .dur { background: #f4f4f5; color: #52525b; padding: 1px 5px; border-radius: 3px; font-size: 0.75em; margin-left: 4px; }
    tr:nth-child(even) td { background: #fafafa; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>${esc(session.name || 'Pickleball Session')}</h1>
  <div class="meta">${session.date}${session.endedAt ? ' · ended ' + new Date(session.endedAt).toLocaleString() : ''}</div>
  <div class="stats">
    <div class="stat"><div class="stat-label">Players</div><div class="stat-value">${session.players.length}</div></div>
    <div class="stat"><div class="stat-label">Played</div><div class="stat-value">${playedCount}</div></div>
    <div class="stat"><div class="stat-label">Games</div><div class="stat-value">${session.history.length}</div></div>
    <div class="stat"><div class="stat-label">Play Time</div><div class="stat-value">${formatDuration(totalMs)}</div></div>
  </div>
  <h2>Leaderboard</h2>
  <table>
    <thead><tr><th>#</th><th>Name</th><th class="num">W</th><th class="num">L</th><th class="num">GP</th><th class="num">Win%</th><th class="num">Streak</th></tr></thead>
    <tbody>${boardRows}</tbody>
  </table>
  ${session.history.length > 0 ? `
  <h2>Game Log</h2>
  <table>
    <thead><tr><th class="num">#</th><th>Court</th><th>Winners</th><th>Losers</th><th>Time</th></tr></thead>
    <tbody>${gameRows}</tbody>
  </table>` : ''}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', () => {
      setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 200);
    });
  } else {
    // Fallback: download the HTML file
    downloadFile(`pickleball_${safeFilenamePart(session)}.html`, html, 'text/html');
    URL.revokeObjectURL(url);
  }
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// "Live" session helper — translate live state into the shape exports want
// ============================================================
export function liveStateAsSession(state) {
  return {
    name: state.sessionName,
    date: state.sessionDate,
    endedAt: null,
    players: state.players,
    history: state.history,
  };
}

export function archivedAsSession(archived) {
  return {
    name: archived.name,
    date: archived.date,
    endedAt: archived.endedAt,
    players: archived.players,
    history: archived.history,
  };
}
