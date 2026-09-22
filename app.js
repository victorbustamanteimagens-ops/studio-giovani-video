// Studio Giovani — Vídeo
// Overlay transparente desenhado em canvas sobre o <video>; no export, o mesmo
// overlay é gerado como PNG estático e queimado no vídeo via ffmpeg (rodando
// no navegador, ffmpeg.wasm — sem servidor, sem custo).
"use strict";

var W = 1080, H = 1920;
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
var stageEl = document.getElementById('stage');
var emptyMsg = document.getElementById('emptyMsg');
var exportBtn = document.getElementById('exportBtn');

function el(id){ return document.getElementById(id); }

function readState(){
  return {
    variant: document.querySelector('#variantSeg button[aria-pressed="true"]').getAttribute('data-variant'),
    localizacao: { on: el('tg_localizacao').checked, value: el('localizacao').value.trim() },
    status:      { on: el('tg_status').checked, value: el('status').value.trim() },
    valor:       { on: el('tg_valor').checked, value: el('valor').value.trim() },
    area:        { on: el('tg_area').checked, value: el('area').value.trim() },
    quartos:     { on: el('tg_quartos').checked, value: el('quartos').value.trim() },
    vagas:       { on: el('tg_vagas').checked, value: el('vagas').value.trim() },
    destaque:    { on: el('tg_destaque').checked, value: el('destaque').value.trim() }
  };
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
  var maxW = opts.maxW || (W - x - 60);
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

function render(){
  var st = readState();
  ctx.clearRect(0, 0, W, H);

  var variantColors = st.variant === 'gold'
    ? { bg: GOLD, text: NAVY }
    : { bg: RED, text: CREAM };

  // --- crachá RE/MAX — fixo, canto superior direito ---
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

  // --- topo: tag de status + valor (caixas sólidas, cor de destaque) ---
  var topX = 64, topY = 150;
  var cursor = topY;
  if (st.status.on && st.status.value){
    cursor += drawSolidBox(ctx, topX, cursor, st.status.value.toUpperCase(), {
      fontSize: 54, weight: '800', family: 'Fraunces',
      bg: variantColors.bg, textColor: variantColors.text,
      letterSpacing: 1.5, padX: 30, padY: 18, radius: 4
    });
    cursor += 14;
  }
  if (st.valor.on && st.valor.value){
    drawSolidBox(ctx, topX, cursor, st.valor.value, {
      fontSize: 40, weight: '700', family: 'Fraunces',
      bg: variantColors.bg, textColor: variantColors.text,
      padX: 26, padY: 15, radius: 4
    });
  }

  // --- lista inferior: linhas ícone (glow) + caixa azul sólida com o dado ---
  var rows = [];
  if (st.localizacao.on && st.localizacao.value) rows.push({ icon: 'pin', label: st.localizacao.value });
  if (st.area.on && st.area.value) rows.push({ icon: 'area', label: st.area.value });
  if (st.quartos.on && st.quartos.value) rows.push({ icon: 'bed', label: st.quartos.value });
  if (st.vagas.on && st.vagas.value) rows.push({ icon: 'car', label: st.vagas.value });
  if (st.destaque.on && st.destaque.value) rows.push({ icon: 'star', label: st.destaque.value });

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

  // --- rodapé fixo: nome + CRECI (sempre visível, qualquer configuração) ---
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

['localizacao','status','valor','area','quartos','vagas','destaque'].forEach(function(key){
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

// --- upload de vídeo ---
var videoFile = null;
var videoObjectUrl = null;
var videoLoadGen = 0; // guarda contra o evento "change" disparando mais de
                       // uma vez pro mesmo upload (acontece em alguns fluxos
                       // automatizados/móveis) — sem isso, a resposta de uma
                       // chamada antiga podia "reativar" o botão de exportar
                       // mesmo com o vídeo ainda não carregado de verdade.
el('videoInput').addEventListener('change', function(e){
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  var myGen = ++videoLoadGen;
  videoFile = file;
  el('uploadFilename').textContent = file.name;
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
    emptyMsg.style.display = 'none';
    exportBtn.disabled = false;
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
});

function boot(){
  render();
  var families = ['700 30px "Work Sans"', '800 54px "Fraunces"', '700 40px "Fraunces"', '600 34px "Fraunces"'];
  Promise.all(families.map(function(f){
    try { return document.fonts.load(f); } catch(e){ return Promise.resolve(); }
  })).then(render).catch(function(){});
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// ======================= EXPORT (ffmpeg.wasm) =======================
var ffmpegInstance = null;
var statusEl = el('status');
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

async function loadFFmpeg(){
  if (ffmpegInstance) return ffmpegInstance;
  setStatus('Carregando o motor de vídeo (só na primeira vez)…');
  // Os arquivos da biblioteca em si (index.js/worker.js) precisam vir do
  // mesmo domínio do site: o navegador recusa criar um Worker a partir de
  // um script hospedado em outro domínio (erro de segurança), então em vez
  // de importar direto de um CDN, hospedamos uma cópia junto do site.
  var { FFmpeg } = await import('./vendor/ffmpeg-index-b2.js');
  var { toBlobURL } = await import('./vendor/util-index-b2.js');
  var ffmpeg = new FFmpeg();
  ffmpeg.on('progress', function(p){
    // p.progress às vezes vem >1 ou oscila em clipes curtos — trava em [0,1]
    var pct = Math.max(0, Math.min(1, p.progress || 0));
    setProgress(pct);
  });
  ffmpeg.on('log', function(l){ /* útil pra depurar no console, se precisar */ });
  // O worker roda como módulo ES (type:"module"), então precisa da build
  // "esm" do core (com "export default"), não da "umd" — a versão umd só
  // funciona carregada via importScripts em worker clássico e, se usada
  // aqui, o import() silenciosamente não acha o default export e a
  // biblioteca fica travada pra sempre "carregando o motor de vídeo".
  var baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(baseURL + '/ffmpeg-core.js', 'text/javascript'),
    wasmURL: await toBlobURL(baseURL + '/ffmpeg-core.wasm', 'application/wasm')
  });
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

function overlayPngBlob(){
  return new Promise(function(resolve){
    // o overlay já está desenhado no canvas visível (fundo transparente) —
    // basta exportar exatamente o que está na prévia.
    render();
    canvas.toBlob(function(blob){ resolve(blob); }, 'image/png');
  });
}

exportBtn.addEventListener('click', async function(){
  if (!videoFile) return;
  exportBtn.disabled = true;
  setProgress(null);
  try {
    setStatus('Preparando a arte…');
    var overlayBlob = await overlayPngBlob();
    var ffmpeg = await loadFFmpeg();

    setStatus('Enviando o vídeo pro processador…');
    setProgress(0);
    var videoBytes = new Uint8Array(await videoFile.arrayBuffer());
    var overlayBytes = new Uint8Array(await overlayBlob.arrayBuffer());
    await ffmpeg.writeFile('input.mp4', videoBytes);
    await ffmpeg.writeFile('overlay.png', overlayBytes);

    setStatus('Queimando a arte no vídeo…');
    var filter =
      '[0:v]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,' +
      'crop=' + W + ':' + H + ',setsar=1[bg];' +
      '[bg][1:v]overlay=0:0:format=auto[outv]';
    await ffmpeg.exec([
      '-i', 'input.mp4', '-i', 'overlay.png',
      '-filter_complex', filter,
      '-map', '[outv]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-movflags', '+faststart',
      'output.mp4'
    ]);

    setProgress(1);
    var data = await ffmpeg.readFile('output.mp4');
    var blob = new Blob([data.buffer], { type: 'video/mp4' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'giovani-' + (el('localizacao').value || 'imovel').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.mp4';
    document.body.appendChild(a);
    a.click();
    a.remove();
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
});
