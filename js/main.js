(function($){
  // ======= Tillstånd (tidiga deklarationer för att undvika "before initialization") =======
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  let drawing = false, eyedropper = false, snapToGrid = false;
  let showGrid = false, gridSize = 32, gridColor = "rgba(0,0,0,.08)";

  // Viktigt: currentStroke deklareras TIDIGT så redrawAll kan referera till den
  let currentStroke = null;

  // HiDPI & layout
  let viewW=0, viewH=0, dpr=Math.max(1, Math.min(2, window.devicePixelRatio||1));
  function fitCanvas(){
    const parent = canvas.parentElement; // .stage
    const topbarH = parent.querySelector(".topbar").getBoundingClientRect().height;
    const pr = parent.getBoundingClientRect();
    viewW = Math.floor(pr.width);
    viewH = Math.floor(pr.height - topbarH);
    canvas.style.width = viewW+"px";
    canvas.style.height = viewH+"px";
    canvas.width = Math.floor(viewW*dpr);
    canvas.height = Math.floor(viewH*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    redrawAll();
  }

  // ======= Lager =======
  let layers = [];
  let currentLayer = 0;

  // ======= UI-referenser (tidigt, innan addLayer anropas) =======
  const $toolBadge=$("#toolBadge");
  const $layerBadge=$("#layerBadge");
  const $status=$("#status");

  // ======= Penselinställningar =======
  let tool="pen", color="#1f2937", size=10, alpha=1, fillEnabled=false, fillTolerance = 20;

  function setStatus(msg){ $status.text(msg); }
  function toolName(t){ return {pen:"Penna", marker:"Marker", spray:"Spray", highlighter:"Överstrykn.", eraser:"Sudd", line:"Linje", rect:"Rektangel", ellipse:"Cirkel", fill:"Fyll"}[t]||t; }
  function setTool(t){ tool=t; $toolBadge.text(toolName(t)); $(".btn[data-tool]").removeClass("primary"); $(`.btn[data-tool="${t}"]`).addClass("primary"); setStatus(`Verktyg: ${toolName(t)}`); }
  function setColor(c){ color=c; $("#colorPicker").val(c); setStatus(`Färg: ${c}`); }
  function setSize(px){ size=Math.max(1, Math.min(60, px|0)); $("#sizeVal").text(size+" px"); }
  function setAlpha(a){ alpha = Math.max(0.05, Math.min(1, +a)); $("#alphaVal").text(Math.round(alpha*100)+"%"); }
  function toggleFill(){ fillEnabled=!fillEnabled; $("#fillToggle").text("Fyll: "+(fillEnabled?"På":"Av")); }
  function updateBadges(){ $layerBadge.text(layers[currentLayer]?.name||"-"); }

  // ======= Lager-funktioner =======
  function addLayer(name){
    layers.push({name: name || `Lager ${layers.length+1}`, visible:true, strokes:[]});
    currentLayer = layers.length-1;
    renderLayers();
    updateBadges();
    redrawAll();
  }
  function removeLayerAt(idx){
    if (layers.length<=1) return;
    layers.splice(idx,1);
    currentLayer = Math.max(0, currentLayer-1);
    renderLayers();
    updateBadges();
    redrawAll();
  }

  // Startlager skapas EFTER att UI-referenserna finns
  addLayer("Lager 1");

  // ======= Init penna =======
  setTool("pen"); setColor("#1f2937"); setSize(10); setAlpha(1); updateBadges();

  // ======= Swatches =======
  const PRESETS=["#000000","#1f2937","#6b7280","#9ca3af","#d1d5db","#ffffff","#ef4444","#f59e0b","#fbbf24","#22c55e","#10b981","#06b6d4","#3b82f6","#8b5cf6"];
  function renderSwatches(){ const $s=$("#swatches").empty(); PRESETS.forEach(hex=>$s.append($('<div class="swatch">').css("background",hex).attr("data-hex",hex))); }
  renderSwatches();

  // ======= UI händelser =======
  $("#swatches").on("click",".swatch",function(){ if(tool==="eraser") setTool("pen"); setColor($(this).data("hex")); });
  $("#colorPicker").on("input change", function(){ if(tool==="eraser") setTool("pen"); setColor(this.value); });
  $("#size").on("input", function(){ setSize(+this.value); });
  $("#alpha").on("input", function(){ setAlpha(+this.value); redrawAll(); });
  $("#eyedrop").on("click", ()=>{ eyedropper=!eyedropper; $("#eyedrop").toggleClass("primary", eyedropper); setStatus(eyedropper?"Pipett: klicka på ritytan.":"Pipett av."); });
  $("#fillToggle").on("click", toggleFill);
  $(".btn[data-tool]").on("click", function(){ setTool($(this).data("tool")); });
  //$("#toggleSnap").on("click", function(){ snapToGrid=!snapToGrid; $(this).toggleClass("primary", snapToGrid); $(this).text("🔳 Snappa: "+(snapToGrid?"På":"Av")); });
  $("#toggleSnap").on("click", function(){ snapToGrid = !snapToGrid; $(this).toggleClass("primary", snapToGrid); $(this).find(".txt").text("Snappa: " + (snapToGrid ? "På" : "Av")); });

  // Lager UI
  function renderLayers(){
    const $list=$("#layers").empty();
    layers.forEach((L,idx)=>{
      const $row=$(`
        <div class="layerItem ${idx===currentLayer?'active':''}" data-idx="${idx}">
          <span class="toggle">${L.visible?'👁️':'🙈'}</span>
          <span class="layerName" contenteditable="true">${L.name}</span>
          <span class="btn up">↑</span>
          <span class="btn down">↓</span>
        </div>`);
      $list.append($row);
    });
  }
  $("#layers").on("click",".layerItem", function(e){
    if ($(e.target).hasClass("up") || $(e.target).hasClass("down") || $(e.target).hasClass("toggle")) return;
    currentLayer = +$(this).data("idx");
    renderLayers(); updateBadges(); redrawAll();
  });
  $("#layers").on("click",".toggle", function(e){
    const idx=+$(this).closest(".layerItem").data("idx");
    layers[idx].visible=!layers[idx].visible;
    renderLayers(); redrawAll();
  });
  $("#layers").on("click",".up", function(){
    const idx=+$(this).closest(".layerItem").data("idx");
    if (idx<=0) return;
    const tmp=layers[idx-1]; layers[idx-1]=layers[idx]; layers[idx]=tmp;
    if (currentLayer===idx) currentLayer=idx-1; else if (currentLayer===idx-1) currentLayer=idx;
    renderLayers(); updateBadges(); redrawAll();
  });
  $("#layers").on("click",".down", function(){
    const idx=+$(this).closest(".layerItem").data("idx");
    if (idx>=layers.length-1) return;
    const tmp=layers[idx+1]; layers[idx+1]=layers[idx]; layers[idx]=tmp;
    if (currentLayer===idx) currentLayer=idx+1; else if (currentLayer===idx+1) currentLayer=idx;
    renderLayers(); updateBadges(); redrawAll();
  });
  $("#layers").on("input",".layerName", function(){
    const idx=+$(this).closest(".layerItem").data("idx");
    layers[idx].name = $(this).text().trim() || `Lager ${idx+1}`;
    updateBadges();
  });
  $("#addLayer").on("click", ()=>addLayer());
  $("#removeLayer").on("click", ()=>removeLayerAt(currentLayer));

  // Rutnät
  $("#toggleGrid").on("click", function(){ showGrid=!showGrid; $(this).toggleClass("primary",showGrid).text(showGrid?"Dölj rutnät":"Visa rutnät"); redrawAll(); });
  $("#gridSize").on("input", function(){ gridSize=+this.value; $("#gridSizeVal").text(gridSize+" px"); redrawAll(); });
  $("#gridColorBtn").on("click", function(){
    const options=["rgba(0,0,0,.08)","rgba(0,0,0,.15)","rgba(59,130,246,.12)","rgba(34,197,94,.12)"];
    const i=(options.indexOf(gridColor)+1)%options.length;
    gridColor=options[i]; redrawAll();
  });

  // Åtgärder
  const redoStack=[];
  $("#undo").on("click", undo);
  $("#redo").on("click", redo);
  //$("#clear").on("click", function(){ const L=layers[currentLayer]; if(!L) return; L.strokes.length=0; redrawAll(); setStatus("Rensade aktuellt lager."); });
  $("#savePNG").on("click", savePNG);
  //$("#saveSVG").on("click", saveSVG);

  $("#clear").on("click", function(){
    const L = layers[currentLayer];
    if (!L) return;

    if (L.strokes.length === 0) {
      setStatus("Lagret är redan tomt.");
      return;
    }

    if (!confirm("Är du säker på att du vill rensa detta lager? Det går inte att ångra.")) {
      setStatus("Rensning avbruten.");
      return;
    }

    L.strokes.length = 0;
    redrawAll();
    setStatus("Rensade aktuellt lager.");
  });

  $("#fillTol").on("input", function(){
    fillTolerance = +this.value;
    $("#fillTolVal").text(fillTolerance);
  });

  $(window).off("keydown").on("keydown", function(e){
    // Undvik att stjäla tangenter när fokus är i inmatningsfält eller contenteditable
    const tag = (e.target.tagName || "").toUpperCase();
    const isEditable = e.target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (isEditable) return;

    const key = (e.key || "").toLowerCase();

    // Undo/Redo med Ctrl/Cmd
    if (e.ctrlKey || e.metaKey) {
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); redo(); return; }
      return; // andra Ctrl/Cmd-kombos lämnar vi ifred
    }

    // Verktygsgenvägar (utan modifierare)
    switch (key) {
      case "b": // Penna
        setTool("pen"); e.preventDefault(); break;
      case "f": // Fyll
        setTool("fill"); e.preventDefault(); break;
      case "l": // Linje
        setTool("line"); e.preventDefault(); break;
      case "r": // Rektangel
        setTool("rect"); e.preventDefault(); break;
      case "o": // Cirkel/Ellips
        setTool("ellipse"); e.preventDefault(); break;
      case "e": // Sudd
        setTool("eraser"); e.preventDefault(); break;
      default:
        // inget
    }
  });

  // ======= Ritlogik =======
  function canvasPos(ev){
    const rect=canvas.getBoundingClientRect();
    let x,y;
    if (ev.touches&&ev.touches[0]){ x=ev.touches[0].clientX-rect.left; y=ev.touches[0].clientY-rect.top; }
    else { x=ev.clientX-rect.left; y=ev.clientY-rect.top; }
    if (snapToGrid && (tool==="line"||tool==="rect"||tool==="ellipse")){
      x = Math.round(x/gridSize)*gridSize;
      y = Math.round(y/gridSize)*gridSize;
    }
    return {xN: x/viewW, yN: y/viewH, x, y};
  }

  function toolExtra(t){
    if (t==="marker") return {alpha:0.35};
    if (t==="highlighter") return {alpha:0.25, composite:"multiply"};
    //if (t==="spray") return {spacing:4, density:20};
    if (t==="spray") return {spacing:4, density:20, dots:[]};
    if (t==="eraser") return {composite:"destination-out"};
    return {};
  }

  function down(ev){
    ev.preventDefault();
    const p = canvasPos(ev);

    if (eyedropper){
      const rgba = ctx.getImageData(Math.round(p.x*dpr), Math.round(p.y*dpr), 1, 1).data;
      const hex = rgbToHex(rgba[0],rgba[1],rgba[2]);
      setColor(hex); eyedropper=false; $("#eyedrop").removeClass("primary"); return;
    }

    // if (tool === "fill") {
    //   redoStack.length = 0;
    //   const L = layers[currentLayer];
    //   if (L){
    //     L.strokes.push({
    //       type: "fill",
    //       layer: currentLayer,
    //       xN: p.xN, yN: p.yN,
    //       color, alpha,
    //       tol: fillTolerance
    //     });
    //     redrawAll();
    //   }
    //   return; // inte gå vidare till freehand/shape
    // }

    if (tool === "fill") {
      const L = layers[currentLayer];
      if (L) {
        L.strokes.push({ type: "fill", layer: currentLayer, xN: p.xN, yN: p.yN, color, alpha, tol: fillTolerance });
        setTimeout(redrawAll, 50); // <--- låter webbläsaren andas
      }
      return;
    }

    drawing = true; redoStack.length=0;

    if (tool==="line" || tool==="rect" || tool==="ellipse"){
      currentStroke = {
        type:"shape", layer: currentLayer,
        shape: tool, color, size, alpha,
        fill: fillEnabled,
        x1N:p.xN, y1N:p.yN, x2N:p.xN, y2N:p.yN,
      };
    } else {
      currentStroke = {
        type:"free", layer: currentLayer,
        tool, color, size, alpha,
        extra: toolExtra(tool),
        points: [ {xN:p.xN, yN:p.yN} ]
      };

      // NYTT: initiera sprayens senaste punkt & ackumulator (i pixelvärden)
      if (tool === "spray") {
        currentStroke.extra._last = { x: p.x, y: p.y, acc: 0 };
        currentStroke.extra.dots = []; // börja tom
      }
    }
    redrawAll();
  }

  function move(ev){
    if(!drawing || !currentStroke) return;
    ev.preventDefault();
    const p = canvasPos(ev);

    if (currentStroke.type==="shape"){
      let x2=p.xN, y2=p.yN;
      if (ev.shiftKey && (currentStroke.shape==="rect" || currentStroke.shape==="ellipse")){
        const dx = (x2 - currentStroke.x1N)*viewW;
        const dy = (y2 - currentStroke.y1N)*viewH;
        const m = Math.sign(dx)*(Math.abs(dx)>Math.abs(dy)?Math.abs(dy):Math.abs(dx));
        const n = Math.sign(dy)*(Math.abs(dx)>Math.abs(dy)?Math.abs(dy):Math.abs(dx));
        x2 = currentStroke.x1N + m/viewW;
        y2 = currentStroke.y1N + n/viewH;
      }
      currentStroke.x2N=x2; currentStroke.y2N=y2;
    } else {
      currentStroke.points.push({xN:p.xN, yN:p.yN});

      // NYTT: bygg spraypunkter löpande
      if (currentStroke.tool === "spray") {
        const extra = currentStroke.extra;
        const last = extra._last || { x: p.x, y: p.y, acc: 0 };
        const dx = p.x - last.x, dy = p.y - last.y;
        const segLen = Math.hypot(dx, dy);
        const spacing = extra.spacing ?? 4;
        const density = extra.density ?? 20;
        let acc = last.acc || 0;

        // gå fram med "spacing"-steg längs segmentet och lägg prickar
        while (acc <= segLen) {
          const t = segLen === 0 ? 0 : acc / segLen;
          const bx = last.x + dx * t;
          const by = last.y + dy * t;

          for (let k = 0; k < density; k++) {
            const ang = Math.random() * Math.PI * 2;
            const r = Math.random() * currentStroke.size;
            const px = bx + Math.cos(ang) * r;
            const py = by + Math.sin(ang) * r;
            // spara NORMALISERAT så sprayen skalar snyggt vid resize
            extra.dots.push({ xN: px / viewW, yN: py / viewH });
          }
          acc += spacing;
        }
        // spara “reststräcka” till nästa move
        extra._last = { x: p.x, y: p.y, acc: acc - segLen };
      }
    }
    redrawAll();
  }

  function up(ev){
    if (!drawing) return;
    drawing=false;
    if (!currentStroke) return;

    const L = layers[currentLayer];
    if (L){
      if (currentStroke.type==="free" && currentStroke.points.length<2){
        currentStroke=null; redrawAll(); return;
      }
      L.strokes.push(currentStroke);
    }
    currentStroke=null;
    redrawAll();
  }

  canvas.addEventListener("mousedown", down);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", up);
  canvas.addEventListener("mouseleave", up);
  canvas.addEventListener("touchstart", down, {passive:false});
  canvas.addEventListener("touchmove", move, {passive:false});
  canvas.addEventListener("touchend", up);

  // ======= Rendering =======
  function redrawAll(){
    // vit bakgrund
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,viewW,viewH);

    if (showGrid) drawGrid();

    layers.forEach((L,idx)=>{
      if (!L.visible) return;
      for (const s of L.strokes) drawStroke(ctx, s);
    });
    if (currentStroke){
      drawStroke(ctx, currentStroke, true);
    }
  }

  function drawGrid(){
    ctx.save();
    ctx.globalAlpha=1;
    ctx.strokeStyle=gridColor;
    ctx.lineWidth=1;
    ctx.beginPath();
    for (let x=0; x<=viewW; x+=gridSize){ ctx.moveTo(x,0); ctx.lineTo(x,viewH); }
    for (let y=0; y<=viewH; y+=gridSize){ ctx.moveTo(0,y); ctx.lineTo(viewW,y); }
    ctx.stroke();
    ctx.restore();
  }

  function drawStroke(target, s, isPreview=false){
    target.save();
    target.lineJoin="round"; target.lineCap="round"; target.lineWidth=s.size;
    target.globalAlpha = s.alpha ?? 1;
    target.globalCompositeOperation="source-over";
    target.strokeStyle = s.color;
    target.fillStyle = s.color;

    if (s.type==="free"){
      if (s.tool === "spray") {
        const dots = s.extra?.dots || [];
        target.globalAlpha = s.alpha ?? 0.6;
        target.fillStyle = s.color;
        const rr = Math.max(0.6, s.size * 0.05); // liten standardradie för prickarna
        for (const d of dots) {
          const x = d.xN * viewW, y = d.yN * viewH;
          target.beginPath();
          target.arc(x, y, rr, 0, Math.PI * 2);
          target.fill();
        }
      } else {
        // standard
        let gAlpha = (s.alpha ?? 1);

        // verktygsspecifika kompositioner/”tak”
        if (s.tool === "eraser") {
          target.globalCompositeOperation = "destination-out";
          gAlpha = 1;
          target.strokeStyle = "rgba(0,0,0,1)";
        } else if (s.tool === "highlighter") {
          target.globalCompositeOperation = "multiply";
          const cap = (s.extra && typeof s.extra.alpha === "number") ? s.extra.alpha : 0.25;
          gAlpha = Math.min(gAlpha, cap);
        } else if (s.tool === "marker") {
          const cap = (s.extra && typeof s.extra.alpha === "number") ? s.extra.alpha : 0.35;
          gAlpha = Math.min(gAlpha, cap);
        }

        target.globalAlpha = gAlpha;

        const pts = denorm(s.points);
        if (pts.length>1){
          target.beginPath(); target.moveTo(pts[0].x, pts[0].y);
          for (let i=1;i<pts.length;i++) target.lineTo(pts[i].x, pts[i].y);
          target.stroke();
        }
      }
    } else if (s.type === "fill") {
      // Kör flood-fill på aktuell bitmap vid denna punkt
      const sx = Math.floor(s.xN * viewW * dpr);
      const sy = Math.floor(s.yN * viewH * dpr);
      floodFillRGBA(target, sx, sy, s.color, s.alpha ?? 1, s.tol ?? 20);
    } else if (s.type==="shape"){
      const x1=s.x1N*viewW, y1=s.y1N*viewH, x2=s.x2N*viewW, y2=s.y2N*viewH;
      const left=Math.min(x1,x2), top=Math.min(y1,y2), w=Math.abs(x2-x1), h=Math.abs(y2-y1);
      if (s.shape==="line"){
        target.beginPath(); target.moveTo(x1,y1); target.lineTo(x2,y2); target.stroke();
      } else if (s.shape==="rect"){
        if (s.fill){ target.globalAlpha=(s.alpha??1); target.fillStyle=s.color; target.fillRect(left,top,w,h); }
        target.globalAlpha=(s.alpha??1); target.strokeRect(left,top,w,h);
      } else if (s.shape==="ellipse"){
        target.beginPath();
        target.ellipse(left+w/2, top+h/2, Math.max(0.5,w/2), Math.max(0.5,h/2), 0, 0, Math.PI*2);
        if (s.fill){ target.fill(); }
        target.stroke();
      }
    }

    target.restore();

    function denorm(arr){ return arr.map(p=>({x:p.xN*viewW, y:p.yN*viewH})); }
  }

  function sprayDot(target,cx,cy, radius, n, colorHex, a=0.6){
    target.save();
    target.globalCompositeOperation="source-over";
    target.globalAlpha = a ?? 0.6;
    target.fillStyle = colorHex;
    for(let i=0;i<n;i++){
      const ang=Math.random()*Math.PI*2, r=Math.random()*radius;
      const x=cx+Math.cos(ang)*r, y=cy+Math.sin(ang)*r;
      target.beginPath();
      target.arc(x,y, Math.max(0.6, radius*0.05*Math.random()*1.2), 0, Math.PI*2);
      target.fill();
    }
    target.restore();
  }

  function floodFillRGBA(ctx2d, sx, sy, hex, aNew, tol){
    const w = ctx2d.canvas.width, h = ctx2d.canvas.height;
    if (sx<0||sy<0||sx>=w||sy>=h) return;

    // Läs hela bilden en gång
    const img = ctx2d.getImageData(0,0,w,h);
    const data = img.data;

    const idx = (sy*w + sx)*4;
    const sr = data[idx], sg = data[idx+1], sb = data[idx+2], sa = data[idx+3];

    // Om målfärgen (överlagrad) praktiskt taget matchar redan – skippa
    const {r:tr,g:tg,b:tb} = hexToRgb(hex);

    // Jämförelsefunktion: skillnad mot seed
    const within = (i)=>{
      const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
      // jämför bara RGB, ignorera alpha i seed (stabilare mot tidigare fyllningar)
      return (Math.abs(r-sr) + Math.abs(g-sg) + Math.abs(b-sb)) <= tol*3;
    };

    // Om fill skulle vara exakt samma som seed vid aNew=1, kan vi hoppa, annars kör.
    // (Vi låter fyll ske ändå om alpha<1 för att tonas in)
    const stack = [sx, sy];
    const visited = new Uint8Array(w*h); // 1 byte/pixel

    // Preppa blandning
    const aFill = Math.max(0, Math.min(1, aNew));
    function blendAt(i){
      const r0=data[i], g0=data[i+1], b0=data[i+2], a0=data[i+3]/255;
      const ao = aFill + a0*(1-aFill);
      const r = Math.round((tr*aFill + r0*a0*(1-aFill)) / (ao || 1));
      const g = Math.round((tg*aFill + g0*a0*(1-aFill)) / (ao || 1));
      const b = Math.round((tb*aFill + b0*a0*(1-aFill)) / (ao || 1));
      data[i]   = r;
      data[i+1] = g;
      data[i+2] = b;
      data[i+3] = Math.round(ao*255);
    }

    while (stack.length){
      const y = stack.pop();
      const x = stack.pop();
      let xi = x, i = (y*w + xi)*4;

      // skanna vänster
      while (xi>=0 && !visited[y*w+xi] && within(i)){
        visited[y*w+xi]=1;
        blendAt(i);
        xi--; i-=4;
      }
      const left = xi+1;

      // skanna höger
      xi = x+1; i = (y*w + xi)*4;
      while (xi<w && !visited[y*w+xi] && within(i)){
        visited[y*w+xi]=1;
        blendAt(i);
        xi++; i+=4;
      }
      const right = xi-1;

      // lägg upp och ner mellan left..right
      for (let xx=left; xx<=right; xx++){
        const upY = y-1, downY = y+1;
        if (upY>=0){
          const ii = (upY*w + xx)*4;
          if (!visited[upY*w+xx] && within(ii)) { stack.push(xx, upY); }
        }
        if (downY<h){
          const ii = (downY*w + xx)*4;
          if (!visited[downY*w+xx] && within(ii)) { stack.push(xx, downY); }
        }
      }
    }

    ctx2d.putImageData(img, 0, 0);
  }

  function hexToRgb(hex){
    const h = hex.replace("#","").trim();
    const n = h.length===3 ? h.split("").map(c=>c+c).join("") : h;
    const num = parseInt(n,16);
    return { r:(num>>16)&255, g:(num>>8)&255, b:num&255 };
  }

  // ======= Undo/Redo =======
  function undo(){
    const L=layers[currentLayer]; if(!L) return;
    if (!L.strokes.length) return;
    redoStack.push(L.strokes.pop());
    redrawAll(); setStatus("Ångrade.");
  }
  function redo(){
    const L=layers[currentLayer]; if(!L) return;
    if (!redoStack.length) return;
    L.strokes.push(redoStack.pop());
    redrawAll(); setStatus("Gjorde om.");
  }

  // ======= Export =======
  function savePNG(){
    const exportCanvas=document.createElement("canvas");
    exportCanvas.width=Math.round(viewW*dpr);
    exportCanvas.height=Math.round(viewH*dpr);
    const ex=exportCanvas.getContext("2d");
    ex.setTransform(dpr,0,0,dpr,0,0);
    ex.fillStyle="#ffffff"; ex.fillRect(0,0,viewW,viewH);
    layers.forEach(L=>{
      if(!L.visible) return;
      for(const s of L.strokes){ drawStroke(ex, s); }
    });
    const url=exportCanvas.toDataURL("image/png");
    const a=document.createElement("a"); a.href=url; a.download=`ritning_${Date.now()}.png`; document.body.appendChild(a); a.click(); a.remove();
    setStatus("PNG sparad.");
  }

  // function saveSVG(){
  //   const W = viewW, H = viewH;
  //
  //   // 1) Finns det några fill-strokes?
  //   const hasFill = layers.some(L => L.visible && L.strokes.some(s => s.type === "fill"));
  //
  //   // 2) Om fill finns: rasterisera hela teckningen och bädda in som <image> i SVG.
  //   if (hasFill) {
  //     // Rendera precis som i savePNG()
  //     const exportCanvas = document.createElement("canvas");
  //     exportCanvas.width  = Math.round(W * dpr);
  //     exportCanvas.height = Math.round(H * dpr);
  //     const ex = exportCanvas.getContext("2d");
  //     ex.setTransform(dpr,0,0,dpr,0,0);
  //     ex.fillStyle = "#ffffff";
  //     ex.fillRect(0,0,W,H);
  //
  //     // rita ALLT (inkl. fill) i rätt ordning
  //     layers.forEach(L=>{
  //       if (!L.visible) return;
  //       for (const s of L.strokes) drawStroke(ex, s);
  //     });
  //
  //     // Gör PNG-data-URL och bädda in den i en minimal SVG
  //     const dataURL = exportCanvas.toDataURL("image/png");
  //     const svg = `
  // <?xml version="1.0" encoding="UTF-8"?>
  // <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  //   <image x="0" y="0" width="${W}" height="${H}" href="${dataURL}" />
  // </svg>`.trim();
  //
  //     const blob = new Blob([svg], {type:"image/svg+xml;charset=utf-8"});
  //     const url = URL.createObjectURL(blob);
  //     const a=document.createElement("a"); a.href=url; a.download=`ritning_${Date.now()}.svg`;
  //     document.body.appendChild(a); a.click(); a.remove();
  //     setTimeout(()=>URL.revokeObjectURL(url), 1000);
  //     setStatus("SVG exporterad (fyll inbäddad som raster).");
  //     return;
  //   }
  //
  //   // 3) Annars: exportera som ren vektor (din befintliga logik)
  //   let svg = [];
  //   svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  //   svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  //   svg.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  //
  //   const esc = s => String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
  //   const pathFromPts = (pts) => {
  //     if (!pts.length) return "";
  //     let d = `M ${pts[0].x} ${pts[0].y}`;
  //     for (let i=1;i<pts.length;i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  //     return d;
  //   };
  //
  //   layers.forEach(L=>{
  //     if(!L.visible) return;
  //     svg.push(`<g data-layer="${esc(L.name)}">`);
  //     for (const s of L.strokes) {
  //       // (ingen fill här, för ren vektor-export)
  //       if (s.type==="free"){
  //         if (s.tool === "spray"){
  //           const dots = s.extra?.dots || [];
  //           const opacity = s.alpha ?? 0.6;
  //           for (const d of dots) {
  //             const x = d.xN * W, y = d.yN * H;
  //             const rr = Math.max(0.6, (s.size * (d.f ?? 0.05)));
  //             svg.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rr.toFixed(2)}" fill="${esc(s.color)}" fill-opacity="${opacity}"/>`);
  //           }
  //         } else if (s.tool === "charcoal"){
  //           const pts = s.points.map(p=>({x:p.xN*W, y:p.yN*H}));
  //           let opacity = Math.min(s.alpha ?? 0.4, 0.4);
  //           for (let i=1;i<pts.length;i++){
  //             const a=pts[i-1], b=pts[i];
  //             const dx=b.x-a.x, dy=b.y-a.y;
  //             const len=Math.hypot(dx,dy);
  //             const steps = Math.max(1, Math.ceil(len/2));
  //             for (let j=0;j<steps;j++){
  //               const t = j/steps;
  //               const x = a.x + dx*t + (Math.random()-0.5)*(s.extra?.jitter ?? 2);
  //               const y = a.y + dy*t + (Math.random()-0.5)*(s.extra?.jitter ?? 2);
  //               const rr = Math.max(0.8, s.size*0.22);
  //               svg.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rr.toFixed(2)}" fill="${esc(s.color)}" fill-opacity="${opacity}"/>`);
  //             }
  //           }
  //         } else if (s.tool === "ink"){
  //           const pts = s.points.map(p=>({x:p.xN*W,y:p.yN*H}));
  //           if (pts.length>1){
  //             let d = pathFromPts(pts);
  //             svg.push(`<path d="${d}" fill="none" stroke="${esc(s.color)}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${s.alpha ?? 1}"/>`);
  //           }
  //         } else if (s.tool === "watercolor"){
  //           const pts = s.points.map(p=>({x:p.xN*W,y:p.yN*H}));
  //           if (pts.length>1){
  //             let d = pathFromPts(pts);
  //             const opacity = Math.min(s.alpha ?? 0.2, 0.2);
  //             svg.push(`<path d="${d}" fill="none" stroke="${esc(s.color)}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${opacity}"/>`);
  //           }
  //         } else {
  //           // pen/marker/highlighter/eraser default
  //           const pts = s.points.map(p=>({x:p.xN*W,y:p.yN*H}));
  //           if (pts.length<2) continue;
  //           let stroke = s.color;
  //           let opacity = (s.alpha ?? 1);
  //           if (s.tool==="marker") opacity = Math.min(opacity, 0.35);
  //           if (s.tool==="highlighter") opacity = Math.min(opacity, 0.25);
  //           if (s.tool==="eraser"){ stroke="#ffffff"; opacity=1; }
  //           const d = pathFromPts(pts);
  //           svg.push(`<path d="${d}" fill="none" stroke="${esc(stroke)}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${opacity}"/>`);
  //         }
  //       } else if (s.type==="shape"){
  //         const x1=s.x1N*W, y1=s.y1N*H, x2=s.x2N*W, y2=s.y2N*H;
  //         const left=Math.min(x1,x2), top=Math.min(y1,y2), w=Math.abs(x2-x1), h=Math.abs(y2-y1);
  //         const stroke=esc(s.color), sw=s.size, opacity=(s.alpha??1), fill = s.fill? esc(s.color) : "none", fillOpacity=(s.fill ? (s.alpha??1) : 0);
  //         if (s.shape==="line"){
  //           svg.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-opacity="${opacity}"/>`);
  //         } else if (s.shape==="rect"){
  //           svg.push(`<rect x="${left}" y="${top}" width="${w}" height="${h}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${sw}" stroke-opacity="${opacity}"/>`);
  //         } else if (s.shape==="ellipse"){
  //           svg.push(`<ellipse cx="${left+w/2}" cy="${top+h/2}" rx="${Math.max(0.5,w/2)}" ry="${Math.max(0.5,h/2)}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${sw}" stroke-opacity="${opacity}"/>`);
  //         }
  //       }
  //     }
  //     svg.push(`</g>`);
  //   });
  //   svg.push(`</svg>`);
  //
  //   const blob = new Blob([svg.join("\n")], {type:"image/svg+xml;charset=utf-8"});
  //   const url = URL.createObjectURL(blob);
  //   const a=document.createElement("a"); a.href=url; a.download=`ritning_${Date.now()}.svg`;
  //   document.body.appendChild(a); a.click(); a.remove();
  //   setTimeout(()=>URL.revokeObjectURL(url), 1000);
  //   setStatus("SVG exporterad.");
  // }

  // ======= Hjälp =======
  function rgbToHex(r,g,b){ return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join(""); }

  // ======= Starta layout EFTER allt är deklarerat =======
  window.addEventListener("resize", ()=>{ dpr=Math.max(1, Math.min(2, window.devicePixelRatio||1)); fitCanvas(); });
  setTimeout(fitCanvas,0);
})(jQuery);
