// Figma Node JSON Extractor - Figma Plugin Backend (code.js)
// Exports compact, design-system-aware Node JSON and companion PNG preview for developer handoff.

figma.showUI(__html__, { width: 440, height: 520, themeColors: true });

function sanitizeFileName(name) {
  if (!name) return 'spec';
  return name
    .toLowerCase()
    .replace(/[^\w\d-_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'spec';
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function formatRgba(color, opacity = 1) {
  if (!color) return undefined;
  const r = clamp(Math.round(color.r * 255), 0, 255);
  const g = clamp(Math.round(color.g * 255), 0, 255);
  const b = clamp(Math.round(color.b * 255), 0, 255);
  const a = clamp(Number((opacity ?? 1).toFixed(3)), 0, 1);

  if (a >= 0.999) {
    const toHex = (c) => c.toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function normalizePropKey(rawKey) {
  if (!rawKey) return '';
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
      props[cleanKey] = propDef.value;
    } else {
      props[cleanKey] = propDef;
    }
  }
  return Object.keys(props).length > 0 ? props : undefined;
}

function simplifyFills(fills) {
  if (!Array.isArray(fills) || fills.length === 0) return undefined;
  const result = [];
  for (const fill of fills) {
    if (fill.visible === false) continue;
    if (fill.type === 'SOLID' && fill.color) {
      result.push({
        type: 'SOLID',
        color: formatRgba(fill.color, fill.opacity),
      });
    } else if (fill.type === 'IMAGE') {
      result.push({ type: 'IMAGE', scaleMode: fill.scaleMode });
    } else if (fill.type && fill.type.startsWith('GRADIENT_')) {
      result.push({ type: fill.type });
    }
  }
  return result.length > 0 ? result : undefined;
}

function simplifyStrokes(strokes, strokeWeight, strokeAlign) {
  if (!Array.isArray(strokes) || strokes.length === 0) return undefined;
  const result = [];
  for (const stroke of strokes) {
    if (stroke.visible === false) continue;
    if (stroke.type === 'SOLID' && stroke.color) {
      result.push({
        type: 'SOLID',
        color: formatRgba(stroke.color, stroke.opacity),
        weight: typeof strokeWeight === 'number' ? strokeWeight : undefined,
        align: strokeAlign,
      });
    }
  }
  return result.length > 0 ? result : undefined;
}

function serializeNode(node) {
  if (!node) return null;

  const pruned = {
    name: node.name,
    type: node.type,
  };

  if (node.visible === false) pruned.visible = false;

  // Dimensions & Coordinates
  if (typeof node.width === 'number' && typeof node.height === 'number') {
    pruned.bounds = {
      width: Math.round(node.width),
      height: Math.round(node.height),
    };
  }

  // Component Instances
  if (node.type === 'INSTANCE') {
    const main = node.mainComponent;
    if (main) {
      const set = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
      pruned.component = {
        name: set ? set.name : main.name,
        variant: main.name,
      };
    }
    const props = normalizeComponentProps(node.componentProperties);
    if (props) pruned.props = props;
  } else if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    const props = normalizeComponentProps(node.componentProperties);
    if (props) pruned.props = props;
  }

  // Auto-Layout (Flexbox)
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    pruned.layoutMode = node.layoutMode;
    if (node.primaryAxisAlignItems) pruned.primaryAxisAlignItems = node.primaryAxisAlignItems;
    if (node.counterAxisAlignItems) pruned.counterAxisAlignItems = node.counterAxisAlignItems;
    if (typeof node.itemSpacing === 'number' && node.itemSpacing !== 0) {
      pruned.itemSpacing = node.itemSpacing;
    }
    if (
      (node.paddingTop || node.paddingRight || node.paddingBottom || node.paddingLeft) !== undefined
    ) {
      pruned.padding = {
        top: node.paddingTop ?? 0,
        right: node.paddingRight ?? 0,
        bottom: node.paddingBottom ?? 0,
        left: node.paddingLeft ?? 0,
      };
    }
    if (node.layoutWrap) pruned.layoutWrap = node.layoutWrap;
  }

  if (typeof node.layoutGrow === 'number' && node.layoutGrow !== 0) {
    pruned.layoutGrow = node.layoutGrow;
  }
  if (node.layoutAlign && node.layoutAlign !== 'INHERIT') {
    pruned.layoutAlign = node.layoutAlign;
  }

  // Styling: Fills & Strokes
  const fills = simplifyFills(node.fills);
  if (fills) pruned.fills = fills;

  const strokes = simplifyStrokes(node.strokes, node.strokeWeight, node.strokeAlign);
  if (strokes) pruned.strokes = strokes;

  // Corner Radius
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    pruned.cornerRadius = node.cornerRadius;
  } else if (
    node.topLeftRadius ||
    node.topRightRadius ||
    node.bottomLeftRadius ||
    node.bottomRightRadius
  ) {
    pruned.cornerRadii = [
      node.topLeftRadius ?? 0,
      node.topRightRadius ?? 0,
      node.bottomRightRadius ?? 0,
      node.bottomLeftRadius ?? 0,
    ];
  }

  if (typeof node.opacity === 'number' && node.opacity !== 1) {
    pruned.opacity = Number(node.opacity.toFixed(2));
  }

  // Effects (Drop Shadows, Blurs)
  if (Array.isArray(node.effects) && node.effects.length > 0) {
    const visibleEffects = node.effects.filter((e) => e.visible !== false);
    if (visibleEffects.length > 0) {
      pruned.effects = visibleEffects.map((e) => ({
        type: e.type,
        radius: e.radius,
        color: e.color ? formatRgba(e.color) : undefined,
        offset: e.offset,
      }));
    }
  }

  // Typography (TEXT)
  if (node.type === 'TEXT') {
    pruned.characters = node.characters;
    const font = node.fontName;
    pruned.typography = {
      fontFamily: typeof font === 'object' ? font.family : undefined,
      fontStyle: typeof font === 'object' ? font.style : undefined,
      fontSize: typeof node.fontSize === 'number' ? node.fontSize : undefined,
      lineHeightPx:
        typeof node.lineHeight === 'object' && node.lineHeight.unit === 'PIXELS'
          ? Math.round(node.lineHeight.value)
          : undefined,
      letterSpacing:
        typeof node.letterSpacing === 'object' ? node.letterSpacing.value : undefined,
      textAlignHorizontal: node.textAlignHorizontal,
      textAlignVertical: node.textAlignVertical,
    };
  }

  // Recursively process children
  if (Array.isArray(node.children) && node.children.length > 0) {
    pruned.children = node.children
      .filter((c) => c.visible !== false)
      .map(serializeNode)
      .filter(Boolean);
  }

  return pruned;
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

async function exportCurrentSelection() {
  const selection = figma.currentPage.selection;
  if (!selection || selection.length === 0) {
    figma.ui.postMessage({ type: 'NO_SELECTION' });
    return;
  }

  const node = selection[0];
  const safeName = sanitizeFileName(node.name);

  // 1. Serialize AST Node
  const ast = serializeNode(node);

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

  figma.ui.postMessage({
    type: 'SPEC_EXPORTED',
    name: safeName,
    originalName: node.name,
    bounds: { width: Math.round(node.width), height: Math.round(node.height) },
    nodeType: node.type,
    spec: ast,
    imageBytes: imageBytes,
    imageBase64: imageBase64,
  });
}

// Initial export on launch
exportCurrentSelection();

// Update live when user changes selection in Figma
figma.on('selectionchange', () => {
  exportCurrentSelection();
});

// Handle UI button requests
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'REFRESH') {
    exportCurrentSelection();
  } else if (msg.type === 'NOTIFY') {
    figma.notify(msg.message);
  }
};
