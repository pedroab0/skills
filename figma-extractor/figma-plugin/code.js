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

function serializeNode(node, depth = 0) {
  if (!node) return null;
  if (depth > 25) {
    return { name: safeGet(node, 'name', 'Node'), type: safeGet(node, 'type', 'FRAME') };
  }

  try {
    const nodeType = safeGet(node, 'type', 'FRAME');
    const pruned = {
      name: safeGet(node, 'name', 'Node'),
      type: nodeType,
    };

    if (safeGet(node, 'visible') === false) pruned.visible = false;

    // Dimensions & Coordinates
    const width = safeGet(node, 'width');
    const height = safeGet(node, 'height');
    if (typeof width === 'number' && typeof height === 'number') {
      pruned.bounds = {
        width: Math.round(width),
        height: Math.round(height),
      };
    }

    // Component Instances & Variants
    if (nodeType === 'INSTANCE') {
      try {
        const main = safeGet(node, 'mainComponent');
        if (main) {
          let setName = null;
          try {
            const parent = safeGet(main, 'parent');
            if (parent && safeGet(parent, 'type') === 'COMPONENT_SET') {
              setName = safeGet(parent, 'name');
            }
          } catch (_) {}

          pruned.component = {
            name: setName || safeGet(main, 'name', pruned.name),
            variant: safeGet(main, 'name', pruned.name),
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

    // Auto-Layout (Flexbox)
    const layoutMode = safeGet(node, 'layoutMode');
    if (layoutMode && layoutMode !== 'NONE') {
      pruned.layoutMode = layoutMode;
      const primaryAlign = safeGet(node, 'primaryAxisAlignItems');
      const counterAlign = safeGet(node, 'counterAxisAlignItems');
      if (primaryAlign) pruned.primaryAxisAlignItems = primaryAlign;
      if (counterAlign) pruned.counterAxisAlignItems = counterAlign;

      const itemSpacing = safeGet(node, 'itemSpacing');
      if (typeof itemSpacing === 'number' && itemSpacing !== 0) {
        pruned.itemSpacing = itemSpacing;
      }

      const pTop = safeGet(node, 'paddingTop');
      const pRight = safeGet(node, 'paddingRight');
      const pBottom = safeGet(node, 'paddingBottom');
      const pLeft = safeGet(node, 'paddingLeft');
      if (pTop !== undefined || pRight !== undefined || pBottom !== undefined || pLeft !== undefined) {
        pruned.padding = {
          top: typeof pTop === 'number' ? pTop : 0,
          right: typeof pRight === 'number' ? pRight : 0,
          bottom: typeof pBottom === 'number' ? pBottom : 0,
          left: typeof pLeft === 'number' ? pLeft : 0,
        };
      }

      const layoutWrap = safeGet(node, 'layoutWrap');
      if (layoutWrap) pruned.layoutWrap = layoutWrap;
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

    // Corner Radius
    const cornerRadius = safeGet(node, 'cornerRadius');
    if (typeof cornerRadius === 'number' && cornerRadius > 0) {
      pruned.cornerRadius = cornerRadius;
    } else {
      const tl = safeGet(node, 'topLeftRadius');
      const tr = safeGet(node, 'topRightRadius');
      const br = safeGet(node, 'bottomRightRadius');
      const bl = safeGet(node, 'bottomLeftRadius');
      if (typeof tl === 'number' || typeof tr === 'number' || typeof br === 'number' || typeof bl === 'number') {
        pruned.cornerRadii = [
          typeof tl === 'number' ? tl : 0,
          typeof tr === 'number' ? tr : 0,
          typeof br === 'number' ? br : 0,
          typeof bl === 'number' ? bl : 0,
        ];
      }
    }

    const opacity = safeGet(node, 'opacity');
    if (typeof opacity === 'number' && opacity !== 1) {
      pruned.opacity = Number(opacity.toFixed(2));
    }

    // Effects (Drop Shadows, Blurs)
    const effects = safeGet(node, 'effects');
    if (Array.isArray(effects) && effects.length > 0) {
      const visibleEffects = effects.filter((e) => e && safeGet(e, 'visible', true) !== false);
      if (visibleEffects.length > 0) {
        pruned.effects = visibleEffects.map((e) => ({
          type: safeGet(e, 'type'),
          radius: safeGet(e, 'radius'),
          color: safeGet(e, 'color') ? formatRgba(safeGet(e, 'color')) : undefined,
          offset: safeGet(e, 'offset'),
        }));
      }
    }

    // Typography (TEXT)
    if (nodeType === 'TEXT') {
      pruned.characters = safeGet(node, 'characters', '');
      const font = safeGet(node, 'fontName');
      const lineHeight = safeGet(node, 'lineHeight');
      const letterSpacing = safeGet(node, 'letterSpacing');
      const fontSize = safeGet(node, 'fontSize');

      pruned.typography = {
        fontFamily: font && typeof font === 'object' ? safeGet(font, 'family') : undefined,
        fontStyle: font && typeof font === 'object' ? safeGet(font, 'style') : undefined,
        fontSize: typeof fontSize === 'number' ? fontSize : undefined,
        lineHeightPx:
          lineHeight && typeof lineHeight === 'object' && safeGet(lineHeight, 'unit') === 'PIXELS'
            ? Math.round(safeGet(lineHeight, 'value', 0))
            : undefined,
        letterSpacing:
          letterSpacing && typeof letterSpacing === 'object' ? safeGet(letterSpacing, 'value') : undefined,
        textAlignHorizontal: safeGet(node, 'textAlignHorizontal'),
        textAlignVertical: safeGet(node, 'textAlignVertical'),
      };
    }

    // Recursively process children
    const children = safeGet(node, 'children');
    if (Array.isArray(children) && children.length > 0) {
      pruned.children = children
        .filter((c) => {
          try {
            return c && safeGet(c, 'visible', true) !== false;
          } catch (_) {
            return true;
          }
        })
        .map((child) => serializeNode(child, depth + 1))
        .filter(Boolean);
    }

    return pruned;
  } catch (err) {
    console.warn('Fallback serialization for node:', err);
    return {
      name: safeGet(node, 'name', 'Node'),
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
    ast = serializeNode(node);
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
    figma.notify(msg.message);
  }
};
