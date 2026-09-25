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

var SERVER = window.__SG_SERVER || 'https://studio-giovani-video-server-production.up.railway.app';

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

// ---------------- tipo de anúncio ----------------
// Cada tipo preenche a etiqueta e troca os exemplos dos campos. O valor de
// aluguel/temporada ganha o "/mês" ou "/diária" sozinho se o corretor não pôs.
var ANUNCIOS = {
  venda:     { tag: 'À VENDA',  valorPh: 'Ex.: R$ 780.000',      tipoPh: 'Ex.: Apartamento',     areaPh: 'Ex.: 98 m²',        quartosLabel: 'Quartos', quartosPh: 'Ex.: 3 quartos', valorReq: true },
  aluguel:   { tag: 'ALUGA-SE', valorPh: 'Ex.: R$ 3.500',        tipoPh: 'Ex.: Apartamento',     areaPh: 'Ex.: 98 m²',        quartosLabel: 'Quartos', quartosPh: 'Ex.: 3 quartos', valorReq: true, sufixo: '/mês' },
  vendido:   { tag: 'VENDIDO',  valorPh: 'Opcional',             tipoPh: 'Ex.: Apartamento',     areaPh: 'Ex.: 98 m²',        quartosLabel: 'Quartos', quartosPh: 'Ex.: 3 quartos', valorReq: false },
  comercial: { tag: 'À VENDA',  valorPh: 'Ex.: R$ 450.000',      tipoPh: 'Ex.: Sala comercial',  areaPh: 'Ex.: 42 m²',        quartosLabel: 'Salas / ambientes', quartosPh: 'Ex.: 2 salas + copa', valorReq: true },
  rural:     { tag: 'À VENDA',  valorPh: 'Ex.: R$ 1.200.000',    tipoPh: 'Ex.: Sítio',           areaPh: 'Ex.: 2 hectares',   quartosLabel: 'Quartos', quartosPh: 'Ex.: casa com 3 quartos', valorReq: true },
  temporada: { tag: 'TEMPORADA', valorPh: 'Ex.: R$ 450',         tipoPh: 'Ex.: Casa de praia',   areaPh: 'Ex.: 120 m²',       quartosLabel: 'Quartos', quartosPh: 'Ex.: 3 quartos, até 8 pessoas', valorReq: true, sufixo: '/diária' }
};
var anuncio = 'venda';
function anuncioCfg(){ return ANUNCIOS[anuncio] || ANUNCIOS.venda; }
function valorComSufixo(v){
  var suf = anuncioCfg().sufixo;
  if (!v || !suf) return v;
  if (/\/|por m[eê]s|mensal|di[aá]ria|noite/i.test(v)) return v;
  return v + suf;
}
function applyAnuncio(key, fromUser){
  if (!ANUNCIOS[key]) key = 'venda';
  anuncio = key;
  var c = ANUNCIOS[key];
  document.querySelectorAll('#anuncioSeg button').forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-anuncio') === key)); });
  if (fromUser){
    el('status').value = c.tag;
    el('tg_status').checked = true;
    el('tg_valor').checked = key !== 'vendido' || !!el('valor').value.trim();
    syncToggleRows();
  }
  el('valor').placeholder = c.valorPh;
  el('tipo').placeholder = c.tipoPh;
  el('area').placeholder = c.areaPh;
  el('quartos').placeholder = c.quartosPh;
  el('quartosLabel').textContent = c.quartosLabel;
  el('valorReq').hidden = !c.valorReq;
  clearInvalid();
  render();
}
function syncToggleRows(){
  FIELD_KEYS.forEach(function(key){
    document.querySelector('[data-toggle-row="' + key + '"]').classList.toggle('off', !el('tg_' + key).checked);
  });
}
var FIELD_KEYS = ['localizacao','tipo','status','valor','area','quartos','vagas','destaque'];

function readState(){
  return {
    variant: document.querySelector('#variantSeg button[aria-pressed="true"]').getAttribute('data-variant'),
    localizacao: { on: el('tg_localizacao').checked, value: el('localizacao').value.trim() },
    tipo:        { on: el('tg_tipo').checked, value: el('tipo').value.trim() },
    status:      { on: el('tg_status').checked, value: el('status').value.trim() },
    valor:       { on: el('tg_valor').checked, value: valorComSufixo(el('valor').value.trim()) },
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

  var footerY = H - 78;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = CREAM;
  ctx.font = '600 44px "Fraunces"';
  ctx.textAlign = 'left';
  ctx.fillText('Giovani Oliveira', 64, footerY - 6);
  ctx.font = '500 27px "Work Sans"';
  trySetLetterSpacing(ctx, 1.5);
  ctx.fillStyle = 'rgba(244,240,230,0.85)';
  ctx.fillText('RE/MAX AXXIA IMÓVEIS · CRECI 110.031', 64, footerY + 36);
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

  var footerY = H - 40;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = CREAM;
  ctx.font = '600 33px "Fraunces"';
  ctx.textAlign = 'left';
  ctx.fillText('Giovani Oliveira', x, footerY - 4);
  ctx.font = '500 21px "Work Sans"';
  trySetLetterSpacing(ctx, 1.2);
  ctx.fillStyle = 'rgba(244,240,230,0.9)';
  ctx.fillText('RE/MAX AXXIA IMÓVEIS · CRECI 110.031', x, footerY + 24);
  trySetLetterSpacing(ctx, 0);
  ctx.restore();
}

// etiqueta do estilo Editorial: a tag do anúncio (À VENDA, VENDIDO…); sem
// tag, volta pra faixa da agência
function editorialTag(st){
  if (st.status.on && st.status.value) return st.status.value.toUpperCase();
  return 'RE/MAX AXXIA IMÓVEIS';
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

  cursor += drawSolidBox(ctx, cx, cursor, editorialTag(st), {
    fontSize: 21, weight: '800', family: 'Work Sans',
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
  ctx.font = '600 29px "Fraunces"';
  ctx.fillText('Giovani Oliveira', W - rightPad, footerCenterY - 5);
  ctx.font = '500 18px "Work Sans"';
  ctx.fillStyle = 'rgba(244,240,230,0.9)';
  ctx.fillText('CRECI 110.031 · 23 anos de mercado', W - rightPad, footerCenterY + 20);
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

  cursor += drawSolidBox(ctx, cx, cursor, editorialTag(st), {
    fontSize: 28, weight: '800', family: 'Work Sans',
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
  ctx.font = '600 37px "Fraunces"';
  ctx.fillText('Giovani Oliveira', W - rightPad, footerCenterY - 6);
  ctx.font = '500 23px "Work Sans"';
  ctx.fillStyle = 'rgba(244,240,230,0.9)';
  ctx.fillText('CRECI 110.031 · 23 anos de mercado', W - rightPad, footerCenterY + 26);
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

FIELD_KEYS.forEach(function(key){
  el(key).addEventListener('input', function(){
    document.querySelector('[data-toggle-row="' + key + '"]').classList.remove('invalid');
    render();
    draftSaveSoon();
  });
  el('tg_' + key).addEventListener('change', function(){
    document.querySelector('[data-toggle-row="' + key + '"]').classList.toggle('off', !this.checked);
    document.querySelector('[data-toggle-row="' + key + '"]').classList.remove('invalid');
    render();
    draftSaveSoon();
  });
});

document.querySelectorAll('#anuncioSeg button').forEach(function(btn){
  btn.addEventListener('click', function(){
    var key = btn.getAttribute('data-anuncio');
    if (key === anuncio) return;
    applyAnuncio(key, true);
    track('tipo_anuncio', { anuncio: key });
    draftSaveSoon();
  });
});

document.querySelectorAll('#variantSeg button').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#variantSeg button').forEach(function(b){ b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    render();
    draftSaveSoon();
  });
});

document.querySelectorAll('#styleSeg button').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#styleSeg button').forEach(function(b){ b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    artStyle = btn.getAttribute('data-style');
    render();
    track('estilo', { estilo: artStyle });
    draftSaveSoon();
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

function setVideoTabFile(file, fromDraft){
  videoTabFile = file;
  el('uploadFilename').textContent = file.name;
  el('videoPickTitle').textContent = 'Trocar o vídeo';
  var thumb = el('videoThumb');
  thumb.hidden = true;
  makeVideoThumb(file).then(function(url){
    if (url && videoTabFile === file){ thumb.src = url; thumb.hidden = false; }
  });
  if (mode === 'video') loadVideoIntoPreview(file);
  if (!fromDraft){
    track('midia', { tipo: 'video', mb: Math.round(file.size / 1048576) });
    draftSaveFile('video', file.size <= DRAFT_MAX_VIDEO ? file : null);
  }
}
el('videoInput').addEventListener('change', function(e){
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  setVideoTabFile(file, false);
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
  loadPhotoFile(file, false);
});
function loadPhotoFile(file, fromDraft){
  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  photoObjectUrl = URL.createObjectURL(file);

  exportBtn.disabled = true;
  setStatus('Carregando a foto…');

  var img = new Image();
  img.onload = function(){
    photoImg = img;
    photoEl.src = photoObjectUrl;
    el('fotoFilename').textContent = file.name || 'foto.jpg';
    el('fotoPickTitle').textContent = 'Trocar a foto';
    photoZoom = 1;
    photoPanXFrac = 0;
    photoPanYFrac = 0;
    el('fotoZoom').value = '1';
    el('fotoZoomLabel').textContent = '1.0x';
    updatePhotoTransform();
    updateEmptyMsg();
    exportBtn.disabled = mode !== 'foto';
    resetEnhanceForNewPhoto(img, photoObjectUrl);
    setStatus('');
    if (!fromDraft){
      track('midia', { tipo: 'foto', mb: Math.round(file.size / 1048576 * 10) / 10 });
      draftSaveFile('foto', file.size <= DRAFT_MAX_PHOTO ? file : null);
    }
  };
  img.onerror = function(){
    setStatus('Não consegui abrir essa foto. Tenta outro arquivo (JPG ou PNG).', 'error');
  };
  img.src = photoObjectUrl;
}

// ---------------- Melhorar foto (IA no servidor) ----------------
// A foto vai pro nosso servidor no Railway, que chama o Gemini com a chave
// guardada lá (a chave nunca passa pelo navegador). Guardamos a original e
// a melhorada pra alternar entre as duas sem gastar outra chamada.
var ENHANCE_ENDPOINT = SERVER + '/enhance-photo';
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

// Prepara a original: JPEG, lado maior até 3072px (a IA devolve em 2K) — isso normaliza HEIC/PNG gigante e acelera o upload.
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
  var tEnh = Date.now();
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
    setStatus('Foto melhorada. Se não gostar, volte pra original.', 'ok');
    track('melhorar_foto', { ok: true, seg: (Date.now() - tEnh) / 1000 });
  } catch (err) {
    if (myToken !== enhanceToken) return;
    console.error('[Studio Giovani] falha ao melhorar foto:', err);
    var detail = err && err.name === 'AbortError' ? 'demorou demais' : ((err && err.message) || 'erro desconhecido');
    enhanceBtn.disabled = false;
    setEnhanceBtn('Melhorar foto', false);
    setStatus('Não deu pra melhorar a foto (' + detail + '). A original continua valendo.', 'error');
    track('melhorar_foto', { ok: false, erro: String(detail).slice(0, 40) });
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
    track('formato', { formato: fotoFormat === '1:1' ? 'feed' : 'story' });
    draftSaveSoon();
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
  el('stageShell').classList.toggle('square', fotoFormat === '1:1');
  stageCaption.textContent = fotoFormat === '1:1'
    ? 'É assim que fica no feed do Instagram. Mude os dados e a prévia atualiza sozinha.'
    : 'É assim que fica no Reels/Stories. Mude os dados e a prévia atualiza sozinha.';
}

// --- abas de modo (Vídeo · Foto) ---
document.querySelectorAll('#modeSeg button').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#modeSeg button').forEach(function(b){ b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    if (mode === btn.getAttribute('data-mode')) return;
    mode = btn.getAttribute('data-mode');
    applyMode();
    track('aba', { aba: mode });
    draftSaveSoon();
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
  videoEl.muted = true;
  var isFoto = mode === 'foto';
  var isAE = mode === 'autoedit';
  el('videoUploadSection').hidden = mode !== 'video';
  el('autoeditSection').hidden = !isAE;
  el('fotoUploadSection').hidden = !isFoto;
  videoEl.style.display = isFoto ? 'none' : 'block';
  photoEl.style.display = isFoto ? 'block' : 'none';
  pageTitle.textContent = isFoto ? 'Monte seu post' : (isAE ? 'Montagem automática' : 'Monte seu vídeo');
  exportBtn.textContent = isFoto ? 'Gerar imagem final' : 'Gerar vídeo final';
  exportHint.textContent = isFoto
    ? 'Fica pronta na hora, aqui mesmo no celular.'
    : (isAE ? 'Coloca a arte por cima do vídeo montado pela IA.' : 'Processamos no servidor. Geralmente leva só alguns segundos.');
  emptyMsg.textContent = isFoto
    ? 'Escolha a foto do imóvel pra ver a prévia com a arte por cima'
    : (isAE ? 'Escolha os vídeos e toque em “Montar vídeo com IA”. O vídeo montado aparece aqui com a arte por cima.' : 'Escolha o vídeo do imóvel pra ver a prévia com a arte por cima');
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
    el('stageShell').classList.remove('square');
    stageCaption.textContent = 'É assim que fica no Reels/Stories. Mude os dados e a prévia atualiza sozinha.';
    render();
    exportBtn.disabled = !videoFile;
  }
  updateEmptyMsg();
  aeListenReset();
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

window.addEventListener('resize', function(){
  if (mode === 'foto') updatePhotoTransform();
});

// ======================= EXPORT (servidor — vídeo) =======================
var RENDER_ENDPOINT = SERVER + '/render';

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
  setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
}

function fileBaseName(){
  var base = splitLocalizacaoValue(el('localizacao').value || '').bairro || 'imovel';
  return base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'imovel';
}

function newId(){
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function readXhrError(xhr){
  return new Promise(function(resolve){
    var fallback = 'O servidor respondeu ' + xhr.status;
    if (!xhr.response || !xhr.response.size){ resolve(fallback); return; }
    var reader = new FileReader();
    reader.onload = function(){
      try { resolve(JSON.parse(reader.result).error || fallback); } catch(e){ resolve(fallback); }
    };
    reader.onerror = function(){ resolve(fallback); };
    reader.readAsText(xhr.response);
  });
}

// Progresso em três fases: envio do vídeo, processamento real no servidor
// (o servidor conta quanto do vídeo o ffmpeg já passou) e download.
async function exportVideo(){
  if (!videoFile) return;
  var isAE = mode === 'autoedit';
  if (isAE && !aeMontagemId){
    setStatus('Monte o vídeo com IA primeiro.', 'error');
    return;
  }
  exportBtn.disabled = true;
  var t0 = Date.now();
  var progId = newId();
  var pollTimer = null;
  var phase = 'upload';
  var upW = isAE ? 0.04 : 0.45;
  function stopPoll(){ if (pollTimer){ clearInterval(pollTimer); pollTimer = null; } }
  function poll(){
    fetch(SERVER + '/render/progresso/' + encodeURIComponent(progId), { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(p){
        if (phase !== 'server' || !p) return;
        if (p.fase === 'fila'){ setStatus('O servidor está terminando outro vídeo. Já já começa o seu…'); return; }
        setStatus('Colocando a arte no vídeo…');
        setProgress(upW + (0.92 - upW) * Math.max(0, Math.min(1, p.pct || 0)));
      }).catch(function(){});
  }
  try {
    setStatus('Preparando a arte…');
    setProgress(0);
    var overlayBlob = await overlayPngBlob();

    var formData = new FormData();
    formData.append('progressId', progId);
    if (isAE) formData.append('montagemId', aeMontagemId);
    formData.append('overlay', overlayBlob, 'overlay.png');
    if (!isAE) formData.append('video', videoFile);

    setStatus(isAE ? 'Colocando a arte no vídeo montado…' : 'Enviando o vídeo…');
    var blob = await new Promise(function(resolve, reject){
      var xhr = new XMLHttpRequest();
      xhr.open('POST', RENDER_ENDPOINT);
      xhr.responseType = 'blob';
      xhr.timeout = 12 * 60 * 1000;
      xhr.upload.onprogress = function(e){
        if (e.lengthComputable && phase === 'upload') setProgress(upW * e.loaded / e.total);
      };
      xhr.upload.onload = function(){
        if (phase !== 'upload') return;
        phase = 'server';
        setProgress(upW);
        setStatus('Colocando a arte no vídeo…');
        poll();
        pollTimer = setInterval(poll, 1000);
      };
      xhr.onprogress = function(e){
        if (xhr.status && xhr.status !== 200) return;
        if (phase !== 'download'){
          phase = 'download';
          stopPoll();
          setStatus('Baixando o vídeo pronto…');
        }
        if (e.lengthComputable) setProgress(0.92 + 0.08 * e.loaded / e.total);
      };
      xhr.onload = function(){
        stopPoll();
        if (xhr.status >= 200 && xhr.status < 300){ resolve(xhr.response); return; }
        readXhrError(xhr).then(function(msg){
          var err = new Error(msg);
          err.status = xhr.status;
          reject(err);
        });
      };
      xhr.onerror = function(){ stopPoll(); reject(new Error('Falha de conexão com o servidor. Confere a internet.')); };
      xhr.ontimeout = function(){ stopPoll(); reject(new Error('Demorou demais.')); };
      xhr.send(formData);
    });

    setProgress(1);
    setStatus('Vídeo pronto!', 'ok');
    setTimeout(function(){ setProgress(null); }, 1200);
    track('gerar', { tipo: isAE ? 'montagem' : 'video', ok: true, seg: (Date.now() - t0) / 1000, anuncio: anuncio });
    showDone('video', blob, 'giovani-' + fileBaseName() + (isAE ? '-montagem' : '') + '.mp4');
  } catch (err) {
    stopPoll();
    console.error('[Studio Giovani] falha ao gerar vídeo:', err);
    setProgress(null);
    track('gerar', { tipo: isAE ? 'montagem' : 'video', ok: false, anuncio: anuncio });
    track('erro', { onde: 'gerar_video', msg: String((err && err.message) || '').slice(0, 60) });
    if (isAE && err && err.status === 410){
      aeInvalidate(err.message);
      setStatus(err.message, 'error');
    } else {
      var detail = (err && err.message) ? ' (' + err.message + ')' : '';
      setStatus('Não deu pra gerar o vídeo' + detail + '. Tenta de novo' + (isAE ? '.' : ', ou com um vídeo menor.'), 'error');
    }
  } finally {
    stopPoll();
    exportBtn.disabled = !videoFile;
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
    setStatus('Imagem pronta!', 'ok');
    track('gerar', { tipo: 'foto', ok: true, anuncio: anuncio, estilo: artStyle, formato: fotoFormat === '1:1' ? 'feed' : 'story', melhorada: photoShowingEnhanced });
    showDone('foto', blob, 'giovani-' + fileBaseName() + styleSuffix + enhancedSuffix + suffix + '.jpg');
  } catch (err) {
    console.error('[Studio Giovani] falha ao gerar imagem:', err);
    track('gerar', { tipo: 'foto', ok: false, anuncio: anuncio });
    var detail = (err && err.message) ? ' (' + err.message + ')' : '';
    setStatus('Não deu pra gerar a imagem' + detail + '. Tenta de novo.', 'error');
  } finally {
    exportBtn.disabled = !photoImg;
  }
}

// ---------------- validação + "Confira os dados" ----------------
function clearInvalid(){
  document.querySelectorAll('.toggle-row.invalid').forEach(function(r){ r.classList.remove('invalid'); });
  document.querySelectorAll('.field-err').forEach(function(n){ n.remove(); });
}
function validateFields(){
  clearInvalid();
  var probs = [];
  if (el('tg_localizacao').checked && !el('localizacao').value.trim()) probs.push(['localizacao', 'Escreva o bairro (e a cidade, se quiser).']);
  if (anuncioCfg().valorReq && el('tg_valor').checked && !el('valor').value.trim()) probs.push(['valor', 'Escreva o valor. Se não quiser mostrar, desmarque a caixinha ao lado.']);
  probs.forEach(function(p){
    var row = document.querySelector('[data-toggle-row="' + p[0] + '"]');
    row.classList.add('invalid');
    var msg = document.createElement('div');
    msg.className = 'field-err';
    msg.textContent = p[1];
    row.querySelector('.toggle-field').appendChild(msg);
  });
  if (probs.length){
    var first = el(probs[0][0]);
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(function(){ try { first.focus({ preventScroll: true }); } catch(e){ first.focus(); } }, 350);
    setStatus(probs.length > 1 ? 'Falta preencher o bairro e o valor.' : (probs[0][0] === 'valor' ? 'Falta preencher o valor.' : 'Falta preencher o bairro.'), 'error');
    track('validacao_bloqueou', { campo: probs.map(function(p){ return p[0]; }).join(',') });
    return false;
  }
  return true;
}

var FIELD_NAMES = { status: 'Etiqueta', valor: 'Valor', localizacao: 'Bairro, cidade', tipo: 'Tipo do imóvel', area: 'Área', quartos: 'Quartos', vagas: 'Vagas', destaque: 'Diferencial' };
function openCheckSheet(){
  var st = readState();
  var ul = el('checkList');
  ul.innerHTML = '';
  function row(label, value){
    var li = document.createElement('li');
    var a = document.createElement('span'); a.textContent = label;
    var b = document.createElement('strong'); b.textContent = value;
    li.append(a, b); ul.appendChild(li);
  }
  var ANUNCIO_NOMES = { venda: 'Venda', aluguel: 'Aluguel', vendido: 'Vendido', comercial: 'Comercial', rural: 'Rural', temporada: 'Temporada' };
  row('Anúncio', ANUNCIO_NOMES[anuncio]);
  ['status', 'valor', 'localizacao', 'tipo', 'area', 'quartos', 'vagas', 'destaque'].forEach(function(k){
    if (st[k].on && st[k].value){
      var label = k === 'quartos' ? el('quartosLabel').textContent : FIELD_NAMES[k];
      row(label, k === 'status' ? st[k].value.toUpperCase() : st[k].value);
    }
  });
  if (mode === 'foto'){
    row('Formato', fotoFormat === '1:1' ? 'Feed (quadrado)' : 'Story / Reels (em pé)');
    row('Estilo', artStyle === 'editorial' ? 'Editorial' : 'Clássico');
  }
  var sheet = el('checkSheet');
  if (!sheet.showModal){ runExport(); return; }
  sheet.showModal();
  el('checkOkBtn').focus();
}
function runExport(){
  if (mode === 'foto') exportFoto();
  else exportVideo();
}
el('checkOkBtn').addEventListener('click', function(){
  el('checkSheet').close();
  track('conferencia', { acao: 'gerar' });
  runExport();
});
el('checkFixBtn').addEventListener('click', function(){
  el('checkSheet').close();
  track('conferencia', { acao: 'corrigir' });
  var target = el('localizacao');
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setTimeout(function(){ try { target.focus({ preventScroll: true }); } catch(e){} }, 350);
});

exportBtn.addEventListener('click', function(){
  if (exportBtn.disabled) return;
  if (mode === 'autoedit' && !aeMontagemId){ setStatus('Monte o vídeo com IA primeiro.', 'error'); return; }
  if (!validateFields()) return;
  setStatus('');
  openCheckSheet();
});

// ---------------- tela "Pronto!" ----------------
var doneData = null;
var isTouch = false;
try { isTouch = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}

function showDone(kind, blob, filename){
  if (doneData && doneData.url) URL.revokeObjectURL(doneData.url);
  var type = blob.type || (kind === 'foto' ? 'image/jpeg' : 'video/mp4');
  var file = null;
  try { file = new File([blob], filename, { type: type }); } catch (e) {}
  doneData = { kind: kind, blob: blob, filename: filename, file: file, url: URL.createObjectURL(blob), acted: false };
  var media = el('doneMedia');
  media.innerHTML = '';
  if (kind === 'foto'){
    var img = document.createElement('img');
    img.alt = 'Imagem pronta';
    img.src = doneData.url;
    media.appendChild(img);
  } else {
    var v = document.createElement('video');
    v.src = doneData.url;
    v.controls = true; v.playsInline = true; v.muted = true; v.loop = true; v.autoplay = true;
    v.setAttribute('playsinline', '');
    media.appendChild(v);
    v.play().catch(function(){});
  }
  var canShare = false;
  try { canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) {}
  el('doneShareBtn').hidden = !canShare;
  el('doneSaveBtn').className = canShare ? 'secondary-btn' : 'primary-btn';
  el('doneSaveBtn').textContent = isTouch ? 'Salvar no celular' : 'Baixar ' + (kind === 'foto' ? 'a imagem' : 'o vídeo');
  el('doneHint').textContent = canShare
    ? 'Mande direto pro WhatsApp ou Instagram, ou salve no celular.'
    : (kind === 'foto' ? 'Salve a imagem e poste do seu jeito.' : 'Salve o vídeo e poste do seu jeito.');
  el('doneTitle').textContent = kind === 'foto' ? 'Imagem pronta!' : 'Vídeo pronto!';
  el('doneStatus').textContent = '';
  el('doneStatus').dataset.state = '';
  var sheet = el('doneSheet');
  if (sheet.showModal){ sheet.showModal(); }
  else { downloadBlob(blob, filename); }
}

el('doneShareBtn').addEventListener('click', function(){
  if (!doneData || !doneData.file) return;
  var d = doneData;
  navigator.share({ files: [d.file], title: 'Imóvel · Giovani Oliveira' }).then(function(){
    d.acted = true;
    track('pronto_compartilhar', { tipo: d.kind, ok: true });
    el('doneStatus').textContent = 'Enviado!';
    el('doneStatus').dataset.state = 'ok';
  }).catch(function(err){
    if (err && err.name === 'AbortError') return;
    track('pronto_compartilhar', { tipo: d.kind, ok: false });
    el('doneStatus').textContent = 'Não deu pra abrir o compartilhamento. Toque em “Salvar” e envie pela galeria.';
    el('doneStatus').dataset.state = 'error';
  });
});
el('doneSaveBtn').addEventListener('click', function(){
  if (!doneData) return;
  downloadBlob(doneData.blob, doneData.filename);
  doneData.acted = true;
  track('pronto_salvar', { tipo: doneData.kind });
  el('doneStatus').textContent = isTouch
    ? 'Salvo. Procure em Arquivos ou Downloads (no iPhone, toque em compartilhar e “Salvar vídeo/imagem”).'
    : 'Download iniciado. O arquivo vai pra sua pasta de Downloads.';
  el('doneStatus').dataset.state = 'ok';
});
el('doneCloseBtn').addEventListener('click', function(){ el('doneSheet').close(); });
el('doneSheet').addEventListener('close', function(){
  var v = el('doneMedia').querySelector('video');
  if (v) v.pause();
  if (doneData) track('pronto_fechar', { tipo: doneData.kind, agiu: doneData.acted });
});


// ======================= MONTAGEM AUTOMÁTICA (IA no servidor) =======================
// Sobe os vídeos brutos pro servidor, que manda uma cópia leve pro Gemini
// montar a edição (cena de abertura, ordem, ritmo, trechos) e devolve uma
// prévia leve do vídeo montado. A montagem em qualidade cheia fica guardada
// no servidor (1 hora): "Gerar vídeo final" só manda a arte (montagemId) e o
// corretor pode reordenar/tirar/recolocar cenas sem reenviar nada.
var AUTOEDIT_ENDPOINT = window.__SG_AUTOEDIT_ENDPOINT || (SERVER + '/autoedit/smart');
var REMONTAR_ENDPOINT = AUTOEDIT_ENDPOINT.replace(/\/smart$/, '/remontar');
var AE_MAX = 10;
var aeClips = [];
var aeBusy = false;
var aeRunBtn = el('aeRunBtn');
var aeMontagemId = null;
var aePlanData = null;   // plano que está no vídeo de agora
var aeEdit = [];         // cenas na ordem que o corretor quer: {indice, inicio, fim, ambiente, nome, fala, motivo, dentro}
var aeThumbUrls = {};    // indice -> dataURL da miniatura
var aeThumbToken = 0;

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
  el('aeRemontarBtn').disabled = aeBusy;
}

// A montagem atual deixou de valer (trocou vídeos ou locução, ou expirou no servidor)
function aeInvalidate(msg){
  var had = !!(aeResultFile || aeMontagemId);
  aeResultFile = null;
  aeMontagemId = null;
  aePlanData = null;
  aeEdit = [];
  el('aePlan').hidden = true;
  aeListenReset();
  if (mode === 'autoedit') clearVideoPreview();
  if (had && msg) aeSetStatus(msg);
}

// miniatura de um vídeo: primeiro quadro "bom" (0,5s)
function makeVideoThumb(file){
  return new Promise(function(resolve){
    var url = URL.createObjectURL(file);
    var v = document.createElement('video');
    var done = false;
    function finish(data){
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src'); try { v.load(); } catch(e){}
      URL.revokeObjectURL(url);
      resolve(data);
    }
    var timer = setTimeout(function(){ finish(null); }, 8000);
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', '');
    v.onloadedmetadata = function(){
      try { v.currentTime = Math.min(0.5, (v.duration || 1) / 3); } catch(e){ finish(null); }
    };
    v.onseeked = function(){
      try {
        var w = 120, h = Math.round(w * (v.videoHeight || 16) / (v.videoWidth || 9));
        var c = document.createElement('canvas');
        c.width = w; c.height = Math.max(1, h);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        finish(c.toDataURL('image/jpeg', 0.7));
      } catch(e){ finish(null); }
    };
    v.onerror = function(){ finish(null); };
    v.src = url;
  });
}

function aeRenderThumbs(){
  var ul = el('aeThumbs');
  ul.innerHTML = '';
  var total = 0;
  aeClips.forEach(function(f, i){
    total += f.size;
    var li = document.createElement('li');
    var ph = document.createElement(aeThumbUrls[i] ? 'img' : 'div');
    ph.className = 'ph';
    if (aeThumbUrls[i]){ ph.src = aeThumbUrls[i]; ph.alt = ''; }
    var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = (i + 1) + '. ' + f.name;
    li.title = f.name + ' · ' + aeMB(f.size);
    li.append(ph, nm);
    ul.appendChild(li);
  });
  var sum = el('aeSum');
  sum.innerHTML = '';
  sum.className = 'ae-sum';
  if (aeClips.length){
    var bad = aeClips.length < 2 || aeClips.length > AE_MAX;
    if (bad) sum.className = 'ae-sum warn';
    var a = document.createElement('span');
    a.textContent = aeClips.length > AE_MAX ? aeClips.length + ' vídeos (máximo ' + AE_MAX + ')'
      : (aeClips.length < 2 ? 'Escolha pelo menos 2 vídeos' : aeClips.length + ' vídeos escolhidos');
    var b = document.createElement('span'); b.textContent = aeMB(total);
    sum.append(a, b);
  }
}

async function aeLoadThumbs(){
  var my = ++aeThumbToken;
  for (var i = 0; i < aeClips.length; i++){
    if (my !== aeThumbToken) return;
    var data = await makeVideoThumb(aeClips[i]);
    if (my !== aeThumbToken) return;
    if (data){ aeThumbUrls[i] = data; aeRenderThumbs(); if (aePlanData) aeRenderPlan(); }
  }
}

el('aeInput').addEventListener('change', function(){
  var picked = Array.from(this.files || []);
  if (!picked.length) return;
  aeClips = picked;
  aeThumbUrls = {};
  aeRenderThumbs();
  aeLoadThumbs();
  el('aePickTitle').textContent = 'Trocar os vídeos';
  el('aeFilename').textContent = 'Toque aqui pra escolher outros';
  aeInvalidate('Você trocou os vídeos. Toque em “Montar vídeo com IA” de novo.');
  aeRefreshBtn();
  track('midia', { tipo: 'clipes', n: aeClips.length, mb: Math.round(picked.reduce(function(s, f){ return s + f.size; }, 0) / 1048576) });
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

function aeSetPlan(plan){
  aePlanData = plan;
  aeEdit = [];
  if (plan){
    (plan.plano || []).forEach(function(p){ aeEdit.push(Object.assign({}, p, { dentro: true })); });
    (plan.fora || []).forEach(function(p){ aeEdit.push(Object.assign({}, p, { dentro: false, fala: '' })); });
  }
  aeRenderPlan();
}

function aeEditDirty(){
  if (!aePlanData) return false;
  var now = aeEdit.filter(function(c){ return c.dentro; }).map(function(c){ return c.indice; }).join(',');
  var was = (aePlanData.plano || []).map(function(c){ return c.indice; }).join(',');
  return now !== was;
}

function aeMove(pos, delta){
  var inside = aeEdit.filter(function(c){ return c.dentro; });
  var outside = aeEdit.filter(function(c){ return !c.dentro; });
  var j = pos + delta;
  if (j < 0 || j >= inside.length) return;
  var t = inside[pos]; inside[pos] = inside[j]; inside[j] = t;
  aeEdit = inside.concat(outside);
  aeRenderPlan(pos + delta);
}
function aeToggle(indice, dentro){
  var inside = aeEdit.filter(function(c){ return c.dentro; });
  if (!dentro && inside.length <= 1) return;
  var item = aeEdit.filter(function(c){ return c.indice === indice; })[0];
  if (!item) return;
  item.dentro = dentro;
  if (dentro){
    // recolocada entra no fim
    aeEdit = aeEdit.filter(function(c){ return c !== item; });
    var ins = aeEdit.filter(function(c){ return c.dentro; });
    var out = aeEdit.filter(function(c){ return !c.dentro; });
    aeEdit = ins.concat([item], out);
  } else {
    var ins2 = aeEdit.filter(function(c){ return c.dentro; });
    var out2 = aeEdit.filter(function(c){ return !c.dentro; });
    aeEdit = ins2.concat(out2);
  }
  aeRenderPlan();
}

function aeRenderPlan(focusPos){
  var plan = aePlanData;
  el('aePlan').hidden = !plan;
  if (!plan) return;
  el('aeResumo').textContent = plan.resumo || '';
  var inside = aeEdit.filter(function(c){ return c.dentro; });
  var outside = aeEdit.filter(function(c){ return !c.dentro; });
  var dirty = aeEditDirty();
  var total = inside.reduce(function(s, c){ return s + (c.fim - c.inicio) + (c.hold || 0); }, 0);
  el('aeMeta').textContent = inside.length + (inside.length === 1 ? ' cena' : ' cenas') + ' · ' + aeSec(dirty ? total : (plan.duracaoFinal || total))
    + (plan.comLocucao ? ' · com locução' : '') + (plan.ajustadaPeloCorretor && !dirty ? ' · ajustada por você' : '');

  var tl = el('aeTimeline'); tl.innerHTML = '';
  inside.forEach(function(p, i){
    var dur = (p.fim - p.inicio) + (p.hold || 0);
    var seg = document.createElement('div');
    seg.style.flex = String(Math.max(dur, 0.1));
    seg.textContent = i === 0 ? 'abertura' : aeSec(dur);
    seg.title = (p.ambiente || p.nome) + ' · ' + aeSec(dur);
    tl.appendChild(seg);
  });

  var ol = el('aeShots'); ol.innerHTML = '';
  function btn(label, aria, fn, disabled){
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'mini-btn'; b.textContent = label;
    if (aria) b.setAttribute('aria-label', aria);
    b.disabled = !!disabled || aeBusy;
    b.addEventListener('click', fn);
    return b;
  }
  inside.forEach(function(p, i){
    var li = document.createElement('li');
    var n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1);
    var t = document.createElement('span'); t.className = 't'; t.textContent = (p.ambiente || p.nome) + (i === 0 ? ' · cena de abertura' : '');
    var tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = aeSec((p.fim - p.inicio) + (p.hold || 0));
    li.append(n, t, tm);
    if (plan.comLocucao && p.fala && !dirty){
      var fl = document.createElement('span'); fl.className = 'fala'; fl.textContent = '“' + p.fala + '”';
      li.appendChild(fl);
    }
    if (p.motivo){
      var w = document.createElement('span'); w.className = 'w'; w.textContent = p.motivo;
      li.appendChild(w);
    }
    var ctl = document.createElement('div'); ctl.className = 'ctl';
    var nome = p.ambiente || p.nome;
    ctl.append(
      btn('↑ Subir', 'Subir a cena ' + nome, function(){ aeMove(i, -1); }, i === 0),
      btn('↓ Descer', 'Descer a cena ' + nome, function(){ aeMove(i, 1); }, i === inside.length - 1),
      btn('Tirar', 'Tirar a cena ' + nome, function(){ aeToggle(p.indice, false); }, inside.length <= 1)
    );
    li.appendChild(ctl);
    ol.appendChild(li);
  });
  outside.forEach(function(p){
    var li = document.createElement('li'); li.className = 'out';
    var n = document.createElement('span'); n.className = 'n'; n.textContent = '–';
    var t = document.createElement('span'); t.className = 't'; t.textContent = 'Fora: ' + (p.ambiente || p.nome);
    var tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = aeSec(p.fim - p.inicio);
    li.append(n, t, tm);
    if (p.motivo){
      var w = document.createElement('span'); w.className = 'w'; w.textContent = p.motivo;
      li.appendChild(w);
    }
    var ctl = document.createElement('div'); ctl.className = 'ctl';
    ctl.append(btn('Recolocar', 'Recolocar a cena ' + (p.ambiente || p.nome), function(){ aeToggle(p.indice, true); }));
    li.appendChild(ctl);
    ol.appendChild(li);
  });
  el('aeRemontarBtn').hidden = !dirty;
  el('aeRemontarBtn').disabled = aeBusy;
  if (focusPos != null){
    var target = ol.children[focusPos];
    if (target){ var b = target.querySelector('.mini-btn:not(:disabled)'); if (b) b.focus(); }
  }
}

// resposta de montar/remontar: prévia leve + plano + id da montagem guardada
function aeHandleResult(xhr, withVoice, wasRemontar){
  aeSetProgress(1);
  setTimeout(function(){ aeSetProgress(null); }, 1200);
  aeResultFile = new File([xhr.response], 'giovani-montagem-previa.mp4', { type: 'video/mp4' });
  aeMontagemId = xhr.getResponseHeader('X-Autoedit-Id') || null;
  aeResultHasVoice = withVoice;
  var plan = aeDecodePlan(xhr.getResponseHeader('X-Autoedit-Plan'));
  aeListenReset();
  if (mode === 'autoedit') loadVideoIntoPreview(aeResultFile);
  aeSetPlan(plan);
  el('aeListenBtn').hidden = !withVoice;
  if (wasRemontar){
    aeSetStatus('Pronto, refiz com os seus ajustes. Confira na prévia.', 'ok');
  } else {
    aeSetStatus(withVoice
      ? 'Vídeo montado no tempo da locução. Toque em “Ouvir a prévia” e depois em “Gerar vídeo final” pra sair com a arte.'
      : 'Vídeo montado. Confira na prévia e toque em “Gerar vídeo final” pra sair com a arte.', 'ok');
  }
  return plan;
}

function aeFinishBusy(){
  aeBusy = false;
  el('aeInput').disabled = false;
  aeSetBtn('Montar vídeo com IA', false);
  aeRefreshBtn();
  if (aePlanData) aeRenderPlan();
}

aeRunBtn.addEventListener('click', function(){
  if (aeBusy || aeClips.length < 2 || aeClips.length > AE_MAX) return;
  aeBusy = true;
  aeRefreshBtn();
  el('aeInput').disabled = true;
  aeSetBtn('Montando…', true);
  aeSetProgress(0);
  aeSetStatus('Enviando os vídeos…');
  var t0 = Date.now();

  var form = new FormData();
  // contexto pra IA escolher o percurso certo (texto curto, sem dado pessoal)
  var loc = splitLocalizacaoValue(el('localizacao').value || '');
  form.append('tipoImovel', el('tipo').value.trim());
  form.append('anuncio', anuncio);
  form.append('bairro', loc.bairro || '');
  aeClips.forEach(function(f){ form.append('clips', f, f.name); });
  var withVoice = !!voiceBlob;
  if (withVoice) form.append('voice', voiceBlob, voiceName);
  var xhr = new XMLHttpRequest();
  xhr.open('POST', AUTOEDIT_ENDPOINT);
  xhr.responseType = 'blob';
  xhr.timeout = 12 * 60 * 1000;
  xhr.upload.onprogress = function(e){
    if (e.lengthComputable) aeSetProgress(0.6 * e.loaded / e.total);
  };
  xhr.upload.onload = function(){
    aeSetProgress(0.65);
    aeSetStatus(withVoice
      ? 'A IA está ouvindo a locução e montando os cortes no tempo da fala… (uns 30 a 90 segundos)'
      : 'A IA está assistindo os vídeos e montando a edição… (uns 30 a 60 segundos)');
  };
  xhr.onload = function(){
    aeFinishBusy();
    if (xhr.status !== 200){
      readXhrError(xhr).then(function(msg){
        aeSetProgress(null);
        aeSetStatus(msg || ('O servidor respondeu ' + xhr.status + '. Tenta de novo.'), 'error');
        track('montagem', { ok: false, voz: withVoice, n: aeClips.length });
        track('erro', { onde: 'montagem', msg: String(msg).slice(0, 60) });
      });
      return;
    }
    var plan = aeHandleResult(xhr, withVoice, false);
    track('montagem', { ok: true, voz: withVoice, n: aeClips.length, cortes: plan && plan.plano ? plan.plano.length : 0, seg: (Date.now() - t0) / 1000 });
  };
  xhr.onerror = function(){ aeFinishBusy(); aeSetProgress(null); aeSetStatus('Falha de conexão com o servidor. Confere a internet e tenta de novo.', 'error'); track('montagem', { ok: false, voz: withVoice, erro: 'conexao' }); };
  xhr.ontimeout = function(){ aeFinishBusy(); aeSetProgress(null); aeSetStatus('Demorou demais. Tenta com menos vídeos ou vídeos mais curtos.', 'error'); track('montagem', { ok: false, voz: withVoice, erro: 'timeout' }); };
  xhr.send(form);
});

el('aeRemontarBtn').addEventListener('click', function(){
  if (aeBusy || !aeMontagemId) return;
  var cortes = aeEdit.filter(function(c){ return c.dentro; }).map(function(c){ return { indice: c.indice, inicio: c.inicio, fim: c.fim }; });
  if (!cortes.length) return;
  aeBusy = true;
  aeRefreshBtn();
  aeRenderPlan();
  el('aeInput').disabled = true;
  el('aeRemontarBtn').textContent = 'Refazendo…';
  aeSetProgress(0.3);
  aeSetStatus('Refazendo a montagem com os seus ajustes… (uns 10 a 30 segundos)');
  var withVoice = aeResultHasVoice;
  var xhr = new XMLHttpRequest();
  xhr.open('POST', REMONTAR_ENDPOINT);
  xhr.responseType = 'blob';
  xhr.timeout = 6 * 60 * 1000;
  xhr.setRequestHeader('Content-Type', 'application/json');
  function done(){
    el('aeRemontarBtn').textContent = 'Refazer com meus ajustes';
    aeFinishBusy();
  }
  xhr.onload = function(){
    done();
    if (xhr.status !== 200){
      readXhrError(xhr).then(function(msg){
        aeSetProgress(null);
        track('remontagem', { ok: false });
        if (xhr.status === 410){ aeInvalidate(msg); aeSetStatus(msg, 'error'); return; }
        aeSetStatus(msg || 'Não consegui refazer. Tenta de novo.', 'error');
      });
      return;
    }
    aeHandleResult(xhr, withVoice, true);
    track('remontagem', { ok: true, cortes: cortes.length });
  };
  xhr.onerror = function(){ done(); aeSetProgress(null); aeSetStatus('Falha de conexão com o servidor. Tenta de novo.', 'error'); track('remontagem', { ok: false }); };
  xhr.ontimeout = function(){ done(); aeSetProgress(null); aeSetStatus('Demorou demais. Tenta de novo.', 'error'); track('remontagem', { ok: false }); };
  xhr.send(JSON.stringify({ id: aeMontagemId, cortes: cortes }));
});

el('aeRawBtn').addEventListener('click', function(){
  if (!aeMontagemId){ if (aeResultFile) downloadBlob(aeResultFile, 'giovani-' + fileBaseName() + '-montagem.mp4'); return; }
  var b = this;
  b.disabled = true;
  aeSetStatus('Baixando a montagem em qualidade cheia…');
  fetch(SERVER + '/montagem/' + encodeURIComponent(aeMontagemId)).then(function(r){
    if (!r.ok) return r.json().catch(function(){ return {}; }).then(function(j){ var e = new Error(j.error || ('Erro ' + r.status)); e.status = r.status; throw e; });
    return r.blob();
  }).then(function(blob){
    downloadBlob(blob, 'giovani-' + fileBaseName() + '-montagem-sem-arte.mp4');
    aeSetStatus('Download da montagem sem a arte iniciado.', 'ok');
  }).catch(function(err){
    if (err.status === 410){ aeInvalidate(err.message); aeSetStatus(err.message, 'error'); return; }
    aeSetStatus('Não deu pra baixar (' + err.message + '). Tenta de novo.', 'error');
  }).finally(function(){ b.disabled = false; });
});


// ---------------- Locução (gravar no navegador ou enviar arquivo) ----------------
var voiceBlob = null;
var voiceName = '';
var voiceRecorder = null;
var voiceStream = null;
var voiceTimerId = null;
var voiceStartedAt = 0;
var voiceUrl = null;
var aeResultHasVoice = false;
var VOICE_MAX_SECONDS = 120;

function voiceShow(state){
  el('voiceIdle').hidden = state !== 'idle';
  el('voiceRecording').hidden = state !== 'recording';
  el('voiceReady').hidden = state !== 'ready';
}
function voiceFmt(sec){
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function voiceMarkChanged(){
  // a montagem atual foi feita com outra locução (ou sem): não vale mais
  aeInvalidate('A locução mudou. Toque em “Montar vídeo com IA” de novo pra encaixar os cortes nela.');
  draftSaveVoice();
}
function voiceSet(blob, name, knownSeconds, silent){
  var hadMontagem = !!(aeResultFile || aeMontagemId);
  voiceBlob = blob;
  voiceName = name;
  if (voiceUrl) URL.revokeObjectURL(voiceUrl);
  voiceUrl = URL.createObjectURL(blob);
  var player = el('voicePlayer');
  player.src = voiceUrl;
  el('voiceInfo').textContent = knownSeconds ? 'Locução de ' + voiceFmt(knownSeconds) : 'Locução pronta';
  player.onloadedmetadata = function(){
    if (isFinite(player.duration) && player.duration > 0){
      el('voiceInfo').textContent = 'Locução de ' + voiceFmt(player.duration);
    }
  };
  voiceShow('ready');
  if (!silent) voiceMarkChanged();
  return hadMontagem;
}
function voiceClear(){
  voiceBlob = null;
  voiceName = '';
  if (voiceUrl){ URL.revokeObjectURL(voiceUrl); voiceUrl = null; }
  el('voicePlayer').removeAttribute('src');
  voiceShow('idle');
  voiceMarkChanged();
}
function voicePickMime(){
  var opts = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  for (var i = 0; i < opts.length; i++){ if (MediaRecorder.isTypeSupported(opts[i])) return opts[i]; }
  return '';
}

async function voiceStart(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder){
    aeSetStatus('Esse navegador não grava áudio. Use o Chrome ou o Safari atualizados, ou envie um áudio pronto.', 'error');
    return;
  }
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (err) {
    var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    aeSetStatus(denied
      ? 'O navegador bloqueou o microfone. Libere o microfone pra este site (no cadeado ao lado do endereço) e tente de novo.'
      : 'Não encontrei um microfone. Confere se tem um conectado, ou envie um áudio pronto.', 'error');
    return;
  }
  var mime = voicePickMime();
  var chunks = [];
  try {
    voiceRecorder = mime ? new MediaRecorder(voiceStream, { mimeType: mime }) : new MediaRecorder(voiceStream);
  } catch (e) {
    voiceRecorder = new MediaRecorder(voiceStream);
  }
  voiceRecorder.ondataavailable = function(e){ if (e.data && e.data.size) chunks.push(e.data); };
  voiceRecorder.onstop = function(){
    clearInterval(voiceTimerId);
    if (voiceStream){ voiceStream.getTracks().forEach(function(t){ t.stop(); }); voiceStream = null; }
    var type = (voiceRecorder && voiceRecorder.mimeType) || mime || 'audio/webm';
    var ext = /mp4/.test(type) ? 'm4a' : (/ogg/.test(type) ? 'ogg' : 'webm');
    var blob = new Blob(chunks, { type: type });
    voiceRecorder = null;
    if (blob.size < 2000){
      voiceShow('idle');
      aeSetStatus('A gravação ficou vazia. Tente de novo.', 'error');
      return;
    }
    var secs = (Date.now() - voiceStartedAt) / 1000;
    var refazer = voiceSet(blob, 'locucao.' + ext, secs);
    aeSetStatus(refazer
      ? 'Locução nova gravada. Toque em “Montar vídeo com IA” de novo pra encaixar os cortes nela.'
      : 'Locução gravada. Ouça pra conferir e toque em “Montar vídeo com IA”.');
    track('locucao', { origem: 'gravada', seg: Math.round(secs) });
  };
  voiceRecorder.start(250);
  voiceStartedAt = Date.now();
  el('voiceTimer').textContent = '0:00';
  voiceShow('recording');
  aeSetStatus('Gravando. Fale com calma sobre o imóvel e toque em “Parar” quando terminar.');
  voiceTimerId = setInterval(function(){
    var sec = (Date.now() - voiceStartedAt) / 1000;
    el('voiceTimer').textContent = voiceFmt(sec);
    if (sec >= VOICE_MAX_SECONDS && voiceRecorder && voiceRecorder.state === 'recording') voiceRecorder.stop();
  }, 250);
}

el('voiceRecBtn').addEventListener('click', voiceStart);
el('voiceStopBtn').addEventListener('click', function(){
  if (voiceRecorder && voiceRecorder.state === 'recording') voiceRecorder.stop();
});
el('voiceRedoBtn').addEventListener('click', function(){ voiceClear(); voiceStart(); });
el('voiceRemoveBtn').addEventListener('click', function(){
  var had = !!aeResultFile;
  voiceClear();
  aeSetStatus(had ? 'Locução removida. Monte de novo pra sair sem a voz.' : 'Locução removida.');
});
el('voiceFile').addEventListener('change', function(){
  var f = this.files && this.files[0];
  this.value = '';
  if (!f) return;
  if (f.size > 30 * 1024 * 1024){ aeSetStatus('Esse áudio passou de 30 MB. Envie um arquivo menor.', 'error'); return; }
  var refazer = voiceSet(f, f.name || 'locucao');
  aeSetStatus(refazer
    ? 'Locução nova carregada. Toque em “Montar vídeo com IA” de novo pra encaixar os cortes nela.'
    : 'Áudio carregado. Ouça pra conferir e toque em “Montar vídeo com IA”.');
  track('locucao', { origem: 'arquivo', mb: Math.round(f.size / 1048576) });
});

// "Ouvir a prévia": abre a prévia, rola até ela e vira "Pausar"
var aeListening = false;
var aeListenFresh = true;
function aeListenReset(){
  aeListening = false;
  aeListenFresh = true;
  var b = el('aeListenBtn');
  if (b) b.textContent = 'Ouvir a prévia com a locução';
}
el('aeListenBtn').addEventListener('click', function(){
  if (mode !== 'autoedit' || !aeResultFile) return;
  if (aeListening && !videoEl.paused){
    videoEl.pause();
    return;
  }
  previewSetCollapsed(false);
  stageEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  videoEl.muted = false;
  if (aeListenFresh) videoEl.currentTime = 0;
  aeListenFresh = false;
  aeListening = true;
  this.textContent = 'Pausar';
  videoEl.play().catch(function(){ aeListenReset(); });
  track('ouvir_previa', {});
});
videoEl.addEventListener('pause', function(){
  if (!aeListening) return;
  aeListening = false;
  videoEl.muted = true;
  el('aeListenBtn').textContent = 'Continuar ouvindo';
});


// ======================= métricas de uso (anônimas) =======================
// Um id aleatório por aparelho e outro por visita — sem nome, e-mail ou
// dado do imóvel. O servidor junta tudo no painel.
var EVENTS_ENDPOINT = SERVER + '/events';
var evQueue = [];
var evTimer = null;
var evDevice = (function(){
  try {
    var d = localStorage.getItem('sg_dev');
    if (!d){ d = newId(); localStorage.setItem('sg_dev', d); }
    return d;
  } catch (e) { return 'sem-armazenamento'; }
})();
var evSession = newId();
var evDev = isTouch ? 'mobile' : 'desktop';

function track(name, props){
  if (window.__SG_NO_EVENTS) return;
  evQueue.push({ e: name, p: props || {} });
  if (evQueue.length >= 20) evFlush(false);
  else if (!evTimer) evTimer = setTimeout(function(){ evFlush(false); }, 4000);
}
function evFlush(leaving){
  clearTimeout(evTimer);
  evTimer = null;
  if (!evQueue.length) return;
  var body = JSON.stringify({ d: evDevice, s: evSession, dev: evDev, ev: evQueue.splice(0, 40) });
  try {
    if (leaving && navigator.sendBeacon){
      navigator.sendBeacon(EVENTS_ENDPOINT, new Blob([body], { type: 'text/plain' }));
      return;
    }
    fetch(EVENTS_ENDPOINT, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' }, keepalive: true }).catch(function(){});
  } catch (e) {}
}
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') evFlush(true); });
window.addEventListener('pagehide', function(){ evFlush(true); });
window.addEventListener('error', function(e){
  track('erro', { onde: 'js', msg: String((e && e.message) || '').slice(0, 60) });
});


// ======================= rascunho (não perder nada ao recarregar) =======================
// Os dados do formulário vão pro localStorage; a foto, o vídeo (até 150 MB)
// e a locução vão pro IndexedDB do próprio navegador. Os vídeos da montagem
// automática não são guardados (são muitos e grandes).
var DRAFT_KEY = 'sg_rascunho_v1';
var DRAFT_MAX_VIDEO = 150 * 1024 * 1024;
var DRAFT_MAX_PHOTO = 40 * 1024 * 1024;
var draftTimer = null;
var draftRestoring = false;

function draftSnapshot(){
  var fields = {};
  FIELD_KEYS.forEach(function(k){ fields[k] = { on: el('tg_' + k).checked, value: el(k).value }; });
  return {
    v: 1, t: Date.now(), mode: mode, anuncio: anuncio, fields: fields,
    variant: document.querySelector('#variantSeg button[aria-pressed="true"]').getAttribute('data-variant'),
    artStyle: artStyle, fotoFormat: fotoFormat
  };
}
function draftSaveSoon(){
  if (draftRestoring) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(function(){
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draftSnapshot())); } catch (e) {}
  }, 500);
}

var idbPromise = null;
function idb(){
  if (idbPromise) return idbPromise;
  idbPromise = new Promise(function(resolve){
    try {
      var req = indexedDB.open('sg-studio', 1);
      req.onupgradeneeded = function(){ req.result.createObjectStore('arquivos'); };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ resolve(null); };
      req.onblocked = function(){ resolve(null); };
    } catch (e) { resolve(null); }
  });
  return idbPromise;
}
function idbOp(modeRW, fn){
  return idb().then(function(db){
    if (!db) return null;
    return new Promise(function(resolve){
      try {
        var tx = db.transaction('arquivos', modeRW);
        var store = tx.objectStore('arquivos');
        var req = fn(store);
        tx.oncomplete = function(){ resolve(req && 'result' in req ? req.result : null); };
        tx.onerror = function(){ resolve(null); };
        tx.onabort = function(){ resolve(null); };
      } catch (e) { resolve(null); }
    });
  });
}
function draftSaveFile(key, file){
  if (draftRestoring) return;
  if (!file){ idbOp('readwrite', function(st){ return st.delete(key); }); return; }
  idbOp('readwrite', function(st){ return st.put({ blob: file, name: file.name || key, type: file.type || '' }, key); });
}
function draftSaveVoice(){
  if (draftRestoring) return;
  if (voiceBlob) idbOp('readwrite', function(st){ return st.put({ blob: voiceBlob, name: voiceName, type: voiceBlob.type || '' }, 'voz'); });
  else idbOp('readwrite', function(st){ return st.delete('voz'); });
}
function asFile(rec){
  if (!rec || !rec.blob) return null;
  try { return new File([rec.blob], rec.name || 'arquivo', { type: rec.type || rec.blob.type || '' }); } catch (e) { return rec.blob; }
}

async function draftRestore(){
  var d = null;
  try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) {}
  var fotoRec = await idbOp('readonly', function(st){ return st.get('foto'); });
  var videoRec = await idbOp('readonly', function(st){ return st.get('video'); });
  var vozRec = await idbOp('readonly', function(st){ return st.get('voz'); });
  var typed = false;
  if (d && d.v === 1 && d.fields){
    FIELD_KEYS.forEach(function(k){ var f = d.fields[k]; if (f && f.value && !(k === 'status' && /^(À VENDA|ALUGA-SE|VENDIDO|TEMPORADA)$/.test(f.value))) typed = true; });
  }
  if (!typed && !fotoRec && !videoRec && !vozRec) return;

  draftRestoring = true;
  try {
    if (d && d.v === 1){
      applyAnuncio(d.anuncio || 'venda', false);
      FIELD_KEYS.forEach(function(k){
        var f = d.fields && d.fields[k];
        if (!f) return;
        el(k).value = f.value || '';
        el('tg_' + k).checked = f.on !== false;
      });
      syncToggleRows();
      if (d.variant) document.querySelectorAll('#variantSeg button').forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-variant') === d.variant)); });
      if (d.artStyle === 'editorial' || d.artStyle === 'classic'){
        artStyle = d.artStyle;
        document.querySelectorAll('#styleSeg button').forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-style') === artStyle)); });
      }
      if (d.fotoFormat === '1:1' || d.fotoFormat === '9:16'){
        fotoFormat = d.fotoFormat;
        document.querySelectorAll('#formatSeg button').forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-format') === fotoFormat)); });
      }
      var urlModo = null;
      try { urlModo = new URLSearchParams(location.search).get('modo'); } catch (e) {}
      if (!urlModo && (d.mode === 'video' || d.mode === 'foto' || d.mode === 'autoedit')){
        mode = d.mode;
        document.querySelectorAll('#modeSeg button').forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode)); });
      }
      applyMode();
    }
    var vf = asFile(videoRec);
    if (vf) setVideoTabFile(vf, true);
    var ff = asFile(fotoRec);
    if (ff) loadPhotoFile(ff, true);
    if (vozRec && vozRec.blob) voiceSet(vozRec.blob, vozRec.name || 'locucao', null, true);
    render();
  } finally {
    draftRestoring = false;
  }
  var msg = 'Recuperamos o que você estava fazendo.';
  if (mode === 'autoedit') msg += ' Os vídeos da montagem precisam ser escolhidos de novo' + (vozRec ? ' (a locução ficou guardada).' : '.');
  el('draftMsg').textContent = msg;
  el('draftBar').hidden = false;
  track('rascunho_restaurado', { aba: mode, foto: !!fotoRec, video: !!videoRec, voz: !!vozRec });
}

el('draftDiscardBtn').addEventListener('click', function(){
  track('rascunho_descartado', {});
  evFlush(true);
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  idbOp('readwrite', function(st){ return st.clear(); }).then(function(){
    location.href = location.pathname;
  });
});


// ======================= prévia no celular (fixa no topo, dá pra esconder) =======================
function previewSetCollapsed(collapsed){
  el('previewWrap').classList.toggle('collapsed', collapsed);
  var b = el('previewToggleBtn');
  b.textContent = collapsed ? 'Mostrar prévia' : 'Esconder prévia';
  b.setAttribute('aria-expanded', String(!collapsed));
  if (!collapsed && mode === 'foto') requestAnimationFrame(updatePhotoTransform);
}
el('previewToggleBtn').addEventListener('click', function(){
  previewSetCollapsed(!el('previewWrap').classList.contains('collapsed'));
});


// ======================= início =======================
applyAnuncio('venda', false);
boot();
track('app_aberto', { aba: mode, largura: window.innerWidth });
draftRestore().catch(function(err){ console.error('[Studio Giovani] rascunho:', err); draftRestoring = false; });
