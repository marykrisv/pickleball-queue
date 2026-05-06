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
