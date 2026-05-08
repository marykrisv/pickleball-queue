import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
// PDF — jsPDF generates a real .pdf file and downloads it directly.
// Works in browser and Tauri WebView (no print dialog needed).
// ============================================================
export function exportPdf(session, onResult) {
  try {
    const board = computeLeaderboard(session.players);
    const totalMs = session.history.reduce((s, h) => s + (h.durationMs || 0), 0);
    const playedCount = session.players.filter((p) => p.gamesPlayed > 0).length;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const margin = 40;
    const pageW = doc.internal.pageSize.getWidth();
    let y = margin;

    const green = [21, 128, 61];
    const gray  = [113, 113, 122];
    const dark  = [24, 24, 27];

    // Title
    doc.setFontSize(18);
    doc.setTextColor(green[0], green[1], green[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(session.name || 'Pickleball Session', margin, y);
    y += 20;

    // Subtitle
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(gray[0], gray[1], gray[2]);
    const subtitle = session.date + (session.endedAt ? '  ended ' + new Date(session.endedAt).toLocaleDateString() : '');
    doc.text(subtitle, margin, y);
    y += 22;

    // Stat boxes
    const statW = (pageW - margin * 2 - 9) / 4;
    const stats = [
      { label: 'Players',   value: String(session.players.length) },
      { label: 'Played',    value: String(playedCount) },
      { label: 'Games',     value: String(session.history.length) },
      { label: 'Play Time', value: formatDuration(totalMs) },
    ];
    stats.forEach((s, i) => {
      const x = margin + i * (statW + 3);
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(x, y, statW, 36, 4, 4, 'FD');
      doc.setFontSize(7);
      doc.setTextColor(gray[0], gray[1], gray[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(s.label.toUpperCase(), x + 8, y + 12);
      doc.setFontSize(14);
      doc.setTextColor(green[0], green[1], green[2]);
      doc.text(s.value, x + 8, y + 28);
    });
    y += 50;

    // Leaderboard table
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text('LEADERBOARD', margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Name', 'W', 'L', 'GP', 'Win%', 'Streak']],
      body: board.map((p, i) => {
        const rate = p.games > 0 ? (p.winRate * 100).toFixed(0) + '%' : '-';
        return [String(i + 1), p.name, p.wins, p.losses, p.games, rate, p.bestStreak];
      }),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [240, 253, 244], textColor: gray, fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 28 },
        2: { halign: 'right' }, 3: { halign: 'right' },
        4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });

    // Game log table
    if (session.history.length > 0) {
      y = doc.lastAutoTable.finalY + 16;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(dark[0], dark[1], dark[2]);
      doc.text('GAME LOG', margin, y);
      y += 6;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['#', 'Court', 'Winners', 'Losers', 'Time', 'Duration']],
        body: [...session.history].reverse().map((h, i) => {
          const t = new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dur = h.durationMs != null ? formatDuration(h.durationMs) : '-';
          return [i + 1, 'Court ' + h.court, h.winners.join(' & '), h.losers.join(' & '), t, dur];
        }),
        styles: { fontSize: 8.5, cellPadding: 3.5 },
        headStyles: { fillColor: [240, 253, 244], textColor: gray, fontStyle: 'bold', fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 24, halign: 'right' },
          1: { cellWidth: 46 },
          4: { cellWidth: 42 },
          5: { cellWidth: 52, halign: 'right' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 2) {
            data.cell.styles.textColor = green;
            data.cell.styles.fontStyle = 'bold';
          }
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
      });
    }

    doc.save(`pickleball_${safeFilenamePart(session)}.pdf`);
    onResult?.('PDF downloaded');
  } catch (err) {
    console.error('exportPdf error:', err);
    onResult?.('PDF export failed: ' + err.message);
  }
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
