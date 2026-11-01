// 指板画法对照原型：纯静态渲染，用来选视觉方案，不参与正式构建。
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  var COLOR = {
    bg: "#0b0f14",
    border: "#30363d",
    wire: "#3d444d",
    nut: "#6b7280",
    text: "#e6edf3",
    muted: "#8b949e",
    accent: "#e8b04b",
    blue: "#58a6ff",
    green: "#3fb950",
    orange: "#d29922",
    red: "#f85149",
    inlay: "#30363d",
  };

  // index 0 = 1 弦（高音 e），数值是 MIDI
  var TUNING = [64, 59, 55, 50, 45, 40];
  var STRING_LABELS = ["e", "B", "G", "D", "A", "E"];

  var FIXED_SOLFEGE = ["do", "#do", "re", "bmi", "mi", "fa", "#fa", "sol", "#sol", "la", "bsi", "si"];
  var MAJOR_DEGREE = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
  var SOLFEGE = ["do", "re", "mi", "fa", "sol", "la", "si"];
  var JIANPU = ["1", "2", "3", "4", "5", "6", "7"];
  var MOVABLE_CHROMATIC = { 1: "#do", 3: "#re", 6: "#fa", 8: "#sol", 10: "#la" };
  var JIANPU_CHROMATIC = { 1: "#1", 3: "#2", 6: "#4", 8: "#5", 10: "#6" };

  // 两个场景里用到的调内音名（按调号拼写，F 大调是 Bb 不是 A#）
  var KEY_NAMES = {
    C: { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B" },
    F: { 5: "F", 7: "G", 9: "A", 10: "Bb", 0: "C", 2: "D", 4: "E" },
  };
  var KEY_TONIC = { C: 0, F: 5 };

  function movableOf(pc, tonic) {
    var diff = ((pc - tonic) % 12 + 12) % 12;
    if (MAJOR_DEGREE[diff] !== undefined) return SOLFEGE[MAJOR_DEGREE[diff]];
    return MOVABLE_CHROMATIC[diff] || "";
  }

  function jianpuOf(pc, tonic) {
    var diff = ((pc - tonic) % 12 + 12) % 12;
    if (MAJOR_DEGREE[diff] !== undefined) return JIANPU[MAJOR_DEGREE[diff]];
    return JIANPU_CHROMATIC[diff] || "";
  }

  function buildScaleScenario() {
    var key = "C";
    var cells = [];
    for (var s = 0; s < 6; s++) {
      for (var f = 0; f <= 12; f++) {
        var pc = ((TUNING[s] + f) % 12 + 12) % 12;
        var name = KEY_NAMES[key][pc];
        if (!name) continue;
        cells.push({ s: s, f: f, pc: pc, state: pc === KEY_TONIC[key] ? "root" : "scale", text: name });
      }
    }
    return {
      title: "音阶页 · C 大调 · 0–12 品",
      keyId: key,
      tonic: KEY_TONIC[key],
      fretMin: 0,
      fretMax: 12,
      cells: cells,
    };
  }

  // 游戏页：F 大调 1–7 品，部分给定、部分待填，外加几种判定状态
  var GAME_OVERRIDES = {
    "0:1": { state: "given" },
    "0:3": { state: "given" },
    "1:1": { state: "given" },
    "2:2": { state: "given" },
    "3:3": { state: "given" },
    "4:1": { state: "given" },
    "5:3": { state: "given" },
    "0:6": { state: "correct" },
    "1:5": { state: "filled", text: "E" },
    "2:4": { state: "spelling", text: "A#" },
    "3:5": { state: "wrong", text: "A" },
    "4:5": { state: "correct" },
    "5:5": { state: "wrong", text: "C" },
    "1:3": { state: "empty" },
  };

  function buildGameScenario() {
    var key = "F";
    var cells = [];
    for (var s = 0; s < 6; s++) {
      for (var f = 1; f <= 7; f++) {
        var pc = ((TUNING[s] + f) % 12 + 12) % 12;
        var name = KEY_NAMES[key][pc];
        if (!name) continue;
        var override = GAME_OVERRIDES[s + ":" + f];
        cells.push({
          s: s,
          f: f,
          pc: pc,
          state: override ? override.state : "target",
          text: (override && override.text) || name,
          expected: name,
        });
      }
    }
    return {
      title: "游戏页 · L21 · F 大调 · 1–7 品",
      keyId: key,
      tonic: KEY_TONIC[key],
      fretMin: 1,
      fretMax: 7,
      cells: cells,
    };
  }

  var SCENARIOS = { scale: buildScaleScenario(), game: buildGameScenario() };

  function el(tag, attrs, text) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
      }
    }
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function stateStyle(state) {
    switch (state) {
      case "given":
        return { fill: "#21262d", stroke: "#3d444d", color: "#c9d1d9", dash: null };
      case "target":
        return { fill: "transparent", stroke: "#4b5563", color: COLOR.muted, dash: "3 3" };
      case "filled":
        return { fill: "rgba(88,166,255,0.15)", stroke: "rgba(88,166,255,0.55)", color: "#9ecbff", dash: null };
      case "correct":
        return { fill: "rgba(63,185,80,0.20)", stroke: COLOR.green, color: "#7ee787", dash: null };
      case "spelling":
        return { fill: "rgba(210,153,34,0.20)", stroke: COLOR.orange, color: "#e3b341", dash: null };
      case "wrong":
        return { fill: "rgba(248,81,73,0.20)", stroke: COLOR.red, color: "#ff7b72", dash: null };
      case "empty":
        return { fill: "transparent", stroke: "rgba(248,81,73,0.55)", color: "#ff7b72", dash: "4 3" };
      case "root":
        return { fill: COLOR.accent, stroke: COLOR.accent, color: "#1a1205", dash: null };
      case "scale":
        return { fill: "rgba(88,166,255,0.18)", stroke: "rgba(88,166,255,0.5)", color: "#9ecbff", dash: null };
      default:
        return { fill: "transparent", stroke: COLOR.border, color: COLOR.muted, dash: null };
    }
  }

  function primaryLabel(cell, display, scn) {
    if (cell.state === "target") return "?";
    if (cell.state === "empty") return "?";
    if (display === "movable") return movableOf(cell.pc, scn.tonic);
    if (display === "fixed") return FIXED_SOLFEGE[cell.pc];
    if (display === "jianpu") return jianpuOf(cell.pc, scn.tonic);
    return cell.text;
  }

  function secondaryLabel(cell, display, scn) {
    if (display !== "name+movable") return null;
    if (cell.state === "target" || cell.state === "empty") return null;
    return movableOf(cell.pc, scn.tonic);
  }

  // ---- 方案 A：现在的圆角矩形格 ----
  function renderCurrent(scn, display) {
    var cellW = 40;
    var cellH = 38;
    var gap = 4;
    var labelW = 34;
    var numH = 24;
    var pad = 10;
    var frets = scn.fretMax - scn.fretMin + 1;
    var width = pad * 2 + labelW + frets * cellW + (frets - 1) * gap;
    var height = pad * 2 + numH + 6 * cellH + 5 * gap;

    var svg = el("svg", {
      viewBox: "0 0 " + width + " " + height,
      width: width,
      height: height,
      role: "img",
    });
    svg.appendChild(el("rect", { x: 0, y: 0, width: width, height: height, rx: 12, fill: COLOR.bg, stroke: COLOR.border }));

    for (var i = 0; i < frets; i++) {
      var fx = pad + labelW + i * (cellW + gap) + cellW / 2;
      svg.appendChild(
        el("text", { x: fx, y: pad + 14, fill: COLOR.muted, "font-size": 11, "text-anchor": "middle" }, scn.fretMin + i)
      );
    }

    for (var s = 0; s < 6; s++) {
      var sy = pad + numH + s * (cellH + gap);
      svg.appendChild(
        el(
          "text",
          { x: pad + labelW / 2, y: sy + cellH / 2 + 4, fill: "#c9d1d9", "font-size": 12, "font-weight": 700, "text-anchor": "middle" },
          STRING_LABELS[s]
        )
      );
    }

    for (var c = 0; c < scn.cells.length; c++) {
      var cell = scn.cells[c];
      var st = stateStyle(cell.state);
      var x = pad + labelW + (cell.f - scn.fretMin) * (cellW + gap);
      var y = pad + numH + cell.s * (cellH + gap);
      var rect = el("rect", {
        x: x,
        y: y,
        width: cellW,
        height: cellH,
        rx: 8,
        fill: st.fill,
        stroke: st.stroke,
        "stroke-width": 1,
      });
      if (st.dash) rect.setAttribute("stroke-dasharray", st.dash);
      svg.appendChild(rect);

      var main = primaryLabel(cell, display, scn);
      var sub = secondaryLabel(cell, display, scn);
      svg.appendChild(
        el(
          "text",
          {
            x: x + cellW / 2,
            y: y + cellH / 2 + (sub ? 0 : 4),
            fill: st.color,
            "font-size": 12,
            "font-weight": 600,
            "text-anchor": "middle",
          },
          main
        )
      );
      if (sub) {
        svg.appendChild(
          el("text", { x: x + cellW / 2, y: y + cellH / 2 + 13, fill: COLOR.muted, "font-size": 9, "text-anchor": "middle" }, sub)
        );
      }
    }

    return svg;
  }

  // ---- 方案 B/C：弦线 + 品丝 + 圆点 ----
  function renderClassic(scn, display, compressed) {
    var padX = 14;
    var padTop = 18;
    var labelW = 34;
    var stringGap = 34;
    var numberH = 18;
    var frets = scn.fretMax - scn.fretMin + 1;

    var xs = [];
    var x = padX + labelW;
    xs.push(x);
    for (var i = 0; i < frets; i++) {
      var w = compressed ? 56 * Math.pow(0.925, i) : 56;
      x += w;
      xs.push(x);
    }

    var width = x + padX;
    var boardTop = padTop + numberH;
    var height = boardTop + stringGap * 5 + 30;

    var svg = el("svg", { viewBox: "0 0 " + width + " " + height, width: width, height: height, role: "img" });
    svg.appendChild(el("rect", { x: 0, y: 0, width: width, height: height, rx: 12, fill: COLOR.bg, stroke: COLOR.border }));

    function stringY(s) {
      return boardTop + s * stringGap;
    }
    function fretCenterX(f) {
      var idx = f - scn.fretMin;
      return (xs[idx] + xs[idx + 1]) / 2;
    }

    // 品号
    for (var f = scn.fretMin; f <= scn.fretMax; f++) {
      svg.appendChild(
        el("text", { x: fretCenterX(f), y: boardTop - 7, fill: COLOR.muted, "font-size": 11, "text-anchor": "middle" }, f)
      );
    }

    // 弦（低音弦更粗）
    for (var s2 = 0; s2 < 6; s2++) {
      svg.appendChild(
        el("line", {
          x1: xs[0],
          y1: stringY(s2),
          x2: xs[frets],
          y2: stringY(s2),
          stroke: "#8b949e",
          "stroke-width": 0.9 + (5 - s2) * 0.45,
          "stroke-linecap": "round",
        })
      );
      svg.appendChild(
        el(
          "text",
          { x: padX + labelW / 2, y: stringY(s2) + 4, fill: "#c9d1d9", "font-size": 12, "font-weight": 700, "text-anchor": "middle" },
          STRING_LABELS[s2]
        )
      );
    }

    // 品丝；0 品处画粗琴枕
    for (var w2 = 0; w2 <= frets; w2++) {
      var isNut = w2 === 0 && scn.fretMin === 0;
      svg.appendChild(
        el("line", {
          x1: xs[w2],
          y1: stringY(0) - 12,
          x2: xs[w2],
          y2: stringY(5) + 12,
          stroke: isNut ? COLOR.nut : COLOR.wire,
          "stroke-width": isNut ? 6 : 1,
          "stroke-linecap": "round",
        })
      );
    }

    // 品位记号（3/5/7/9 单点，12 双点）
    var inlayFrets = [3, 5, 7, 9, 12, 15, 17];
    for (var k = 0; k < inlayFrets.length; k++) {
      var ft = inlayFrets[k];
      if (ft < scn.fretMin || ft > scn.fretMax) continue;
      var cx = fretCenterX(ft);
      if (ft === 12) {
        svg.appendChild(el("circle", { cx: cx, cy: stringY(1) + stringGap / 2, r: 3, fill: COLOR.inlay }));
        svg.appendChild(el("circle", { cx: cx, cy: stringY(4) - stringGap / 2, r: 3, fill: COLOR.inlay }));
      } else {
        svg.appendChild(el("circle", { cx: cx, cy: (stringY(2) + stringY(3)) / 2, r: 3, fill: COLOR.inlay }));
      }
    }

    // 音符圆点
    for (var c = 0; c < scn.cells.length; c++) {
      var cell = scn.cells[c];
      var st = stateStyle(cell.state);
      var cx2 = fretCenterX(cell.f);
      var cy = stringY(cell.s);
      var r = Math.min(stringGap * 0.36, 13);

      var dot = el("circle", { cx: cx2, cy: cy, r: r, fill: st.fill, stroke: st.stroke, "stroke-width": 1.4 });
      if (st.dash) dot.setAttribute("stroke-dasharray", st.dash);
      svg.appendChild(dot);

      var main = primaryLabel(cell, display, scn);
      var sub = secondaryLabel(cell, display, scn);
      svg.appendChild(
        el(
          "text",
          {
            x: cx2,
            y: cy + (sub ? -1 : 4),
            fill: st.color,
            "font-size": main.length > 2 ? 9 : 11,
            "font-weight": 700,
            "text-anchor": "middle",
          },
          main
        )
      );
      if (sub) {
        svg.appendChild(
          el("text", { x: cx2, y: cy + 9, fill: COLOR.muted, "font-size": 7, "text-anchor": "middle" }, sub)
        );
      }
    }

    return svg;
  }

  // ---- 组装 ----
  var CARDS = [
    {
      title: "A · 现在的样子",
      tag: "圆角矩形格",
      note: "格子之间只有 4px 间隙，没有品丝、没有琴枕，所以看起来像表格。",
      render: function (scn, display) {
        return renderCurrent(scn, display);
      },
    },
    {
      title: "B · 弦线 + 品丝 + 圆点",
      tag: "推荐",
      note: "品丝是真实的分界；音符是琴上的圆点；粗线是琴枕，灰点是 3/5/7/9/12 品记号。勾上「品距渐窄」就是方案 C。",
      render: function (scn, display, compressed) {
        return renderClassic(scn, display, compressed);
      },
    },
  ];

  var mount = document.getElementById("boards");
  var scenarioSelect = document.getElementById("scenario");
  var displaySelect = document.getElementById("display");
  var compressedBox = document.getElementById("compressed");

  function legendFor(scenarioId) {
    if (scenarioId === "scale") {
      return (
        '<div class="legend">' +
        '<span><i style="background:#e8b04b"></i>主音</span>' +
        '<span><i style="background:rgba(88,166,255,.5)"></i>音阶音</span>' +
        '<span><i style="background:#30363d"></i>非音阶（不显示）</span>' +
        "</div>"
      );
    }
    return (
      '<div class="legend">' +
      '<span><i style="background:#3d444d"></i>给定</span>' +
      '<span><i style="border:1px dashed #4b5563"></i>待填</span>' +
      '<span><i style="background:rgba(88,166,255,.5)"></i>已填</span>' +
      '<span><i style="background:#3fb950"></i>正确</span>' +
      '<span><i style="background:#d29922"></i>拼写错</span>' +
      '<span><i style="background:#f85149"></i>音错</span>' +
      "</div>"
    );
  }

  function render() {
    var scenarioId = scenarioSelect.value;
    var scn = SCENARIOS[scenarioId];
    var display = displaySelect.value;
    var compressed = compressedBox.checked;

    var html = "";
    for (var i = 0; i < CARDS.length; i++) {
      html +=
        '<div class="board-card"><h2>' +
        CARDS[i].title +
        '</h2><span class="tag">' +
        CARDS[i].tag +
        "</span>" +
        '<p class="sub" style="margin:6px 0 0">' +
        scn.title +
        "</p>" +
        '<div class="board-wrap" data-card="' +
        i +
        '"></div>' +
        '<p class="note">' +
        CARDS[i].note +
        "</p>" +
        legendFor(scenarioId) +
        "</div>";
    }
    mount.innerHTML = html;

    for (var j = 0; j < CARDS.length; j++) {
      var wrap = mount.querySelector('[data-card="' + j + '"]');
      wrap.appendChild(CARDS[j].render(scn, display, compressed));
    }
  }

  scenarioSelect.addEventListener("change", render);
  displaySelect.addEventListener("change", render);
  compressedBox.addEventListener("change", render);
  render();
})();
