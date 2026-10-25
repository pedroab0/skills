// Figma Node JSON Extractor - Figma Plugin Backend (code.js)
// Exports compact, design-system-aware Node JSON and companion PNG preview for developer handoff.

figma.showUI(__html__, { width: 440, height: 520, themeColors: true });

function sanitizeFileName(name) {
  if (!name || typeof name !== 'string') return 'spec';
  return name
    .toLowerCase()
    .replace(/[^\w\d-_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'spec';
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function formatRgba(color, opacity = 1) {
  if (!color || typeof color !== 'object') return undefined;
  if (typeof color.r !== 'number' || typeof color.g !== 'number' || typeof color.b !== 'number') return undefined;
  const r = clamp(Math.round(color.r * 255), 0, 255);
  const g = clamp(Math.round(color.g * 255), 0, 255);
  const b = clamp(Math.round(color.b * 255), 0, 255);
  const alpha = typeof opacity === 'number' ? opacity : 1;
  const a = clamp(Number(alpha.toFixed(3)), 0, 1);

  if (a >= 0.999) {
    const toHex = (c) => c.toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function normalizePropKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return '';
  let clean = rawKey.replace(/#.*$/, '').trim();
  return clean
    .replace(/[^\p{L}\p{N}]+(\p{L})/gu, (_, chr) => chr.toUpperCase())
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/^\p{Lu}/u, (chr) => chr.toLowerCase());
}

function normalizeComponentProps(componentProperties) {
  if (!componentProperties || typeof componentProperties !== 'object') return undefined;
  const props = {};
  for (const [key, propDef] of Object.entries(componentProperties)) {
    const cleanKey = normalizePropKey(key);
    if (!cleanKey) continue;
    if (propDef && typeof propDef === 'object' && 'value' in propDef) {
      if (typeof propDef.value === 'string' || typeof propDef.value === 'boolean' || typeof propDef.value === 'number') {
        props[cleanKey] = propDef.value;
      }
    } else if (typeof propDef === 'string' || typeof propDef === 'boolean' || typeof propDef === 'number') {
      props[cleanKey] = propDef;
    }
  }
  return Object.keys(props).length > 0 ? props : undefined;
}

function simplifyFills(fills) {
  if (!Array.isArray(fills) || fills.length === 0) return undefined;
  const result = [];
  for (const fill of fills) {
    if (!fill || typeof fill !== 'object' || fill.visible === false) continue;
    if (fill.type === 'SOLID' && fill.color) {
      const color = formatRgba(fill.color, fill.opacity);
      if (color) {
        result.push({
          type: 'SOLID',
          color: color,
        });
      }
    } else if (fill.type === 'IMAGE') {
      result.push({ type: 'IMAGE', scaleMode: fill.scaleMode });
    } else if (fill.type && typeof fill.type === 'string' && fill.type.startsWith('GRADIENT_')) {
      result.push({ type: fill.type });
    }
  }
  return result.length > 0 ? result : undefined;
}

function simplifyStrokes(strokes, strokeWeight, strokeAlign) {
  if (!Array.isArray(strokes) || strokes.length === 0) return undefined;
  const result = [];
  for (const stroke of strokes) {
    if (!stroke || typeof stroke !== 'object' || stroke.visible === false) continue;
    if (stroke.type === 'SOLID' && stroke.color) {
      const color = formatRgba(stroke.color, stroke.opacity);
      if (color) {
        result.push({
          type: 'SOLID',
          color: color,
          weight: typeof strokeWeight === 'number' ? strokeWeight : undefined,
          align: typeof strokeAlign === 'string' ? strokeAlign : undefined,
        });
      }
    }
  }
  return result.length > 0 ? result : undefined;
}

// Safely access properties on any Figma node, avoiding exceptions on Groups, Mixed symbols, etc.
function safeGet(obj, prop, fallback = undefined) {
  if (!obj || typeof obj !== 'object') return fallback;
  try {
    const val = obj[prop];
    if (typeof val === 'symbol') return fallback; // Filter figma.mixed symbols
    return val !== undefined ? val : fallback;
  } catch (_) {
    return fallback;
  }
}

// Safely resolve TextNode properties with automatic fallback to character range (0, 1) when figma.mixed
function safeGetTextProp(node, prop, rangeMethod, hasChars) {
  const direct = safeGet(node, prop);
  if (direct !== undefined) return direct;
  if (hasChars && rangeMethod && typeof node[rangeMethod] === 'function') {
    try {
      const ranged = node[rangeMethod](0, 1);
      if (typeof ranged !== 'symbol' && ranged !== undefined) {
        return ranged;
      }
    } catch (_) {}
  }
  return undefined;
}

function resolveFontWeight(explicitWeight, fontStyle) {
  if (typeof explicitWeight === 'number' && explicitWeight > 0) {
    return explicitWeight;
  }
  if (!fontStyle || typeof fontStyle !== 'string') return undefined;
  const s = fontStyle.toLowerCase();
  if (/thin|hairline/.test(s)) return 100;
  if (/extra\s*light|ultra\s*light/.test(s)) return 200;
  if (/light/.test(s)) return 300;
  if (/semi\s*bold|demi\s*bold/.test(s)) return 600;
  if (/extra\s*bold|ultra\s*bold/.test(s)) return 800;
  if (/bold/.test(s)) return 700;
  if (/black|heavy/.test(s)) return 900;
  if (/medium/.test(s)) return 500;
  if (/regular|normal|book|roman/.test(s)) return 400;
  return undefined;
}

const VECTOR_PRIMITIVE_TYPES = new Set([
  'VECTOR',
  'BOOLEAN_OPERATION',
  'STAR',
  'LINE',
  'REGULAR_POLYGON',
  'POLYGON',
]);

function cleanLayerName(rawName, fallback = 'Node') {
  if (!rawName || typeof rawName !== 'string') return fallback;
  const trimmed = rawName.trim();
  if (!trimmed) return fallback;
  if (/^data:image\//i.test(trimmed)) return 'Image';
  if (/^(?:<svg\b|<\?xml\b)/i.test(trimmed)) return 'SVG';
  if (/^https?:\/\//i.test(trimmed) && trimmed.length > 60) {
    try {
      const lastSeg = trimmed.split('?')[0].split('/').pop();
      return (lastSeg && lastSeg.length <= 60) ? lastSeg : 'Image';
    } catch (_) {
      return 'Image';
    }
  }
  const singleLine = trimmed.replace(/\s+/g, ' ');
  return singleLine.length > 80 ? singleLine.slice(0, 80) + '…' : singleLine;
}

function isRawAssetString(str) {
  if (!str || typeof str !== 'string') return false;
  const t = str.trim();
  return /^data:image\//i.test(t) || /^(?:<svg\b|<\?xml\b)/i.test(t);
}

function nodeHasImageFill(node) {
  const fills = safeGet(node, 'fills');
  if (!Array.isArray(fills)) return false;
  return fills.some((f) => f && f.visible !== false && f.type === 'IMAGE');
}

function getVisibleChildren(node) {
  const children = safeGet(node, 'children');
  if (!Array.isArray(children) || children.length === 0) return [];
  return children.filter((c) => {
    try {
      return c && safeGet(c, 'visible', true) !== false;
    } catch (_) {
      return false;
    }
  });
}

const GRAPHIC_NAME_RE =
  /svg|icon|ícone|icone|logo|marca|brand|illustrat|ilustra|vector|vetor|symbol|simbol|símbolo|glyph|graphic|ornament|pattern|artwork/i;

function hasSvgExportSetting(node) {
  const settings = safeGet(node, 'exportSettings');
  if (!Array.isArray(settings) || settings.length === 0) return false;
  return settings.some((s) => s && String(safeGet(s, 'format', '')).toUpperCase() === 'SVG');
}

function subtreeHasNoInstances(node, maxNodes = 400) {
  let visited = 0;
  function walk(curr, isRoot) {
    if (++visited > maxNodes) return false;
    const t = safeGet(curr, 'type', '');
    if (!isRoot && (t === 'INSTANCE' || t === 'COMPONENT' || t === 'COMPONENT_SET')) return false;
    for (const k of getVisibleChildren(curr)) {
      if (!walk(k, false)) return false;
    }
    return true;
  }
  return walk(node, true);
}

// Detects whether a container (GROUP, FRAME, INSTANCE, COMPONENT) is purely an SVG / icon / vector illustration
function analyzeVectorSubtree(node, maxNodes = 600) {
  let visited = 0;
  let vectorPrimitiveCount = 0;
  let shapeCount = 0;
  let plainRectCount = 0;
  let primarySolidColor = null;

  const rootType = safeGet(node, 'type', '');
  const hasSvgExport = hasSvgExportSetting(node);

  // An Auto-Layout FRAME with its own styling (e.g., Icon Badge) should keep its wrapper unless marked as SVG export
  if (rootType === 'FRAME' && !hasSvgExport) {
    const rootLm = safeGet(node, 'layoutMode');
    if (rootLm && rootLm !== 'NONE') {
      const ownFills = simplifyFills(safeGet(node, 'fills'));
      const ownStrokes = simplifyStrokes(safeGet(node, 'strokes'), safeGet(node, 'strokeWeight'), safeGet(node, 'strokeAlign'));
      const ownCr = safeGet(node, 'cornerRadius');
      if (ownFills || ownStrokes || (typeof ownCr === 'number' && ownCr > 0)) {
        return { isPure: false, primarySolidColor: null };
      }
    }
  }

  function check(curr, isRoot) {
    if (++visited > maxNodes) return false;
    const t = safeGet(curr, 'type', '');
    if (t === 'TEXT' || t === 'SLICE' || t === 'STICKY' || t === 'TABLE') return false;
    if (!isRoot && (t === 'INSTANCE' || t === 'COMPONENT' || t === 'COMPONENT_SET')) return false;
    if (nodeHasImageFill(curr)) return false;

    if (!primarySolidColor) {
      const fills = simplifyFills(safeGet(curr, 'fills'));
      const solidFill = fills && fills.find((f) => f.type === 'SOLID' && f.color);
      if (solidFill) {
        primarySolidColor = solidFill.color;
      } else {
        const strokes = simplifyStrokes(safeGet(curr, 'strokes'), safeGet(curr, 'strokeWeight'), safeGet(curr, 'strokeAlign'));
        if (strokes && strokes[0] && strokes[0].color) {
          primarySolidColor = strokes[0].color;
        }
      }
    }

    if (VECTOR_PRIMITIVE_TYPES.has(t)) {
      vectorPrimitiveCount++;
      return true;
    }

    if (t === 'ELLIPSE') {
      shapeCount++;
      return true;
    }

    if (t === 'RECTANGLE') {
      const isMask = safeGet(curr, 'isMask') === true;
      const rName = String(safeGet(curr, 'name', ''));
      if (isMask || /clip|mask|vector|path|rect|bound|bg/i.test(rName)) {
        shapeCount++;
      } else {
        plainRectCount++;
      }
      return true;
    }

    if (t === 'GROUP' || t === 'FRAME' || (isRoot && (t === 'INSTANCE' || t === 'COMPONENT'))) {
      if (!isRoot && t === 'FRAME') {
        const lm = safeGet(curr, 'layoutMode');
        if (lm && lm !== 'NONE') return false;
      }
      const kids = getVisibleChildren(curr);
      if (kids.length === 0) return !isRoot;
      for (const k of kids) {
        if (!check(k, false)) return false;
      }
      return true;
    }

    return false;
  }

  const treeOk = check(node, true);
  if (!treeOk) {
    // Explicit SVG export setting on a self-contained graphic/logo (even if it contains logo <text>)
    const w = safeGet(node, 'width', 0);
    const h = safeGet(node, 'height', 0);
    if (
      hasSvgExport &&
      typeof w === 'number' &&
      typeof h === 'number' &&
      w <= 800 &&
      h <= 800 &&
      !nodeHasImageFill(node) &&
      subtreeHasNoInstances(node)
    ) {
      return { isPure: true, primarySolidColor };
    }
    return { isPure: false, primarySolidColor: null };
  }

  const w = safeGet(node, 'width', 9999);
  const h = safeGet(node, 'height', 9999);
  const isSmallGraphic = typeof w === 'number' && typeof h === 'number' && w <= 160 && h <= 160;
  const nodeName = String(safeGet(node, 'name', ''));
  const hasGraphicName = GRAPHIC_NAME_RE.test(nodeName);

  const hasEnoughPrimitives =
    vectorPrimitiveCount > 0 ||
    (shapeCount + plainRectCount >= 2 && (hasSvgExport || (isSmallGraphic && hasGraphicName)));

  const rectGuardOk =
    plainRectCount === 0 ||
    vectorPrimitiveCount >= 2 ||
    isSmallGraphic ||
    hasGraphicName ||
    hasSvgExport;

  const isPure = hasEnoughPrimitives && rectGuardOk;
  return { isPure, primarySolidColor };
}

// Detects masked image groups (e.g., Mask group with photo + mask shape and zero UI text/components)
function analyzeMaskedImageSubtree(node) {
  const t = safeGet(node, 'type', '');
  if (t !== 'GROUP' && t !== 'FRAME') return null;
  const lm = safeGet(node, 'layoutMode');
  if (lm && lm !== 'NONE') return null;

  const kids = getVisibleChildren(node);
  if (kids.length === 0 || kids.length > 20) return null;

  let foundImageScaleMode = null;
  let hasMaskOrClip = false;

  function scan(curr) {
    const ct = safeGet(curr, 'type', '');
    if (ct === 'TEXT' || ct === 'INSTANCE' || ct === 'COMPONENT') return false;
    if (safeGet(curr, 'isMask') === true) hasMaskOrClip = true;

    const fills = safeGet(curr, 'fills');
    if (Array.isArray(fills)) {
      for (const f of fills) {
        if (f && f.visible !== false && f.type === 'IMAGE') {
          foundImageScaleMode = f.scaleMode || 'FILL';
        }
      }
    }

    const sub = getVisibleChildren(curr);
    for (const s of sub) {
      if (!scan(s)) return false;
    }
    return true;
  }

  if (!scan(node) || !foundImageScaleMode) return null;
  if (!hasMaskOrClip && !/mask|image|img|photo|avatar|banner|thumb/i.test(String(safeGet(node, 'name', '')))) {
    return null;
  }
  return { scaleMode: foundImageScaleMode };
}

function assignCleanCornerRadius(node, pruned) {
  const cornerRadius = safeGet(node, 'cornerRadius');
  if (typeof cornerRadius === 'number' && cornerRadius > 0) {
    pruned.cornerRadius = Math.round(cornerRadius * 100) / 100;
    return;
  }
  const tl = safeGet(node, 'topLeftRadius');
  const tr = safeGet(node, 'topRightRadius');
  const br = safeGet(node, 'bottomRightRadius');
  const bl = safeGet(node, 'bottomLeftRadius');
  const r0 = typeof tl === 'number' && tl > 0 ? Math.round(tl * 100) / 100 : 0;
  const r1 = typeof tr === 'number' && tr > 0 ? Math.round(tr * 100) / 100 : 0;
  const r2 = typeof br === 'number' && br > 0 ? Math.round(br * 100) / 100 : 0;
  const r3 = typeof bl === 'number' && bl > 0 ? Math.round(bl * 100) / 100 : 0;
  if (r0 > 0 || r1 > 0 || r2 > 0 || r3 > 0) {
    if (r0 === r1 && r1 === r2 && r2 === r3) {
      pruned.cornerRadius = r0;
    } else {
      pruned.cornerRadii = [r0, r1, r2, r3];
    }
  }
}

async function serializeNode(node, depth = 0) {
  if (!node) return null;
  if (depth > 25) {
    return { name: cleanLayerName(safeGet(node, 'name'), 'Node'), type: safeGet(node, 'type', 'FRAME') };
  }

  try {
    const nodeType = safeGet(node, 'type', 'FRAME');
    const cleanName = cleanLayerName(safeGet(node, 'name'), 'Node');

    // Dimensions & Coordinates
    const width = safeGet(node, 'width');
    const height = safeGet(node, 'height');
    const bounds =
      typeof width === 'number' && typeof height === 'number'
        ? { width: Math.round(width), height: Math.round(height) }
        : undefined;

    // 1. Leaf Vector Primitives (VECTOR, BOOLEAN_OPERATION, STAR, LINE, POLYGON) — never dump sub-paths
    if (VECTOR_PRIMITIVE_TYPES.has(nodeType)) {
      const vecNode = { name: cleanName, type: 'VECTOR' };
      if (bounds) vecNode.bounds = bounds;
      const fills = simplifyFills(safeGet(node, 'fills'));
      const solidFill = fills && fills.find((f) => f.type === 'SOLID' && f.color);
      if (solidFill) {
        vecNode.fills = [{ type: 'SOLID', color: solidFill.color }];
      } else {
        const strokes = simplifyStrokes(safeGet(node, 'strokes'), safeGet(node, 'strokeWeight'), safeGet(node, 'strokeAlign'));
        if (strokes && strokes[0] && strokes[0].color) {
          vecNode.fills = [{ type: 'SOLID', color: strokes[0].color }];
        }
      }
      return vecNode;
    }

    const pruned = {
      name: cleanName,
      type: nodeType,
    };

    if (safeGet(node, 'visible') === false) pruned.visible = false;
    if (bounds) pruned.bounds = bounds;

    // Component Instances & Variants (compatible with dynamic-page getMainComponentAsync)
    if (nodeType === 'INSTANCE') {
      try {
        let main = null;
        if (typeof node.getMainComponentAsync === 'function') {
          try {
            main = await node.getMainComponentAsync();
          } catch (_) {}
        }
        if (!main) {
          main = safeGet(node, 'mainComponent');
        }
        if (main) {
          let setName = null;
          try {
            const parent = safeGet(main, 'parent');
            if (parent && safeGet(parent, 'type') === 'COMPONENT_SET') {
              setName = safeGet(parent, 'name');
            }
          } catch (_) {}

          pruned.component = {
            name: cleanLayerName(setName || safeGet(main, 'name'), pruned.name),
            variant: cleanLayerName(safeGet(main, 'name'), pruned.name),
          };
        }
      } catch (_) {
        pruned.component = {
          name: pruned.name,
          variant: pruned.name,
        };
      }
      try {
        const props = normalizeComponentProps(safeGet(node, 'componentProperties'));
        if (props) pruned.props = props;
      } catch (_) {}
    } else if (nodeType === 'COMPONENT' || nodeType === 'COMPONENT_SET') {
      try {
        const props = normalizeComponentProps(safeGet(node, 'componentProperties'));
        if (props) pruned.props = props;
      } catch (_) {}
    }

    // 2. Collapse Pure SVG / Icon / Vector Graphic Containers (eliminates hundreds of internal Vector nodes)
    if (depth > 0 || nodeType === 'GROUP' || nodeType === 'INSTANCE') {
      const vecCheck = analyzeVectorSubtree(node);
      if (vecCheck.isPure) {
        if (nodeType !== 'INSTANCE' && nodeType !== 'COMPONENT') {
          pruned.type = 'VECTOR';
          pruned.isSvg = true;
        } else {
          assignCleanCornerRadius(node, pruned);
        }
        const ownFills = simplifyFills(safeGet(node, 'fills'));
        if (ownFills) {
          pruned.fills = ownFills;
        } else if (vecCheck.primarySolidColor) {
          pruned.fills = [{ type: 'SOLID', color: vecCheck.primarySolidColor }];
        }
        return pruned;
      }
    }

    // 3. Collapse Masked Image Groups (photo + mask shape with zero UI text/components)
    if (depth > 0) {
      const imgGroup = analyzeMaskedImageSubtree(node);
      if (imgGroup) {
        pruned.fills = [{ type: 'IMAGE', scaleMode: imgGroup.scaleMode }];
        assignCleanCornerRadius(node, pruned);
        return pruned;
      }
    }

    // Auto-Layout (Flexbox)
    const layoutMode = safeGet(node, 'layoutMode');
    if (layoutMode && layoutMode !== 'NONE') {
      pruned.layoutMode = layoutMode;
      const primaryAlign = safeGet(node, 'primaryAxisAlignItems');
      const counterAlign = safeGet(node, 'counterAxisAlignItems');
      if (primaryAlign && primaryAlign !== 'MIN') pruned.primaryAxisAlignItems = primaryAlign;
      if (counterAlign && counterAlign !== 'MIN') pruned.counterAxisAlignItems = counterAlign;

      const itemSpacing = safeGet(node, 'itemSpacing');
      if (typeof itemSpacing === 'number' && itemSpacing !== 0) {
        pruned.itemSpacing = Math.round(itemSpacing * 100) / 100;
      }

      const pTop = safeGet(node, 'paddingTop');
      const pRight = safeGet(node, 'paddingRight');
      const pBottom = safeGet(node, 'paddingBottom');
      const pLeft = safeGet(node, 'paddingLeft');
      const top = typeof pTop === 'number' ? pTop : 0;
      const right = typeof pRight === 'number' ? pRight : 0;
      const bottom = typeof pBottom === 'number' ? pBottom : 0;
      const left = typeof pLeft === 'number' ? pLeft : 0;
      if (top > 0 || right > 0 || bottom > 0 || left > 0) {
        pruned.padding = { top, right, bottom, left };
      }

      const layoutWrap = safeGet(node, 'layoutWrap');
      if (layoutWrap && layoutWrap !== 'NO_WRAP') pruned.layoutWrap = layoutWrap;
    }

    const layoutGrow = safeGet(node, 'layoutGrow');
    if (typeof layoutGrow === 'number' && layoutGrow !== 0) {
      pruned.layoutGrow = layoutGrow;
    }

    const layoutAlign = safeGet(node, 'layoutAlign');
    if (layoutAlign && layoutAlign !== 'INHERIT') {
      pruned.layoutAlign = layoutAlign;
    }

    // Styling: Fills & Strokes
    const fills = simplifyFills(safeGet(node, 'fills'));
    if (fills) pruned.fills = fills;

    const strokes = simplifyStrokes(
      safeGet(node, 'strokes'),
      safeGet(node, 'strokeWeight'),
      safeGet(node, 'strokeAlign')
    );
    if (strokes) pruned.strokes = strokes;

    // Corner Radius (only when > 0)
    assignCleanCornerRadius(node, pruned);

    const opacity = safeGet(node, 'opacity');
    if (typeof opacity === 'number' && opacity < 0.999) {
      pruned.opacity = Number(opacity.toFixed(2));
    }

    // Effects (Drop Shadows, Blurs)
    const effects = safeGet(node, 'effects');
    if (Array.isArray(effects) && effects.length > 0) {
      const visibleEffects = effects.filter((e) => e && safeGet(e, 'visible', true) !== false);
      if (visibleEffects.length > 0) {
        pruned.effects = visibleEffects.map((e) => {
          const eff = { type: safeGet(e, 'type') };
          const rad = safeGet(e, 'radius');
          if (typeof rad === 'number' && rad > 0) eff.radius = rad;
          const col = safeGet(e, 'color') ? formatRgba(safeGet(e, 'color')) : undefined;
          if (col) eff.color = col;
          const off = safeGet(e, 'offset');
          if (off && (off.x || off.y)) eff.offset = off;
          return eff;
        });
      }
    }

    // Typography (TEXT)
    if (nodeType === 'TEXT') {
      const rawChars = safeGet(node, 'characters', '');
      const hasChars = typeof rawChars === 'string' && rawChars.length > 0;
      pruned.characters = isRawAssetString(rawChars) ? '[raw-asset-omitted]' : rawChars;

      // Fallback fills when TextNode has mixed character colors (figma.mixed)
      if (!pruned.fills) {
        const rangeFills = simplifyFills(safeGetTextProp(node, 'fills', 'getRangeFills', hasChars));
        if (rangeFills) pruned.fills = rangeFills;
      }

      const font = safeGetTextProp(node, 'fontName', 'getRangeFontName', hasChars);
      const lineHeight = safeGetTextProp(node, 'lineHeight', 'getRangeLineHeight', hasChars);
      const letterSpacing = safeGetTextProp(node, 'letterSpacing', 'getRangeLetterSpacing', hasChars);
      const fontSize = safeGetTextProp(node, 'fontSize', 'getRangeFontSize', hasChars);
      const rawWeight = safeGetTextProp(node, 'fontWeight', 'getRangeFontWeight', hasChars);

      const typo = {};
      const family = font && typeof font === 'object' ? safeGet(font, 'family') : undefined;
      const fontStyle = font && typeof font === 'object' ? safeGet(font, 'style') : undefined;
      if (family) typo.fontFamily = family;
      if (fontStyle) typo.fontStyle = fontStyle;

      const resolvedWeight = resolveFontWeight(rawWeight, fontStyle);
      if (resolvedWeight) typo.fontWeight = resolvedWeight;

      if (typeof fontSize === 'number') {
        typo.fontSize = Math.round(fontSize * 100) / 100;
      }
      if (lineHeight && typeof lineHeight === 'object') {
        const lhUnit = safeGet(lineHeight, 'unit');
        const lhRawVal = safeGet(lineHeight, 'value', 0);
        if (lhUnit === 'PIXELS' && typeof lhRawVal === 'number') {
          const lhVal = Math.round(lhRawVal);
          if (lhVal > 0) typo.lineHeightPx = lhVal;
        } else if (lhUnit === 'PERCENT' && typeof lhRawVal === 'number' && typeof fontSize === 'number' && fontSize > 0) {
          const lhVal = Math.round((fontSize * lhRawVal) / 100);
          if (lhVal > 0) typo.lineHeightPx = lhVal;
        }
      }
      if (letterSpacing && typeof letterSpacing === 'object') {
        const lsUnit = safeGet(letterSpacing, 'unit');
        const lsRawVal = safeGet(letterSpacing, 'value');
        if (typeof lsRawVal === 'number' && Math.abs(lsRawVal) > 0.01) {
          const lsPx =
            lsUnit === 'PERCENT' && typeof fontSize === 'number' && fontSize > 0
              ? (fontSize * lsRawVal) / 100
              : lsRawVal;
          if (Math.abs(lsPx) > 0.01) {
            typo.letterSpacing = Number(lsPx.toFixed(2));
          }
        }
      }
      const hAlign = safeGet(node, 'textAlignHorizontal');
      if (hAlign && hAlign !== 'LEFT') typo.textAlignHorizontal = hAlign;
      const vAlign = safeGet(node, 'textAlignVertical');
      if (vAlign && vAlign !== 'TOP') typo.textAlignVertical = vAlign;

      if (Object.keys(typo).length > 0) {
        pruned.typography = typo;
      }
    }

    // Recursively process children
    const visibleKids = getVisibleChildren(node);
    if (visibleKids.length > 0) {
      const serializedKids = [];
      for (const child of visibleKids) {
        const serializedChild = await serializeNode(child, depth + 1);
        if (serializedChild) serializedKids.push(serializedChild);
      }
      if (serializedKids.length > 0) {
        pruned.children = serializedKids;
      }
    }

    return pruned;
  } catch (err) {
    console.warn('Fallback serialization for node:', err);
    return {
      name: cleanLayerName(safeGet(node, 'name'), 'Node'),
      type: safeGet(node, 'type', 'FRAME'),
    };
  }
}

function uint8ArrayToBase64(bytes) {
  if (!bytes || bytes.length === 0) return null;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    base64 += chars[b0 >> 2];
    base64 += chars[((b0 & 3) << 4) | (b1 >> 4)];
    base64 += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    base64 += i + 2 < len ? chars[b2 & 63] : '=';
  }
  return base64;
}

let currentExportId = 0;

async function exportCurrentSelection() {
  const exportId = ++currentExportId;
  const selection = figma.currentPage.selection;
  if (!selection || selection.length === 0) {
    figma.ui.postMessage({ type: 'NO_SELECTION' });
    return;
  }

  const node = selection[0];
  const safeName = sanitizeFileName(safeGet(node, 'name', 'spec'));

  // 1. Serialize AST Node safely
  let ast = null;
  try {
    ast = await serializeNode(node);
  } catch (err) {
    console.error('Failed to serialize AST:', err);
    ast = { name: safeGet(node, 'name', 'spec'), type: safeGet(node, 'type', 'FRAME') };
  }

  // Abort if selection changed while serializing
  if (exportId !== currentExportId) return;

  // 2. Export Rendered PNG Preview (Scale 2x)
  let imageBytes = null;
  let imageBase64 = null;
  try {
    imageBytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 },
    });
    imageBase64 = uint8ArrayToBase64(imageBytes);
  } catch (err) {
    console.warn('Preview render skipped:', err);
  }

  // Abort if selection changed while rendering PNG
  if (exportId !== currentExportId) return;

  const nodeWidth = safeGet(node, 'width', 0);
  const nodeHeight = safeGet(node, 'height', 0);

  figma.ui.postMessage({
    type: 'SPEC_EXPORTED',
    name: safeName,
    originalName: safeGet(node, 'name', 'spec'),
    bounds: {
      width: typeof nodeWidth === 'number' ? Math.round(nodeWidth) : 0,
      height: typeof nodeHeight === 'number' ? Math.round(nodeHeight) : 0,
    },
    nodeType: safeGet(node, 'type', 'FRAME'),
    spec: ast,
    imageBytes: imageBytes,
    imageBase64: imageBase64,
  });
}

// Initial export on launch
exportCurrentSelection();

// Update live when user changes selection in Figma
figma.on('selectionchange', () => {
  try {
    exportCurrentSelection();
  } catch (err) {
    console.error('selectionchange handler error:', err);
  }
});

// Handle UI button requests
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'REFRESH') {
    exportCurrentSelection();
  } else if (msg.type === 'NOTIFY') {
    figma.notify(msg.message, msg.error ? { error: true } : undefined);
  }
};
