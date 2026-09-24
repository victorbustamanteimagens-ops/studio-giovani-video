// Studio Giovani — Vídeo & Foto
// Overlay desenhado em canvas transparente sobre o <video> ou a <img> da
// prévia. No export de vídeo, o overlay vira PNG estático e vai pro servidor
// (Railway), que queima um em cima do outro com ffmpeg nativo. No export de
// foto não precisa de servidor: montamos tudo (foto + overlay) num canvas
// escondido e baixamos o JPG direto no navegador.
"use strict";

var NAVY = '#0B2A4A';
var CREAM = '#F4F0E6';
var RED = '#DC1C2E';
var GOLD = '#C9A24D';
var GOLD_LIGHT = '#E7C583';
var BLUE_ROW = 'rgba(11,42,74,0.92)'; // caixa azul sólida dos dados

var PIN_PATH = new Path2D('M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z');
var PIN_HOLE = { cx: 12, cy: 10, r: 3 };
var BED_PATH = new Path2D('M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18v2M21 18v2M3 12V9a2 2 0 0 1 2-2h4v5');
var CAR_PATH = new Path2D('M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM5 17V9l2-4h10l2 4v8');
var AREA_PATH = new Path2D('M4 14h16v6H4zM4 14l3-6h10l3 6');
var STAR_PATH = new Path2D('M12 2.5L14.1 9.6L21.5 12L14.1 14.4L12 21.5L9.9 14.4L2.5 12L9.9 9.6Z');

var remaxIcon = new Image();
var remaxIconReady = false;
remaxIcon.onload = function(){ remaxIconReady = true; render(); };
remaxIcon.src = './remax-pin.png';

var canvas = document.getElementById('cv');
var ctx = canvas.getContext('2d');
var videoEl = document.getElementById('previewVideo');
var photoEl = document.getElementById('previewPhoto');
var stageEl = document.getElementById('stage');
var emptyMsg = document.getElementById('emptyMsg');
var exportBtn = document.getElementById('exportBtn');
var stageCaption = document.getElementById('stageCaption');
var exportHint = document.getElementById('exportHint');
var pageTitle = document.getElementById('pageTitle');

function el(id){ return document.getElementById(id); }

// refs usadas pelo status/progresso — precisam existir antes do boot(),
// que já chama applyMode()/setStatus() durante a inicialização.
var statusEl = el('statusMsg');
var progressWrap = el('progressWrap');
var progressBar = el('progressBar');
var progressLabel = el('progressLabel');

function setStatus(text, stateAttr){
  statusEl.dataset.state = stateAttr || '';
  statusEl.textContent = text;
}
function setProgress(pct){
  progressWrap.classList.toggle('show', pct != null);
  if (pct != null){
    var shown = Math.max(0, Math.min(100, Math.round(pct*100)));
    progressBar.style.width = shown + '%';
    progressLabel.textContent = shown + '%';
    progressLabel.hidden = false;
  } else {
    progressLabel.hidden = true;
  }
}

function readState(){
  return {
    variant: document.querySelector('#variantSeg button[aria-pressed="true"]').getAttribute('data-variant'),
    localizacao: { on: el('tg_localizacao').checked, value: el('localizacao').value.trim() },
    tipo:        { on: el('tg_tipo').checked, value: el('tipo').value.trim() },
    status:      { on: el('tg_status').checked, value: el('status').value.trim() },
    valor:       { on: el('tg_valor').checked, value: el('valor').value.trim() },
    area:        { on: el('tg_area').checked, value: el('area').value.trim() },
    quartos:     { on: el('tg_quartos').checked, value: el('quartos').value.trim() },
    vagas:       { on: el('tg_vagas').checked, value: el('vagas').value.trim() },
    destaque:    { on: el('tg_destaque').checked, value: el('destaque').value.trim() }
  };
}

function variantColorsFor(st){
  return st.variant === 'gold' ? { bg: GOLD, text: NAVY } : { bg: RED, text: CREAM };
}

function amenityRows(st){
  var rows = [];
  if (st.localizacao.on && st.localizacao.value) rows.push({ icon: 'pin', label: st.localizacao.value });
  if (st.area.on && st.area.value) rows.push({ icon: 'area', label: st.area.value });
  if (st.quartos.on && st.quartos.value) rows.push({ icon: 'bed', label: st.quartos.value });
  if (st.vagas.on && st.vagas.value) rows.push({ icon: 'car', label: st.vagas.value });
  if (st.destaque.on && st.destaque.value) rows.push({ icon: 'star', label: st.destaque.value });
  return rows;
}

function roundRectPath(ctx, x, y, w, h, r){
  if (ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  var rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

function trySetLetterSpacing(ctx, px){ try { ctx.letterSpacing = px + 'px'; } catch(e){} }

// separa "Bairro, Cidade" em { bairro, cidade } — usado pelo estilo Editorial
// pra montar título (bairro) + subtítulo (cidade · tipo)
function splitLocalizacaoValue(value){
  var idx = value.indexOf(',');
  if (idx === -1) return { bairro: value.trim(), cidade: '' };
  return { bairro: value.slice(0, idx).trim(), cidade: value.slice(idx + 1).trim() };
}

function drawGlowIcon(ctx, path, x, y, size, opts){
  opts = opts || {};
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size/24, size/24);
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 7;
  ctx.strokeStyle = opts.color || CREAM;
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  if (opts.hole){
    ctx.beginPath();
    ctx.arc(opts.hole.cx, opts.hole.cy, opts.hole.r, 0, Math.PI*2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFillIconGlow(ctx, path, x, y, size, color){
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size/24, size/24);
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 7;
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.restore();
}

// caixa sólida (vermelha ou azul) com texto — devolve a altura usada
function drawSolidBox(ctx, x, y, text, opts){
  opts = opts || {};
  var fontSize = opts.fontSize || 40;
  var weight = opts.weight || '700';
  var family = opts.family || 'Work Sans';
  var padX = opts.padX != null ? opts.padX : 26;
  var padY = opts.padY != null ? opts.padY : 16;
  var maxW = opts.maxW || 900;
  ctx.font = weight + ' ' + fontSize + 'px "' + family + '"';
  if (opts.letterSpacing) trySetLetterSpacing(ctx, opts.letterSpacing);
  var textW = Math.min(ctx.measureText(text).width, maxW);
  var boxW = textW + padX*2;
  var boxH = fontSize + padY*2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = opts.bg;
  roundRectPath(ctx, x, y, boxW, boxH, opts.radius != null ? opts.radius : 4);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = opts.textColor || CREAM;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x + padX, y + boxH/2 + fontSize*0.34);
  if (opts.letterSpacing) trySetLetterSpacing(ctx, 0);
  return boxH;
}

// pill contornada (sem preenchimento sólido) — usada no destaque do estilo Editorial
function drawOutlineBox(ctx, x, y, text, opts){
  opts = opts || {};
  var fontSize = opts.fontSize || 20;
  var weight = opts.weight || '700';
  var family = opts.family || 'Work Sans';
  var padX = opts.padX != null ? opts.padX : 18;
  var padY = opts.padY != null ? opts.padY : 10;
  var maxW = opts.maxW || 900;
  ctx.font = weight + ' ' + fontSize + 'px "' + family + '"';
  if (opts.letterSpacing) trySetLetterSpacing(ctx, opts.letterSpacing);
  var textW = Math.min(ctx.measureText(text).width, maxW);
  var boxW = textW + padX*2;
  var boxH = fontSize + padY*2;
  var radius = opts.radius != null ? opts.radius : boxH/2;
  var lw = opts.borderWidth || 1.5;
  ctx.save();
  ctx.fillStyle = opts.fill || 'rgba(9,16,26,0.3)';
  roundRectPath(ctx, x, y, boxW, boxH, radius);
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = opts.borderColor || GOLD;
  roundRectPath(ctx, x + lw/2, y + lw/2, boxW - lw, boxH - lw, Math.max(0, radius - lw/2));
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = opts.textColor || GOLD_LIGHT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x + padX, y + boxH/2 + fontSize*0.34);
  if (opts.letterSpacing) trySetLetterSpacing(ctx, 0);
  return boxH;
}

// pill escura com ícone + texto juntos (usada na fileira quartos/vagas/área do
// estilo Editorial) — devolve a largura usada, pra empilhar pills lado a lado
function drawIconPill(ctx, x, y, icon, label, opts){
  opts = opts || {};
  var fontSize = opts.fontSize || 22;
  var iconSize = opts.iconSize || 22;
  var padX = opts.padX != null ? opts.padX : 16;
  var padY = opts.padY != null ? opts.padY : 11;
  var gap = opts.gap != null ? opts.gap : 10;
  ctx.font = '700 ' + fontSize + 'px "Work Sans"';
  var textW = ctx.measureText(label).width;
  var boxH = Math.max(iconSize, fontSize) + padY*2;
  var boxW = padX + iconSize + gap + textW + padX;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = opts.bg || BLUE_ROW;
  roundRectPath(ctx, x, y, boxW, boxH, opts.radius != null ? opts.radius : 8);
  ctx.fill();
  ctx.restore();

  var iconX = x + padX;
  var iconY = y + boxH/2 - iconSize/2;
  if (icon === 'bed'){
    drawGlowIcon(ctx, BED_PATH, iconX, iconY, iconSize, {});
  } else if (icon === 'car'){
    drawGlowIcon(ctx, CAR_PATH, iconX, iconY, iconSize, {});
  } else if (icon === 'area'){
    drawGlowIcon(ctx, AREA_PATH, iconX, iconY, iconSize, {});
  }
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, iconX + iconSize + gap, y + boxH/2 + fontSize*0.34);
  return boxW;
}

// --- layout 9:16 (Reels/Stories) — o mesmo padrão usado no vídeo ---
function renderOverlayTall(ctx, W, H, st, variantColors){
  var badgeSize = 92;
  var badgeX = W - 56 - badgeSize;
  var badgeY = 56;
  if (remaxIconReady){
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 3;
    var iconH = badgeSize;
    var iconW = iconH * (remaxIcon.width / remaxIcon.height);
    ctx.drawImage(remaxIcon, badgeX + badgeSize - iconW, badgeY, iconW, iconH);
    ctx.restore();
  }

  var topX = 64, topY = 150;
  var cursor = topY;
  if (st.status.on && st.status.value){
    cursor += drawSolidBox(ctx, topX, cursor, st.status.value.toUpperCase(), {
      fontSize: 54, weight: '800', family: 'Fraunces',
      bg: variantColors.bg, textColor: variantColors.text,
      letterSpacing: 1.5, padX: 30, padY: 18, radius: 4, maxW: W - topX - 60
    });
    cursor += 14;
  }
  if (st.valor.on && st.valor.value){
    drawSolidBox(ctx, topX, cursor, st.valor.value, {
      fontSize: 40, weight: '700', family: 'Fraunces',
      bg: variantColors.bg, textColor: variantColors.text,
      padX: 26, padY: 15, radius: 4, maxW: W - topX - 60
    });
  }

  var rows = amenityRows(st);
  var listX = 64;
  var listY = 1230;
  var iconSize = 38;
  var rowGap = 26;
  var labelFontSize = 30;
  var labelPadX = 18, labelPadY = 12;

  ctx.font = '700 ' + labelFontSize + 'px "Work Sans"';
  var rowY = listY;
  for (var i = 0; i < rows.length; i++){
    var row = rows[i];
    var textW = ctx.measureText(row.label).width;
    var boxH = labelFontSize + labelPadY*2;
    var rowH = Math.max(iconSize, boxH);
    var iconCy = rowY + rowH/2;

    if (row.icon === 'pin'){
      drawGlowIcon(ctx, PIN_PATH, listX, iconCy - iconSize/2, iconSize, { hole: PIN_HOLE });
    } else if (row.icon === 'area'){
      drawGlowIcon(ctx, AREA_PATH, listX, iconCy - iconSize/2, iconSize, {});
    } else if (row.icon === 'bed'){
      drawGlowIcon(ctx, BED_PATH, listX, iconCy - iconSize/2, iconSize, {});
    } else if (row.icon === 'car'){
      drawGlowIcon(ctx, CAR_PATH, listX, iconCy - iconSize/2, iconSize, {});
    } else if (row.icon === 'star'){
      drawFillIconGlow(ctx, STAR_PATH, listX, iconCy - iconSize/2, iconSize, GOLD_LIGHT);
    }

    var labelX = listX + iconSize + 20;
    var labelY = rowY + rowH/2 - boxH/2;
    ctx.fillStyle = BLUE_ROW;
    roundRectPath(ctx, labelX, labelY, textW + labelPadX*2, boxH, 4);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.textAlign = 'left';
    ctx.fillText(row.label, labelX + labelPadX, labelY + boxH/2 + labelFontSize*0.34);

    rowY += rowH + rowGap;
  }

  var footerY = H - 70;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = CREAM;
  ctx.font = '600 34px "Fraunces"';
  ctx.textAlign = 'left';
  ctx.fillText('Giovani Oliveira', 64, footerY);
  ctx.font = '400 22px "Work Sans"';
  trySetLetterSpacing(ctx, 1.5);
  ctx.fillStyle = 'rgba(244,240,230,0.85)';
  ctx.fillText('RE/MAX AXXIA IMÓVEIS · CRECI 110.031', 64, footerY + 34);
  trySetLetterSpacing(ctx, 0);
  ctx.restore();
}

// --- layout 1:1 (feed) — mesma arte, agrupada num bloco só perto do rodapé
// com um degradê atrás pra ficar legível em qualquer foto ---
function renderOverlaySquare(ctx, W, H, st, variantColors){
  var scrimTop = Math.round(H * 0.50);
  var grad = ctx.createLinearGradient(0, scrimTop, 0, H);
  grad.addColorStop(0, 'rgba(9,16,26,0)');
  grad.addColorStop(1, 'rgba(9,16,26,0.86)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, scrimTop, W, H - scrimTop);

  var badgeSize = 76;
  var badgeX = W - 40 - badgeSize;
  var badgeY = 40;
  if (remaxIconReady){
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
    var iconH = badgeSize;
    var iconW = iconH * (remaxIcon.width / remaxIcon.height);
    ctx.drawImage(remaxIcon, badgeX + badgeSize - iconW, badgeY, iconW, iconH);
    ctx.restore();
  }

  var x = 48;
  var cursor = Math.round(H * 0.595);
  if (st.status.on && st.status.value){
    cursor += drawSolidBox(ctx, x, cursor, st.status.value.toUpperCase(), {
      fontSize: 36, weight: '800', family: 'Fraunces',
      bg: variantColors.bg, textColor: variantColors.text,
      letterSpacing: 1.2, padX: 22, padY: 13, radius: 4, maxW: W - x - 100
    });
    cursor += 10;
  }
  if (st.valor.on && st.valor.value){
    cursor += drawSolidBox(ctx, x, cursor, st.valor.value, {
      fontSize: 28, weight: '700', family: 'Fraunces',
      bg: variantColors.bg, textColor: variantColors.text,
      padX: 20, padY: 11, radius: 4, maxW: W - x - 100
    });
    cursor += 18;
  } else {
    cursor += 8;
  }

  var rows = amenityRows(st);
  var iconSize = 26, rowGap = 12, labelFontSize = 21, labelPadX = 14, labelPadY = 8;
  ctx.font = '700 ' + labelFontSize + 'px "Work Sans"';
  var rowY = cursor;
  for (var i = 0; i < rows.length; i++){
    var row = rows[i];
    var textW = ctx.measureText(row.label).width;
    var boxH = labelFontSize + labelPadY*2;
    var rowH = Math.max(iconSize, boxH);
    var iconCy = rowY + rowH/2;

    if (row.icon === 'pin'){
      drawGlowIcon(ctx, PIN_PATH, x, iconCy - iconSize/2, iconSize, { hole: PIN_HOLE });
    } else if (row.icon === 'area'){
      drawGlowIcon(ctx, AREA_PATH, x, iconCy - iconSize/2, iconSize, {});
    } else if (row.icon === 'bed'){
      drawGlowIcon(ctx, BED_PATH, x, iconCy - iconSize/2, iconSize, {});
    } else if (row.icon === 'car'){
      drawGlowIcon(ctx, CAR_PATH, x, iconCy - iconSize/2, iconSize, {});
    } else if (row.icon === 'star'){
      drawFillIconGlow(ctx, STAR_PATH, x, iconCy - iconSize/2, iconSize, GOLD_LIGHT);
    }

    var labelX = x + iconSize + 16;
    var labelY = rowY + rowH/2 - boxH/2;
    ctx.fillStyle = BLUE_ROW;
    roundRectPath(ctx, labelX, labelY, textW + labelPadX*2, boxH, 4);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.textAlign = 'left';
    ctx.fillText(row.label, labelX + labelPadX, labelY + boxH/2 + labelFontSize*0.34);

    rowY += rowH + rowGap;
  }

  var footerY = H - 34;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = CREAM;
  ctx.font = '600 26px "Fraunces"';
  ctx.textAlign = 'left';
  ctx.fillText('Giovani Oliveira', x, footerY);
  ctx.font = '400 17px "Work Sans"';
  trySetLetterSpacing(ctx, 1.2);
  ctx.fillStyle = 'rgba(244,240,230,0.85)';
  ctx.fillText('RE/MAX AXXIA IMÓVEIS · CRECI 110.031', x, footerY + 22);
  trySetLetterSpacing(ctx, 0);
  ctx.restore();
}

// --- estilo Editorial — 1:1 (feed) ---
// bloco único perto do rodapé: marca, título (bairro) + subtítulo (cidade ·
// tipo), destaque em pill contornada, fileira de pills quartos/vagas/área,
// divisor, e preço + rodapé (nome/CRECI) na mesma linha.
function renderEditorialSquare(ctx, W, H, st, variantColors){
  var pad = 46, rightPad = 46;

  var badgeSize = 78;
  var badgeX = pad, badgeY = 42;
  if (remaxIconReady){
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
    var iconH = badgeSize;
    var iconW = iconH * (remaxIcon.width / remaxIcon.height);
    ctx.drawImage(remaxIcon, badgeX, badgeY, iconW, iconH);
    ctx.restore();
  }

  var scrimTop = Math.round(H * 0.42);
  var grad = ctx.createLinearGradient(0, scrimTop, 0, H);
  grad.addColorStop(0, 'rgba(9,16,26,0)');
  grad.addColorStop(0.45, 'rgba(9,16,26,0.55)');
  grad.addColorStop(1, 'rgba(9,16,26,0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, scrimTop, W, H - scrimTop);

  var cx = pad;
  var cursor = Math.round(H * 0.472);

  cursor += drawSolidBox(ctx, cx, cursor, 'RE/MAX AXXIA IMÓVEIS', {
    fontSize: 19, weight: '800', family: 'Work Sans',
    bg: variantColors.bg, textColor: variantColors.text,
    letterSpacing: 1, padX: 16, padY: 9, radius: 5, maxW: W - cx - rightPad
  });
  cursor += 18;

  var loc = splitLocalizacaoValue(st.localizacao.on ? st.localizacao.value : '');
  var titleText = loc.bairro || 'Imóvel';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = CREAM;
  ctx.font = '700 60px "Fraunces"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  var titleBaseline = cursor + 52;
  ctx.fillText(titleText, cx, titleBaseline);
  ctx.restore();
  cursor = titleBaseline + 6;

  var subtitleParts = [];
  if (loc.cidade) subtitleParts.push(loc.cidade);
  if (st.tipo.on && st.tipo.value) subtitleParts.push(st.tipo.value);
  var subtitleText = subtitleParts.join(' · ');
  if (subtitleText){
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = 'rgba(244,240,230,0.78)';
    ctx.font = '500 24px "Work Sans"';
    var subBaseline = cursor + 24;
    ctx.fillText(subtitleText, cx, subBaseline);
    ctx.restore();
    cursor = subBaseline + 20;
  } else {
    cursor += 8;
  }

  if (st.destaque.on && st.destaque.value){
    cursor += drawOutlineBox(ctx, cx, cursor, '+ ' + st.destaque.value.toUpperCase(), {
      fontSize: 18, weight: '700', family: 'Work Sans', letterSpacing: 0.6,
      borderColor: GOLD, textColor: GOLD_LIGHT, fill: 'rgba(9,16,26,0.3)',
      padX: 16, padY: 9, radius: 22, maxW: W - cx - rightPad
    });
    cursor += 22;
  }

  var items = [];
  if (st.quartos.on && st.quartos.value) items.push({ icon: 'bed', label: st.quartos.value });
  if (st.vagas.on && st.vagas.value) items.push({ icon: 'car', label: st.vagas.value });
  if (st.area.on && st.area.value) items.push({ icon: 'area', label: st.area.value });
  if (items.length){
    var rowX = cx, rowY = cursor, rowH = 0, gapPill = 12;
    var pillOpts = { fontSize: 22, iconSize: 22, padX: 16, padY: 11, gap: 10, radius: 8 };
    for (var i = 0; i < items.length; i++){
      ctx.font = '700 ' + pillOpts.fontSize + 'px "Work Sans"';
      var textW = ctx.measureText(items[i].label).width;
      var boxW = pillOpts.padX + pillOpts.iconSize + pillOpts.gap + textW + pillOpts.padX;
      if (rowX + boxW > W - rightPad && rowX > cx){
        rowX = cx;
        rowY += rowH + 10;
        rowH = 0;
      }
      var usedW = drawIconPill(ctx, rowX, rowY, items[i].icon, items[i].label, pillOpts);
      var boxH = Math.max(pillOpts.iconSize, pillOpts.fontSize) + pillOpts.padY * 2;
      rowH = Math.max(rowH, boxH);
      rowX += usedW + gapPill;
    }
    cursor = rowY + rowH + 32;
  } else {
    cursor += 6;
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(244,240,230,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cursor);
  ctx.lineTo(W - rightPad, cursor);
  ctx.stroke();
  ctx.restore();
  cursor += 24;

  var priceH = 0;
  if (st.valor.on && st.valor.value){
    priceH = drawSolidBox(ctx, cx, cursor, st.valor.value, {
      fontSize: 30, weight: '700', family: 'Fraunces',
      bg: variantColors.bg, textColor: variantColors.text,
      padX: 22, padY: 14, radius: 6, maxW: 460
    });
  }
  var footerCenterY = priceH ? cursor + priceH / 2 : cursor + 14;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 1;
  ctx.textAlign = 'right';
  ctx.fillStyle = CREAM;
  ctx.font = '600 22px "Fraunces"';
  ctx.fillText('Giovani Oliveira', W - rightPad, footerCenterY - 6);
  ctx.font = '400 15px "Work Sans"';
  ctx.fillStyle = 'rgba(244,240,230,0.8)';
  ctx.fillText('CRECI 110.031 · 23 anos de mercado', W - rightPad, footerCenterY + 16);
  ctx.restore();
}

// --- estilo Editorial — 9:16 (Reels/Stories) — mesma composição, reescalada ---
function renderEditorialTall(ctx, W, H, st, variantColors){
  var pad = 56, rightPad = 56;

  var badgeSize = 100;
  var badgeX = pad, badgeY = 58;
  if (remaxIconReady){
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 3;
    var iconH = badgeSize;
    var iconW = iconH * (remaxIcon.width / remaxIcon.height);
    ctx.drawImage(remaxIcon, badgeX, badgeY, iconW, iconH);
    ctx.restore();
  }

  var scrimTop = Math.round(H * 0.56);
  var grad = ctx.createLinearGradient(0, scrimTop, 0, H);
  grad.addColorStop(0, 'rgba(9,16,26,0)');
  grad.addColorStop(0.45, 'rgba(9,16,26,0.55)');
  grad.addColorStop(1, 'rgba(9,16,26,0.93)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, scrimTop, W, H - scrimTop);

  var cx = pad;
  var cursor = Math.round(H * 0.615);

  cursor += drawSolidBox(ctx, cx, cursor, 'RE/MAX AXXIA IMÓVEIS', {
    fontSize: 25, weight: '800', family: 'Work Sans',
    bg: variantColors.bg, textColor: variantColors.text,
    letterSpacing: 1.3, padX: 20, padY: 12, radius: 6, maxW: W - cx - rightPad
  });
  cursor += 24;

  var loc = splitLocalizacaoValue(st.localizacao.on ? st.localizacao.value : '');
  var titleText = loc.bairro || 'Imóvel';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = CREAM;
  ctx.font = '700 82px "Fraunces"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  var titleBaseline = cursor + 70;
  ctx.fillText(titleText, cx, titleBaseline);
  ctx.restore();
  cursor = titleBaseline + 10;

  var subtitleParts = [];
  if (loc.cidade) subtitleParts.push(loc.cidade);
  if (st.tipo.on && st.tipo.value) subtitleParts.push(st.tipo.value);
  var subtitleText = subtitleParts.join(' · ');
  if (subtitleText){
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = 'rgba(244,240,230,0.78)';
    ctx.font = '500 32px "Work Sans"';
    var subBaseline = cursor + 30;
    ctx.fillText(subtitleText, cx, subBaseline);
    ctx.restore();
    cursor = subBaseline + 26;
  } else {
    cursor += 10;
  }

  if (st.destaque.on && st.destaque.value){
    cursor += drawOutlineBox(ctx, cx, cursor, '+ ' + st.destaque.value.toUpperCase(), {
      fontSize: 23, weight: '700', family: 'Work Sans', letterSpacing: 0.8,
      borderColor: GOLD, textColor: GOLD_LIGHT, fill: 'rgba(9,16,26,0.3)',
      padX: 20, padY: 12, radius: 26, maxW: W - cx - rightPad
    });
    cursor += 28;
  }

  var items = [];
  if (st.quartos.on && st.quartos.value) items.push({ icon: 'bed', label: st.quartos.value });
  if (st.vagas.on && st.vagas.value) items.push({ icon: 'car', label: st.vagas.value });
  if (st.area.on && st.area.value) items.push({ icon: 'area', label: st.area.value });
  if (items.length){
    var rowX = cx, rowY = cursor, rowH = 0, gapPill = 16;
    var pillOpts = { fontSize: 28, iconSize: 28, padX: 20, padY: 14, gap: 12, radius: 10 };
    for (var i = 0; i < items.length; i++){
      ctx.font = '700 ' + pillOpts.fontSize + 'px "Work Sans"';
      var textW = ctx.measureText(items[i].label).width;
      var boxW = pillOpts.padX + pillOpts.iconSize + pillOpts.gap + textW + pillOpts.padX;
      if (rowX + boxW > W - rightPad && rowX > cx){
        rowX = cx;
        rowY += rowH + 14;
        rowH = 0;
      }
      var usedW = drawIconPill(ctx, rowX, rowY, items[i].icon, items[i].label, pillOpts);
      var boxH = Math.max(pillOpts.iconSize, pillOpts.fontSize) + pillOpts.padY * 2;
      rowH = Math.max(rowH, boxH);
      rowX += usedW + gapPill;
    }
    cursor = rowY + rowH + 44;
  } else {
    cursor += 10;
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(244,240,230,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cursor);
  ctx.lineTo(W - rightPad, cursor);
  ctx.stroke();
  ctx.restore();
  cursor += 32;

  var priceH = 0;
  if (st.valor.on && st.valor.value){
    priceH = drawSolidBox(ctx, cx, cursor, st.valor.value, {
      fontSize: 40, weight: '700', family: 'Fraunces',
      bg: variantColors.bg, textColor: variantColors.text,
      padX: 28, padY: 18, radius: 8, maxW: 560
    });
  }
  var footerCenterY = priceH ? cursor + priceH / 2 : cursor + 18;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 1;
  ctx.textAlign = 'right';
  ctx.fillStyle = CREAM;
  ctx.font = '600 28px "Fraunces"';
  ctx.fillText('Giovani Oliveira', W - rightPad, footerCenterY - 8);
  ctx.font = '400 19px "Work Sans"';
  ctx.fillStyle = 'rgba(244,240,230,0.8)';
  ctx.fillText('CRECI 110.031 · 23 anos de mercado', W - rightPad, footerCenterY + 20);
  ctx.restore();
}

// ============================ estado geral ============================
var mode = 'video';       // 'video' | 'foto'
var fotoFormat = '9:16';  // '9:16' | '1:1'
var artStyle = 'classic'; // 'classic' | 'editorial' — só usado no modo foto

function currentW(){ return 1080; }
function currentH(){
  if (mode === 'foto' && fotoFormat === '1:1') return 1080;
  return 1920;
}

function render(){
  var st = readState();
  var variantColors = variantColorsFor(st);
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (mode === 'foto' && artStyle === 'editorial'){
    if (fotoFormat === '1:1') renderEditorialSquare(ctx, W, H, st, variantColors);
    else renderEditorialTall(ctx, W, H, st, variantColors);
  } else if (mode === 'foto' && fotoFormat === '1:1'){
    renderOverlaySquare(ctx, W, H, st, variantColors);
  } else {
    renderOverlayTall(ctx, W, H, st, variantColors);
  }
}

['localizacao','tipo','status','valor','area','quartos','vagas','destaque'].forEach(function(key){
  el(key).addEventListener('input', render);
  el('tg_' + key).addEventListener('change', function(){
    document.querySelector('[data-toggle-row="' + key + '"]').classList.toggle('off', !this.checked);
    render();
  });
});

document.querySelectorAll('#variantSeg button').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#variantSeg button').forEach(function(b){ b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    render();
  });
});

document.querySelectorAll('#styleSeg button').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#styleSeg button').forEach(function(b){ b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    artStyle = btn.getAttribute('data-style');
    render();
  });
});

function updateEmptyMsg(){
  var loaded = mode === 'foto' ? !!photoImg : !!videoFile;
  emptyMsg.style.display = loaded ? 'none' : 'flex';
}

// --- upload de vídeo ---
var videoFile = null;
var videoObjectUrl = null;
var videoLoadGen = 0; // guarda contra o evento "change" disparando mais de
                       // uma vez pro mesmo upload (acontece em alguns fluxos
                       // automatizados/móveis) — sem isso, a resposta de uma
                       // chamada antiga podia "reativar" o botão de exportar
                       // mesmo com o vídeo ainda não carregado de verdade.
// Cada aba de vídeo guarda o seu: o vídeo escolhido na aba Vídeo e o vídeo
// montado pela IA na aba Auto edit. A prévia/exportação usa sempre videoFile,
// que é o da aba ativa.
var videoTabFile = null;
var aeResultFile = null;

el('videoInput').addEventListener('change', function(e){
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  videoTabFile = file;
  el('uploadFilename').textContent = file.name;
  loadVideoIntoPreview(file);
});

function clearVideoPreview(){
  ++videoLoadGen;
  videoFile = null;
  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.load();
  if (videoObjectUrl){ URL.revokeObjectURL(videoObjectUrl); videoObjectUrl = null; }
  exportBtn.disabled = true;
  updateEmptyMsg();
}

function loadVideoIntoPreview(file){
  var myGen = ++videoLoadGen;
  videoFile = file;
  if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
  videoObjectUrl = URL.createObjectURL(file);

  exportBtn.disabled = true;
  setStatus('Carregando o vídeo…');

  var settled = false;
  function cleanup(){
    videoEl.removeEventListener('loadedmetadata', onReady);
    videoEl.removeEventListener('error', onFail);
  }
  function onReady(){
    if (settled) return;
    settled = true;
    cleanup();
    if (myGen !== videoLoadGen) return; // um upload mais novo já assumiu — ignora este resultado velho
    updateEmptyMsg();
    if (mode !== 'foto') exportBtn.disabled = false;
    setStatus('');
    videoEl.play().catch(function(){});
  }
  function onFail(){
    if (settled) return;
    settled = true;
    cleanup();
    if (myGen !== videoLoadGen) return;
    setStatus('Não consegui abrir esse vídeo. Tenta outro arquivo (MP4 costuma funcionar melhor).', 'error');
  }
  videoEl.addEventListener('loadedmetadata', onReady);
  videoEl.addEventListener('error', onFail);

  // Carregar via <video>.src às vezes não dispara o load logo após a troca
  // de arquivo (mais comum em navegadores móveis) — forçamos com .load()
  // e só liberamos o botão quando os metadados realmente chegarem.
  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.load();
  videoEl.src = videoObjectUrl;
  videoEl.load();
}

// ============================ modo foto ============================
var photoImg = null;
var photoObjectUrl = null;
var photoZoom = 1;
var photoPanXFrac = 0; // fração do W, independente do tamanho de tela
var photoPanYFrac = 0;

function photoBaseScale(W, H){
  if (!photoImg) return 1;
  return Math.max(W / photoImg.naturalWidth, H / photoImg.naturalHeight);
}

function clampPhotoPan(){
  if (!photoImg) return;
  var W = currentW(), H = currentH();
  var scale = photoBaseScale(W, H) * photoZoom;
  var drawW = photoImg.naturalWidth * scale;
  var drawH = photoImg.naturalHeight * scale;
  var maxPanXFrac = Math.max(0, (drawW - W) / 2) / W;
  var maxPanYFrac = Math.max(0, (drawH - H) / 2) / H;
  photoPanXFrac = Math.max(-maxPanXFrac, Math.min(maxPanXFrac, photoPanXFrac));
  photoPanYFrac = Math.max(-maxPanYFrac, Math.min(maxPanYFrac, photoPanYFrac));
}

function updatePhotoTransform(){
  var rect = stageEl.getBoundingClientRect();
  var cssW = rect.width || 1;
  var cssH = rect.height || 1;
  var panXpx = photoPanXFrac * cssW;
  var panYpx = photoPanYFrac * cssH;
  photoEl.style.transform = 'translate(' + panXpx + 'px,' + panYpx + 'px) scale(' + photoZoom + ')';
}

function drawPhotoOnCtx(targetCtx, W, H){
  if (!photoImg) return;
  var scale = photoBaseScale(W, H) * photoZoom;
  var drawW = photoImg.naturalWidth * scale;
  var drawH = photoImg.naturalHeight * scale;
  var x = (W - drawW) / 2 + photoPanXFrac * W;
  var y = (H - drawH) / 2 + photoPanYFrac * H;
  targetCtx.drawImage(photoImg, x, y, drawW, drawH);
}

el('fotoInput').addEventListener('change', function(e){
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  photoObjectUrl = URL.createObjectURL(file);

  exportBtn.disabled = true;
  setStatus('Carregando a foto…');

  var img = new Image();
  img.onload = function(){
    photoImg = img;
    photoEl.src = photoObjectUrl;
    el('fotoFilename').textContent = file.name;
    photoZoom = 1;
    photoPanXFrac = 0;
    photoPanYFrac = 0;
    el('fotoZoom').value = '1';
    el('fotoZoomLabel').textContent = '1.0x';
    updatePhotoTransform();
    updateEmptyMsg();
    exportBtn.disabled = false;
    resetEnhanceForNewPhoto(img, photoObjectUrl);
    setStatus('');
  };
  img.onerror = function(){
    setStatus('Não consegui abrir essa foto. Tenta outro arquivo (JPG ou PNG).', 'error');
  };
  img.src = photoObjectUrl;
});

// ---------------- Melhorar foto (IA no servidor) ----------------
// A foto vai pro nosso servidor no Railway, que chama o Gemini com a chave
// guardada lá (a chave nunca passa pelo navegador). Guardamos a original e
// a melhorada pra alternar entre as duas sem gastar outra chamada.
var ENHANCE_ENDPOINT = 'https://studio-giovani-video-server-production.up.railway.app/enhance-photo';
var photoOriginal = null;   // {img, url}
var photoEnhancedCache = null; // {img, url}
var photoShowingEnhanced = false;
var enhanceToken = 0;
var enhanceBtn = el('fotoEnhanceBtn');
var revertBtn = el('fotoRevertBtn');

function setEnhanceBtn(label, busy){
  enhanceBtn.innerHTML = '';
  if (busy){
    var s = document.createElement('span');
    s.className = 'spin';
    s.setAttribute('aria-hidden', 'true');
    enhanceBtn.appendChild(s);
  }
  enhanceBtn.appendChild(document.createTextNode(label));
}

function resetEnhanceForNewPhoto(img, url){
  enhanceToken++;
  if (photoEnhancedCache) URL.revokeObjectURL(photoEnhancedCache.url);
  photoOriginal = { img: img, url: url };
  photoEnhancedCache = null;
  photoShowingEnhanced = false;
  enhanceBtn.disabled = false;
  enhanceBtn.classList.remove('done');
  setEnhanceBtn('Melhorar foto', false);
  revertBtn.hidden = true;
}

function showPhotoVersion(v){
  photoImg = v.img;
  photoEl.src = v.url;
  clampPhotoPan();
  updatePhotoTransform();
}

// Prepara a original: JPEG, lado maior até 3072px (a IA devolve em 4K de
// qualquer jeito) — isso normaliza HEIC/PNG gigante e acelera o upload.
function originalAsJpeg(img){
  return new Promise(function(resolve, reject){
    var maxSide = 3072;
    var w = img.naturalWidth, h = img.naturalHeight;
    var k = Math.min(1, maxSide / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(function(b){ b ? resolve({ blob: b, w: c.width, h: c.height }) : reject(new Error('não consegui preparar a foto')); }, 'image/jpeg', 0.93);
  });
}

function loadImageFromBlob(blob){
  return new Promise(function(resolve, reject){
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function(){ resolve({ img: img, url: url }); };
    img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('a imagem devolvida não abriu')); };
    img.src = url;
  });
}

async function enhancePhoto(){
  if (!photoOriginal) return;
  // já temos a versão melhorada: só alterna, sem nova chamada
  if (photoEnhancedCache && !photoShowingEnhanced){
    showPhotoVersion(photoEnhancedCache);
    photoShowingEnhanced = true;
    enhanceBtn.disabled = true;
    enhanceBtn.classList.add('done');
    setEnhanceBtn('Foto melhorada', false);
    revertBtn.hidden = false;
    setStatus('Usando a foto melhorada.', 'ok');
    return;
  }
  var myToken = ++enhanceToken;
  enhanceBtn.disabled = true;
  exportBtn.disabled = true;
  setEnhanceBtn('Melhorando…', true);
  setStatus('Melhorando a foto com IA. Leva uns 20 a 40 segundos.');
  var controller = new AbortController();
  var timer = setTimeout(function(){ controller.abort(); }, 200000);
  try {
    var prepared = await originalAsJpeg(photoOriginal.img);
    var form = new FormData();
    form.append('photo', prepared.blob, 'foto.jpg');
    form.append('width', String(prepared.w));
    form.append('height', String(prepared.h));
    var res = await fetch(ENHANCE_ENDPOINT, { method: 'POST', body: form, signal: controller.signal });
    if (!res.ok){
      var msg = '';
      try { msg = (await res.json()).error || ''; } catch(e){}
      throw new Error(msg || ('servidor respondeu ' + res.status));
    }
    var blob = await res.blob();
    var loaded = await loadImageFromBlob(blob);
    if (myToken !== enhanceToken){ URL.revokeObjectURL(loaded.url); return; } // trocou de foto no meio
    photoEnhancedCache = loaded;
    showPhotoVersion(loaded);
    photoShowingEnhanced = true;
    enhanceBtn.classList.add('done');
    setEnhanceBtn('Foto melhorada', false);
    revertBtn.hidden = false;
    setStatus('Foto melhorada (' + loaded.img.naturalWidth + '×' + loaded.img.naturalHeight + '). Se não gostar, volte pra original.', 'ok');
  } catch (err) {
    if (myToken !== enhanceToken) return;
    console.error('[Studio Giovani] falha ao melhorar foto:', err);
    var detail = err && err.name === 'AbortError' ? 'demorou demais' : ((err && err.message) || 'erro desconhecido');
    enhanceBtn.disabled = false;
    setEnhanceBtn('Melhorar foto', false);
    setStatus('Não deu pra melhorar a foto (' + detail + '). A original continua valendo.', 'error');
  } finally {
    clearTimeout(timer);
    if (myToken === enhanceToken) exportBtn.disabled = !photoImg;
  }
}

enhanceBtn.addEventListener('click', enhancePhoto);
revertBtn.addEventListener('click', function(){
  if (!photoOriginal) return;
  showPhotoVersion(photoOriginal);
  photoShowingEnhanced = false;
  revertBtn.hidden = true;
  enhanceBtn.disabled = false;
  enhanceBtn.classList.remove('done');
  setEnhanceBtn(photoEnhancedCache ? 'Usar foto melhorada' : 'Melhorar foto', false);
  setStatus('Voltou pra foto original.');
});

el('fotoZoom').addEventListener('input', function(){
  photoZoom = parseFloat(this.value) || 1;
  el('fotoZoomLabel').textContent = photoZoom.toFixed(1) + 'x';
  clampPhotoPan();
  updatePhotoTransform();
});

el('fotoCenterBtn').addEventListener('click', function(){
  photoPanXFrac = 0;
  photoPanYFrac = 0;
  updatePhotoTransform();
});

// arraste na prévia pra reposicionar a foto
var dragging = false, dragStartX = 0, dragStartY = 0, dragStartPanX = 0, dragStartPanY = 0, dragCssW = 1, dragCssH = 1;
photoEl.addEventListener('pointerdown', function(e){
  if (mode !== 'foto' || !photoImg) return;
  dragging = true;
  photoEl.classList.add('dragging');
  var rect = stageEl.getBoundingClientRect();
  dragCssW = rect.width || 1;
  dragCssH = rect.height || 1;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartPanX = photoPanXFrac;
  dragStartPanY = photoPanYFrac;
  try { photoEl.setPointerCapture(e.pointerId); } catch(err){}
});
photoEl.addEventListener('pointermove', function(e){
  if (!dragging) return;
  var dx = e.clientX - dragStartX;
  var dy = e.clientY - dragStartY;
  photoPanXFrac = dragStartPanX + dx / dragCssW;
  photoPanYFrac = dragStartPanY + dy / dragCssH;
  clampPhotoPan();
  updatePhotoTransform();
});
function endDrag(){
  dragging = false;
  photoEl.classList.remove('dragging');
}
photoEl.addEventListener('pointerup', endDrag);
photoEl.addEventListener('pointercancel', endDrag);

// --- abas de formato (Story/Reels 9:16 · Feed 1:1) ---
document.querySelectorAll('#formatSeg button').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#formatSeg button').forEach(function(b){ b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    fotoFormat = btn.getAttribute('data-format');
    applyFormat();
  });
});

function applyFormat(){
  var W = currentW(), H = currentH();
  canvas.width = W;
  canvas.height = H;
  stageEl.style.aspectRatio = W + '/' + H;
  photoPanXFrac = 0;
  photoPanYFrac = 0;
  requestAnimationFrame(function(){
    updatePhotoTransform();
    render();
  });
  stageCaption.textContent = fotoFormat === '1:1'
    ? 'É assim que fica no feed do Instagram. Ajuste ao lado e a prévia atualiza sozinha.'
    : 'É assim que fica no Reels/Stories. Ajuste ao lado e a prévia atualiza sozinha.';
}

// --- abas de modo (Vídeo · Foto) ---
document.querySelectorAll('#modeSeg button').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#modeSeg button').forEach(function(b){ b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    mode = btn.getAttribute('data-mode');
    applyMode();
  });
});

// ?modo=foto / ?modo=autoedit abre direto na aba (links antigos e favoritos)
try {
  var modoParam = new URLSearchParams(location.search).get('modo');
  if (modoParam === 'foto' || modoParam === 'autoedit'){
    var startTab = document.querySelector('#modeSeg button[data-mode="' + modoParam + '"]');
    if (startTab) setTimeout(function(){ startTab.click(); }, 0);
  }
} catch (e) {}

function applyMode(){
  var isFoto = mode === 'foto';
  var isAE = mode === 'autoedit';
  el('videoUploadSection').hidden = mode !== 'video';
  el('autoeditSection').hidden = !isAE;
  el('fotoUploadSection').hidden = !isFoto;
  videoEl.style.display = isFoto ? 'none' : 'block';
  photoEl.style.display = isFoto ? 'block' : 'none';
  pageTitle.textContent = isFoto ? 'Monte seu post' : (isAE ? 'Auto edit do imóvel' : 'Monte seu vídeo');
  exportBtn.textContent = isFoto ? 'Gerar imagem final (JPG)' : 'Gerar vídeo final (MP4)';
  exportHint.textContent = isFoto
    ? 'Processamos aqui mesmo no navegador — é instantâneo.'
    : (isAE ? 'Queima a arte por cima do vídeo montado pela IA.' : 'Processamos no servidor — geralmente leva só alguns segundos.');
  emptyMsg.innerHTML = isFoto
    ? 'Escolha a foto do imóvel ao lado<br>pra ver a prévia com a arte por cima'
    : (isAE ? 'Escolha os clipes ao lado e toque em<br>“Montar vídeo com IA”. O vídeo montado<br>aparece aqui com a arte por cima.' : 'Escolha o vídeo do imóvel ao lado<br>pra ver a prévia com a arte por cima');
  setStatus('');
  setProgress(null);

  // cada aba de vídeo mostra o seu próprio vídeo na prévia
  if (!isFoto){
    var wanted = isAE ? aeResultFile : videoTabFile;
    if (wanted !== videoFile){
      if (wanted) loadVideoIntoPreview(wanted); else clearVideoPreview();
    }
  }

  if (isFoto){
    applyFormat();
    exportBtn.disabled = !photoImg;
  } else {
    canvas.width = 1080;
    canvas.height = 1920;
    stageEl.style.aspectRatio = '1080/1920';
    stageCaption.textContent = 'É assim que fica no Reels/Stories. Ajuste ao lado e a prévia atualiza sozinha.';
    render();
    exportBtn.disabled = !videoFile;
  }
  updateEmptyMsg();
}

function boot(){
  applyMode();
  render();
  var families = ['700 30px "Work Sans"', '500 30px "Work Sans"', '800 54px "Fraunces"', '700 40px "Fraunces"', '600 34px "Fraunces"'];
  Promise.all(families.map(function(f){
    try { return document.fonts.load(f); } catch(e){ return Promise.resolve(); }
  })).then(render).catch(function(){});
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

window.addEventListener('resize', function(){
  if (mode === 'foto') updatePhotoTransform();
});

// ======================= EXPORT (servidor Railway — vídeo) =======================
var RENDER_ENDPOINT = 'https://studio-giovani-video-server-production.up.railway.app/render';

function overlayPngBlob(){
  return new Promise(function(resolve){
    // o overlay já está desenhado no canvas visível (fundo transparente) —
    // basta exportar exatamente o que está na prévia.
    render();
    canvas.toBlob(function(blob){ resolve(blob); }, 'image/png');
  });
}

function downloadBlob(blob, filename){
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}

function fileBaseName(){
  return (el('localizacao').value || 'imovel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'imovel';
}

async function exportVideo(){
  if (!videoFile) return;
  exportBtn.disabled = true;
  setProgress(null);
  try {
    setStatus('Preparando a arte…');
    var overlayBlob = await overlayPngBlob();

    setStatus('Enviando o vídeo pro processador…');
    setProgress(0);

    var formData = new FormData();
    formData.append('video', videoFile);
    formData.append('overlay', overlayBlob, 'overlay.png');

    var blob = await new Promise(function(resolve, reject){
      var xhr = new XMLHttpRequest();
      xhr.open('POST', RENDER_ENDPOINT);
      xhr.responseType = 'blob';
      xhr.upload.onprogress = function(e){
        if (e.lengthComputable){
          setProgress(Math.min(0.9, e.loaded / e.total * 0.9));
        }
      };
      xhr.onload = function(){
        if (xhr.status >= 200 && xhr.status < 300){
          resolve(xhr.response);
        } else {
          var reader = new FileReader();
          reader.onload = function(){
            try {
              var data = JSON.parse(reader.result);
              reject(new Error(data.error || ('Erro ' + xhr.status)));
            } catch(e){
              reject(new Error('Erro ' + xhr.status));
            }
          };
          reader.onerror = function(){ reject(new Error('Erro ' + xhr.status)); };
          reader.readAsText(xhr.response);
        }
      };
      xhr.onerror = function(){ reject(new Error('Falha de conexão com o processador de vídeo.')); };
      xhr.send(formData);
    });

    setStatus('Finalizando…');
    setProgress(0.95);

    downloadBlob(blob, 'giovani-' + fileBaseName() + (mode === 'autoedit' ? '-autoedit' : '') + '.mp4');
    setProgress(1);
    setStatus('Vídeo pronto — o download deve começar sozinho.', 'ok');
    setTimeout(function(){ setProgress(null); }, 1500);
  } catch (err) {
    console.error('[Studio Giovani] falha ao gerar vídeo:', err);
    setProgress(null);
    var detail = (err && err.message) ? ' (' + err.message + ')' : '';
    setStatus('Não deu pra gerar o vídeo' + detail + '. Tenta de novo, ou com um vídeo menor.', 'error');
  } finally {
    exportBtn.disabled = false;
  }
}

// ======================= EXPORT (local — foto) =======================
function compositePhotoBlob(){
  return new Promise(function(resolve, reject){
    var W = currentW(), H = currentH();
    var off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    var octx = off.getContext('2d');
    octx.fillStyle = NAVY;
    octx.fillRect(0, 0, W, H);
    drawPhotoOnCtx(octx, W, H);
    var st = readState();
    var variantColors = variantColorsFor(st);
    if (artStyle === 'editorial'){
      if (fotoFormat === '1:1') renderEditorialSquare(octx, W, H, st, variantColors);
      else renderEditorialTall(octx, W, H, st, variantColors);
    } else if (fotoFormat === '1:1'){
      renderOverlaySquare(octx, W, H, st, variantColors);
    } else {
      renderOverlayTall(octx, W, H, st, variantColors);
    }
    off.toBlob(function(blob){
      if (blob) resolve(blob); else reject(new Error('Falha ao gerar a imagem'));
    }, 'image/jpeg', 0.92);
  });
}

async function exportFoto(){
  if (!photoImg) return;
  exportBtn.disabled = true;
  try {
    setStatus('Gerando a imagem…');
    var blob = await compositePhotoBlob();
    var suffix = fotoFormat === '1:1' ? '-feed' : '-story';
    var styleSuffix = artStyle === 'editorial' ? '-editorial' : '';
    var enhancedSuffix = photoShowingEnhanced ? '-melhorada' : '';
    downloadBlob(blob, 'giovani-' + fileBaseName() + styleSuffix + enhancedSuffix + suffix + '.jpg');
    setStatus('Imagem pronta — o download deve começar sozinho.', 'ok');
  } catch (err) {
    console.error('[Studio Giovani] falha ao gerar imagem:', err);
    var detail = (err && err.message) ? ' (' + err.message + ')' : '';
    setStatus('Não deu pra gerar a imagem' + detail + '. Tenta de novo.', 'error');
  } finally {
    exportBtn.disabled = false;
  }
}

exportBtn.addEventListener('click', function(){
  if (mode === 'foto') exportFoto();
  else exportVideo();
});

// ======================= AUTO EDIT (IA no servidor) =======================
// Sobe os clipes brutos pro servidor, que manda uma cópia leve pro Gemini
// montar a edição (hook, ordem, ritmo, trechos) e devolve o vídeo já cortado
// e juntado. O resultado vira o vídeo da prévia desta aba, com a arte por
// cima — e o botão "Gerar vídeo final" queima a arte igual na aba Vídeo.
var AUTOEDIT_ENDPOINT = 'https://studio-giovani-video-server-production.up.railway.app/autoedit/smart';
var AE_MAX = 10;
var aeClips = [];
var aeBusy = false;
var aeRunBtn = el('aeRunBtn');

function aeSetStatus(text, state){
  var s = el('aeStatus');
  s.textContent = text;
  s.dataset.state = state || '';
}
function aeSetProgress(p){
  el('aeProgressWrap').classList.toggle('show', p != null);
  if (p != null) el('aeProgressBar').style.width = Math.round(p * 100) + '%';
}
function aeMB(b){ return (b / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
function aeSec(n){ return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',') + 's'; }
function aeSetBtn(label, busy){
  aeRunBtn.innerHTML = '';
  if (busy){
    var s = document.createElement('span'); s.className = 'spin'; s.setAttribute('aria-hidden', 'true');
    aeRunBtn.appendChild(s);
  }
  aeRunBtn.appendChild(document.createTextNode(label));
}
function aeRefreshBtn(){
  aeRunBtn.disabled = aeBusy || aeClips.length < 2 || aeClips.length > AE_MAX;
}

el('aeInput').addEventListener('change', function(){
  aeClips = Array.from(this.files || []);
  var ul = el('aeFiles');
  ul.innerHTML = '';
  var total = 0;
  aeClips.forEach(function(f){
    total += f.size;
    var li = document.createElement('li');
    var a = document.createElement('span'); a.textContent = f.name;
    var b = document.createElement('span'); b.textContent = aeMB(f.size);
    li.append(a, b); ul.appendChild(li);
  });
  if (aeClips.length){
    var li = document.createElement('li');
    var bad = aeClips.length < 2 || aeClips.length > AE_MAX;
    li.className = 'total' + (bad ? ' warn' : '');
    var a = document.createElement('span');
    a.textContent = aeClips.length > AE_MAX ? aeClips.length + ' clipes (máximo ' + AE_MAX + ')'
      : (aeClips.length < 2 ? 'Escolha pelo menos 2 clipes' : aeClips.length + ' clipes');
    var b = document.createElement('span'); b.textContent = aeMB(total);
    li.append(a, b); ul.appendChild(li);
  }
  el('aeFilename').textContent = aeClips.length ? 'Trocar os clipes' : 'De 2 a 10 vídeos brutos do mesmo imóvel';
  aeRefreshBtn();
});

function aeDecodePlan(h){
  if (!h) return null;
  try {
    var bin = atob(h);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) { return null; }
}

function aeRenderPlan(plan){
  el('aePlan').hidden = false;
  el('aeResumo').textContent = (plan && plan.resumo) || '';
  var tl = el('aeTimeline'); tl.innerHTML = '';
  var ol = el('aeShots'); ol.innerHTML = '';
  if (!plan){ el('aeMeta').textContent = ''; return; }
  el('aeMeta').textContent = (plan.plano || []).length + ' cortes · ' + aeSec(plan.duracaoFinal || 0) + ' · IA ≈ US$ ' + (plan.custoUSD || 0).toFixed(3).replace('.', ',');
  (plan.plano || []).forEach(function(p, i){
    var dur = p.fim - p.inicio;
    var seg = document.createElement('div');
    seg.style.flex = String(Math.max(dur, 0.1));
    seg.textContent = i === 0 ? 'hook' : aeSec(dur);
    seg.title = (p.ambiente || p.nome) + ' · ' + aeSec(dur);
    tl.appendChild(seg);
    var li = document.createElement('li');
    var n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1);
    var t = document.createElement('span'); t.className = 't'; t.textContent = (p.ambiente || p.nome) + (i === 0 ? ' · hook' : '');
    var tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = aeSec(p.inicio) + '–' + aeSec(p.fim);
    var w = document.createElement('span'); w.className = 'w'; w.textContent = p.motivo || p.nome;
    li.append(n, t, tm, w); ol.appendChild(li);
  });
  (plan.fora || []).forEach(function(p){
    var li = document.createElement('li'); li.className = 'out';
    var n = document.createElement('span'); n.className = 'n'; n.textContent = '–';
    var t = document.createElement('span'); t.className = 't'; t.textContent = 'Fora: ' + (p.ambiente || p.nome);
    var tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = p.nome;
    var w = document.createElement('span'); w.className = 'w'; w.textContent = p.motivo || '';
    li.append(n, t, tm, w); ol.appendChild(li);
  });
}

aeRunBtn.addEventListener('click', function(){
  if (aeBusy || aeClips.length < 2 || aeClips.length > AE_MAX) return;
  aeBusy = true;
  aeRefreshBtn();
  el('aeInput').disabled = true;
  aeSetBtn('Montando…', true);
  aeSetProgress(0);
  aeSetStatus('Enviando os clipes…');

  var form = new FormData();
  aeClips.forEach(function(f){ form.append('clips', f, f.name); });
  var xhr = new XMLHttpRequest();
  xhr.open('POST', AUTOEDIT_ENDPOINT);
  xhr.responseType = 'blob';
  xhr.timeout = 12 * 60 * 1000;
  xhr.upload.onprogress = function(e){
    if (e.lengthComputable) aeSetProgress(0.6 * e.loaded / e.total);
  };
  xhr.upload.onload = function(){
    aeSetProgress(0.65);
    aeSetStatus('A IA está assistindo os clipes e montando a edição… (~30 a 60s)');
  };
  function finish(){
    aeBusy = false;
    el('aeInput').disabled = false;
    aeSetBtn('Montar vídeo com IA', false);
    aeRefreshBtn();
  }
  xhr.onload = function(){
    finish();
    if (xhr.status !== 200){
      var r = new FileReader();
      r.onload = function(){
        var msg = '';
        try { msg = JSON.parse(r.result).error || ''; } catch (e) {}
        aeSetProgress(null);
        aeSetStatus(msg || ('O servidor respondeu ' + xhr.status + '. Tenta de novo.'), 'error');
      };
      r.readAsText(xhr.response);
      return;
    }
    aeSetProgress(1);
    setTimeout(function(){ aeSetProgress(null); }, 1200);
    aeResultFile = new File([xhr.response], 'giovani-autoedit.mp4', { type: 'video/mp4' });
    if (mode === 'autoedit') loadVideoIntoPreview(aeResultFile);
    aeRenderPlan(aeDecodePlan(xhr.getResponseHeader('X-Autoedit-Plan')));
    aeSetStatus('Vídeo montado. Confira na prévia e toque em “Gerar vídeo final” pra sair com a arte.', 'ok');
  };
  xhr.onerror = function(){ finish(); aeSetProgress(null); aeSetStatus('Falha de conexão com o servidor. Confere a internet e tenta de novo.', 'error'); };
  xhr.ontimeout = function(){ finish(); aeSetProgress(null); aeSetStatus('Demorou demais. Tenta com menos clipes ou clipes mais curtos.', 'error'); };
  xhr.send(form);
});

el('aeRawBtn').addEventListener('click', function(){
  if (aeResultFile) downloadBlob(aeResultFile, 'giovani-' + fileBaseName() + '-montagem.mp4');
});
