#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { URL } = require('url');

// -----------------------------------------------------------------------------
// Environment and Auth Utilities
// -----------------------------------------------------------------------------

function loadEnv() {
  const home = process.env.HOME || '';
  const candidates = [
    path.join(process.cwd(), '.env'),
    home ? path.join(home, '.env') : null,
    home ? path.join(home, '.zshrc') : null,
    home ? path.join(home, '.bashrc') : null,
  ].filter(Boolean);

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        for (const line of lines) {
          const parsed = parseEnvLine(line);
          if (parsed && parsed.key) {
            // For dot-env files, load any variable; for shell configs, only load FIGMA_ variables
            const isShellConfig = envPath.endsWith('.zshrc') || envPath.endsWith('.bashrc');
            if (!process.env[parsed.key] && (!isShellConfig || parsed.key.startsWith('FIGMA_'))) {
              process.env[parsed.key] = parsed.val;
            }
          }
        }
      } catch (e) {
        // Ignore errors loading env candidates
      }
    }
  }
}

function parseEnvLine(line) {
  if (!line || typeof line !== 'string') return null;
  let trimmed = line.trim();
  if (trimmed.startsWith('export ')) {
    trimmed = trimmed.substring(7).trim();
  }
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
    return null;
  }

  const eqIdx = trimmed.indexOf('=');
  const key = trimmed.slice(0, eqIdx).trim();
  let rest = trimmed.slice(eqIdx + 1).trim();

  let val = '';
  if (rest.startsWith('"')) {
    const closeIdx = rest.indexOf('"', 1);
    val = closeIdx !== -1 ? rest.slice(1, closeIdx) : rest.slice(1);
  } else if (rest.startsWith("'")) {
    const closeIdx = rest.indexOf("'", 1);
    val = closeIdx !== -1 ? rest.slice(1, closeIdx) : rest.slice(1);
  } else {
    // Unquoted: strip trailing inline comments
    val = rest.replace(/\s+#.*$/, '').trim();
  }

  return { key, val };
}

function getFigmaToken() {
  return process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN || null;
}

function getAuthHeaders(token) {
  if (!token) return {};
  const trimmed = token.trim();
  if (trimmed.startsWith('Bearer ')) {
    return { Authorization: trimmed };
  }
  return { 'X-Figma-Token': trimmed };
}

// -----------------------------------------------------------------------------
// Network Utilities
// -----------------------------------------------------------------------------

function makeRequest(urlStr, headers = {}, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error('Too many HTTP redirects'));
  }

  const parsedUrl = new URL(urlStr);
  const isHttps = parsedUrl.protocol === 'https:';
  const client = isHttps ? https : http;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    headers: {
      'User-Agent': 'FigmaExtractorAgentSkill/1.0',
      ...headers,
    },
  };

  if (process.env.FIGMA_IGNORE_SSL === 'true' && isHttps) {
    options.rejectUnauthorized = false;
  }

  return new Promise((resolve, reject) => {
    const req = client.get(options, (res) => {
      // Handle HTTP redirects (301, 302, 307, 308)
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        res.resume();
        const redirectUrl = new URL(res.headers.location, urlStr).toString();
        return resolve(makeRequest(redirectUrl, headers, redirectCount + 1));
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          const err = new Error(
            `Request failed with status code ${res.statusCode}: ${data}`,
          );
          err.statusCode = res.statusCode;
          err.responseBody = data;
          err.headers = res.headers;
          if (res.headers['retry-after']) {
            const parsed = parseInt(res.headers['retry-after'], 10);
            err.retryAfter = !isNaN(parsed) ? parsed : res.headers['retry-after'];
          }
          if (res.headers['x-figma-rate-limit-type']) {
            err.rateLimitType = res.headers['x-figma-rate-limit-type'];
          }
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timed out after 30 seconds'));
    });
  });
}

function downloadBinaryFile(urlStr, targetPath, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error('Too many HTTP redirects'));
  }

  const parsedUrl = new URL(urlStr);
  const isHttps = parsedUrl.protocol === 'https:';
  const client = isHttps ? https : http;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    headers: {
      'User-Agent': 'FigmaExtractorAgentSkill/1.0',
    },
  };

  if (process.env.FIGMA_IGNORE_SSL === 'true' && isHttps) {
    options.rejectUnauthorized = false;
  }

  return new Promise((resolve, reject) => {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let fileStream = null;
    const cleanupPartial = () => {
      if (fileStream) {
        try {
          fileStream.destroy();
        } catch (_) {}
      }
      fs.unlink(targetPath, () => {});
    };

    const req = client.get(options, (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        res.resume();
        const redirectUrl = new URL(res.headers.location, urlStr).toString();
        return resolve(downloadBinaryFile(redirectUrl, targetPath, redirectCount + 1));
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        const err = new Error(`Image download failed with status code ${res.statusCode}`);
        err.statusCode = res.statusCode;
        err.headers = res.headers;
        if (res.headers && res.headers['retry-after']) {
          const parsed = parseInt(res.headers['retry-after'], 10);
          err.retryAfter = !isNaN(parsed) ? parsed : res.headers['retry-after'];
        }
        if (res.headers && res.headers['x-figma-rate-limit-type']) {
          err.rateLimitType = res.headers['x-figma-rate-limit-type'];
        }
        return reject(err);
      }

      fileStream = fs.createWriteStream(targetPath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => resolve(targetPath));
      });

      fileStream.on('error', (err) => {
        cleanupPartial();
        reject(err);
      });
    });

    req.on('error', (err) => {
      cleanupPartial();
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      cleanupPartial();
      reject(new Error('Image download timed out after 30 seconds'));
    });
  });
}

// -----------------------------------------------------------------------------
// URL and Node ID Normalization
// -----------------------------------------------------------------------------

function parseFigmaUrl(urlStr) {
  let cleanUrl = (urlStr || '').trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  try {
    const url = new URL(cleanUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    let fileKey = null;

    const keyIdx = pathParts.findIndex((part) =>
      ['file', 'design', 'board', 'proto'].includes(part.toLowerCase()),
    );

    if (keyIdx !== -1 && pathParts[keyIdx + 1]) {
      fileKey = pathParts[keyIdx + 1];
    } else if (pathParts.length > 0 && /^[a-zA-Z0-9_-]{20,}$/.test(pathParts[0])) {
      fileKey = pathParts[0];
    }

    let rawNodeId = url.searchParams.get('node-id');
    let nodeId = rawNodeId ? normalizeNodeId(rawNodeId) : null;

    return { fileKey, nodeId };
  } catch (e) {
    return { fileKey: null, nodeId: null };
  }
}

function normalizeNodeId(nodeId) {
  if (!nodeId) return null;
  let decoded = decodeURIComponent(String(nodeId).trim());
  let normalized = decoded.replace(/-/g, ':');
  normalized = normalized.replace(/^:+|:+$/g, '');
  return normalized;
}

// -----------------------------------------------------------------------------
// Color and Token Utilities
// -----------------------------------------------------------------------------

function formatRgba(color, opacity) {
  if (!color) return undefined;
  const r = Math.min(255, Math.max(0, Math.round((color.r ?? 0) * 255)));
  const g = Math.min(255, Math.max(0, Math.round((color.g ?? 0) * 255)));
  const b = Math.min(255, Math.max(0, Math.round((color.b ?? 0) * 255)));
  const colorAlpha = color.a !== undefined ? color.a : 1;
  const fillOpacity = opacity !== undefined ? opacity : 1;
  const a = Math.min(1, Math.max(0, Number((colorAlpha * fillOpacity).toFixed(2))));

  const hex =
    '#' +
    [r, g, b]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

  return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : hex;
}

function resolveVariableToken(varAliasOrId, varMap) {
  if (!varAliasOrId || !varMap) return undefined;
  const varId = typeof varAliasOrId === 'object' ? varAliasOrId.id : varAliasOrId;
  return varMap[varId]?.name || undefined;
}

function simplifyFills(fills, boundVars, varMap) {
  if (!Array.isArray(fills) || fills.length === 0) return undefined;
  const boundFills = Array.isArray(boundVars?.fills) ? boundVars.fills : [];
  const results = [];

  for (let i = 0; i < fills.length; i++) {
    const fill = fills[i];
    if (fill.visible === false) continue;

    const res = { type: fill.type };
    if (fill.type === 'SOLID' && fill.color) {
      res.color = formatRgba(fill.color, fill.opacity);
    }
    if (fill.opacity !== undefined && fill.opacity !== 1) {
      res.opacity = fill.opacity;
    }

    const token = resolveVariableToken(boundFills[i], varMap);
    if (token) res.token = token;

    results.push(res);
  }

  return results.length > 0 ? results : undefined;
}

function simplifyStrokes(strokes, strokeWeight, strokeAlign, boundVars, varMap) {
  if (!Array.isArray(strokes) || strokes.length === 0) return undefined;
  const boundStrokes = Array.isArray(boundVars?.strokes) ? boundVars.strokes : [];
  const colors = [];

  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (s.visible === false) continue;
    const col = s.color ? formatRgba(s.color, s.opacity) : s.type;
    const token = resolveVariableToken(boundStrokes[i], varMap);
    colors.push(token ? { color: col, token } : col);
  }

  if (colors.length === 0) return undefined;

  const res = { weight: strokeWeight, align: strokeAlign, colors };

  const strokeWeightToken = resolveVariableToken(boundVars?.strokeWeight, varMap);
  if (strokeWeightToken) res.strokeWeightToken = strokeWeightToken;

  return res;
}

// -----------------------------------------------------------------------------
// Component Property & Instance Normalization
// -----------------------------------------------------------------------------

function normalizePropKey(rawKey) {
  if (!rawKey) return '';
  // Strip Figma property ID hash: "Variant#1234:56" -> "Variant", "Has Icon#402" -> "Has Icon"
  let clean = rawKey.replace(/#.*$/, '').trim();
  // Convert to camelCase while preserving Unicode letters (\p{L}) and digits (\p{N})
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

// -----------------------------------------------------------------------------
// AST Pruning & Token Optimization
// -----------------------------------------------------------------------------

function pruneFigmaNode(node, context = {}, options = {}) {
  if (!node || typeof node !== 'object') return node;

  const { varMap, components, componentSets } = context;

  const pruned = {
    name: node.name,
    type: node.type,
  };

  if (options.includeIds && node.id) {
    pruned.id = node.id;
  }

  if (node.visible === false) pruned.visible = false;

  const bound = node.boundVariables || {};

  // Component Instance & Master Resolution
  if (node.type === 'INSTANCE') {
    if (node.componentId && components && components[node.componentId]) {
      const master = components[node.componentId];
      const set = master.componentSetId && componentSets ? componentSets[master.componentSetId] : null;
      pruned.component = {
        name: set ? set.name : master.name,
        variant: master.name,
      };
      if (options.includeIds) {
        pruned.component.id = node.componentId;
      }
    }

    const props = normalizeComponentProps(node.componentProperties);
    if (props) pruned.props = props;

    // Shallow instances: skip internal rendering sub-layers if requested
    if (options.shallowInstances) {
      if (node.absoluteBoundingBox) {
        pruned.bounds = {
          width: Math.round(node.absoluteBoundingBox.width),
          height: Math.round(node.absoluteBoundingBox.height),
        };
      }
      return pruned;
    }
  } else if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    const props = normalizeComponentProps(node.componentProperties);
    if (props) pruned.props = props;
  }

  // Layout & Flexbox properties
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    pruned.layoutMode = node.layoutMode;
    if (node.primaryAxisAlignItems) pruned.primaryAxisAlignItems = node.primaryAxisAlignItems;
    if (node.counterAxisAlignItems) pruned.counterAxisAlignItems = node.counterAxisAlignItems;

    if (node.itemSpacing) {
      pruned.itemSpacing = node.itemSpacing;
      const spacingToken = resolveVariableToken(bound.itemSpacing, varMap);
      if (spacingToken) pruned.itemSpacingToken = spacingToken;
    }

    if (node.paddingLeft || node.paddingRight || node.paddingTop || node.paddingBottom) {
      pruned.padding = {
        top: node.paddingTop ?? 0,
        right: node.paddingRight ?? 0,
        bottom: node.paddingBottom ?? 0,
        left: node.paddingLeft ?? 0,
      };
      const padToken =
        resolveVariableToken(bound.paddingTop, varMap) ||
        resolveVariableToken(bound.paddingLeft, varMap);
      if (padToken) pruned.paddingToken = padToken;
    }

    if (node.layoutWrap) pruned.layoutWrap = node.layoutWrap;
  }

  if (node.layoutGrow) pruned.layoutGrow = node.layoutGrow;
  if (node.layoutAlign) pruned.layoutAlign = node.layoutAlign;

  // Dimensions & Coordinates
  if (node.absoluteBoundingBox) {
    pruned.bounds = {
      width: Math.round(node.absoluteBoundingBox.width),
      height: Math.round(node.absoluteBoundingBox.height),
    };
  }

  if (node.minWidth) pruned.minWidth = node.minWidth;
  if (node.maxWidth) pruned.maxWidth = node.maxWidth;
  if (node.minHeight) pruned.minHeight = node.minHeight;
  if (node.maxHeight) pruned.maxHeight = node.maxHeight;

  // Styling: Fills, Strokes, Borders, Corners
  const fills = simplifyFills(node.fills, bound, varMap);
  if (fills) pruned.fills = fills;

  const strokes = simplifyStrokes(node.strokes, node.strokeWeight, node.strokeAlign, bound, varMap);
  if (strokes) pruned.strokes = strokes;

  if (node.cornerRadius) {
    pruned.cornerRadius = node.cornerRadius;
    const radiusToken = resolveVariableToken(bound.cornerRadius, varMap);
    if (radiusToken) pruned.cornerRadiusToken = radiusToken;
  }
  if (node.rectangleCornerRadii) pruned.cornerRadii = node.rectangleCornerRadii;
  if (node.opacity !== undefined && node.opacity !== 1) pruned.opacity = node.opacity;

  // Effects (Drop Shadows, Layer Blurs)
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

  // Typography (for TEXT nodes)
  if (node.type === 'TEXT') {
    pruned.characters = node.characters;
    if (node.style) {
      pruned.typography = {
        fontFamily: node.style.fontFamily,
        fontSize: node.style.fontSize,
        fontWeight: node.style.fontWeight,
        lineHeightPx: node.style.lineHeightPx ? Math.round(node.style.lineHeightPx) : undefined,
        letterSpacing: node.style.letterSpacing,
        textAlignHorizontal: node.style.textAlignHorizontal,
        textAlignVertical: node.style.textAlignVertical,
      };
    }
  }

  // Recursively process children
  if (Array.isArray(node.children) && node.children.length > 0) {
    pruned.children = node.children
      .filter((c) => c.visible !== false)
      .map((c) => pruneFigmaNode(c, context, options));
  }

  return pruned;
}

// -----------------------------------------------------------------------------
// Rate Limit Circuit Breaker & Safety Gate
// -----------------------------------------------------------------------------

const RATE_GATE_WINDOW_MS = 60 * 1000; // 60 seconds sliding window
const MAX_REQUESTS_PER_WINDOW = 5; // Max 5 calls per minute (well below Figma 10/min threshold)
const MIN_REQUEST_INTERVAL_MS = 2500; // Minimum 2.5s between consecutive requests

function getRateGateFilePath() {
  const home = process.env.HOME || (typeof os.homedir === 'function' ? os.homedir() : '');
  return home ? path.join(home, '.figma_ratelimit.json') : path.join(process.cwd(), '.figma_ratelimit.json');
}

function loadRateGateState() {
  const filePath = getRateGateFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (_) {}
  }
  return { files: {} };
}

function saveRateGateState(state) {
  const filePath = getRateGateFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

function resetRateGateState(fileKey) {
  const state = loadRateGateState();
  if (!state.files) state.files = {};
  if (fileKey) {
    delete state.files[fileKey];
  } else {
    state.files = {};
  }
  saveRateGateState(state);
}

function recordRateLimitLockout(fileKey, retryAfterSeconds) {
  if (!fileKey || !retryAfterSeconds) return;
  const state = loadRateGateState();
  if (!state.files) state.files = {};
  const fileState = state.files[fileKey] || { timestamps: [], lockedUntil: 0 };
  fileState.lockedUntil = Date.now() + (retryAfterSeconds * 1000);
  fileState.lastRetryAfter = retryAfterSeconds;
  state.files[fileKey] = fileState;
  saveRateGateState(state);
}

async function checkAndApplyRateGate(fileKey, options = {}) {
  if (!fileKey) return;
  const state = loadRateGateState();
  if (!state.files) state.files = {};
  const fileState = state.files[fileKey] || { timestamps: [], lockedUntil: 0 };
  const now = Date.now();

  // 1. Circuit Breaker: Is the file actively locked out by a previous 429 response?
  if (fileState.lockedUntil && fileState.lockedUntil > now) {
    const remainingSec = Math.ceil((fileState.lockedUntil - now) / 1000);
    const unlockDate = new Date(fileState.lockedUntil).toLocaleString();
    const hours = (remainingSec / 3600).toFixed(1);
    const err = new Error(
      `FIGMA_CIRCUIT_BREAKER_ACTIVE: File "${fileKey}" is actively locked by Figma rate limiting until ${unlockDate} (~${remainingSec}s / ~${hours}h remaining). Outgoing API requests to this file are blocked to prevent extending the lockout duration. To continue immediately, duplicate this file in Figma Drafts (Right-click -> Duplicate) to obtain a fresh file key.`
    );
    err.isCircuitBreaker = true;
    err.statusCode = 429;
    err.retryAfter = remainingSec;
    err.lockedUntil = fileState.lockedUntil;
    throw err;
  }

  // 2. Sliding Window: Clean timestamps older than 60 seconds
  fileState.timestamps = (fileState.timestamps || []).filter((t) => now - t < RATE_GATE_WINDOW_MS);

  // 3. Inter-request pacing: Ensure at least MIN_REQUEST_INTERVAL_MS since last call
  if (fileState.timestamps.length > 0 && !options.noWait) {
    const lastTimestamp = fileState.timestamps[fileState.timestamps.length - 1];
    const elapsed = now - lastTimestamp;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      const waitMs = MIN_REQUEST_INTERVAL_MS - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  // 4. Sliding window burst limit: Cap at MAX_REQUESTS_PER_WINDOW calls/minute
  if (fileState.timestamps.length >= MAX_REQUESTS_PER_WINDOW && !options.noWait) {
    const oldestTimestamp = fileState.timestamps[0];
    const waitMs = RATE_GATE_WINDOW_MS - (Date.now() - oldestTimestamp) + 200;
    if (waitMs > 0) {
      console.error(
        `[RateLimitGuard] Approaching Figma rate limit: pausing ${(waitMs / 1000).toFixed(1)}s to protect file quota...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  // Record this request timestamp
  const currentNow = Date.now();
  fileState.timestamps = (fileState.timestamps || []).filter((t) => currentNow - t < RATE_GATE_WINDOW_MS);
  fileState.timestamps.push(currentNow);
  state.files[fileKey] = fileState;
  saveRateGateState(state);
}

// -----------------------------------------------------------------------------
// Figma API Execution
// -----------------------------------------------------------------------------

async function executeFigmaRequest(url, headers, fileKey, options = {}) {
  if (!options.bypassRateGate && fileKey) {
    await checkAndApplyRateGate(fileKey, options);
  }
  return makeRequest(url, headers);
}

async function fetchFigmaVariables(fileKey, headers, options = {}) {
  const state = loadRateGateState();
  if (state.files && state.files[fileKey] && state.files[fileKey].variablesSupported === false) {
    // Proactively skip: this file does not support variables or lacks scope
    return null;
  }

  const url = `https://api.figma.com/v1/files/${fileKey}/variables/local`;
  try {
    const rawData = await executeFigmaRequest(url, headers, fileKey, options);
    const parsed = JSON.parse(rawData);
    if (parsed.status === 200 && parsed.meta) {
      return parsed.meta;
    }
    return null;
  } catch (e) {
    // Only re-throw rate limit (429) so callers can respect rate-limiting policies
    if (e.statusCode === 429) {
      throw e;
    }
    // Proactively record lack of variable scope so subsequent runs save an API call
    if (e.statusCode === 403 || e.statusCode === 404) {
      const currentState = loadRateGateState();
      if (!currentState.files) currentState.files = {};
      const fileState = currentState.files[fileKey] || { timestamps: [], lockedUntil: 0 };
      fileState.variablesSupported = false;
      currentState.files[fileKey] = fileState;
      saveRateGateState(currentState);
    }
    return null;
  }
}

function buildVariableMap(variablesMeta) {
  const varMap = {};
  const dictionary = {
    colors: {},
    spacing: {},
    radii: {},
    typography: {},
    other: {},
  };

  if (!variablesMeta || !variablesMeta.variables) {
    return { varMap, dictionary };
  }

  const variables = variablesMeta.variables;
  const sets = variablesMeta.variableSets || {};

  for (const [id, variable] of Object.entries(variables)) {
    const name = variable.name;
    const type = variable.resolvedType;
    varMap[id] = { name, resolvedType: type };

    const set = sets[variable.variableSetId];
    const defaultModeId = set?.defaultModeId;
    const modes = variable.valuesByMode || {};
    const val = (defaultModeId && modes[defaultModeId]) ?? Object.values(modes)[0];

    let formattedVal = val;
    if (type === 'COLOR' && val && typeof val === 'object') {
      formattedVal = formatRgba(val);
    }

    // Categorize into dictionary buckets.
    // Priority order: colors > spacing > radii > typography > other
    // Variables with overlapping keywords (e.g. "text/fill/primary") land in the first matching bucket.
    const lowerName = name.toLowerCase();
    if (type === 'COLOR' || lowerName.includes('color') || lowerName.includes('brand') || lowerName.includes('bg') || lowerName.includes('fill')) {
      dictionary.colors[name] = formattedVal;
    } else if (lowerName.includes('spac') || lowerName.includes('gap') || lowerName.includes('padding') || lowerName.includes('margin') || lowerName.includes('offset')) {
      dictionary.spacing[name] = formattedVal;
    } else if (lowerName.includes('radi') || lowerName.includes('corner') || lowerName.includes('round')) {
      dictionary.radii[name] = formattedVal;
    } else if (lowerName.includes('font') || lowerName.includes('text') || lowerName.includes('size') || lowerName.includes('typography')) {
      dictionary.typography[name] = formattedVal;
    } else {
      dictionary.other[name] = formattedVal;
    }
  }

  return { varMap, dictionary };
}

async function fetchFigmaNodes(fileKey, nodeId, headers, options = {}) {
  let url = `https://api.figma.com/v1/files/${fileKey}`;
  if (nodeId) {
    url += `/nodes?ids=${encodeURIComponent(nodeId)}`;
    if (options.depth) url += `&depth=${options.depth}`;
  } else if (options.depth) {
    url += `?depth=${options.depth}`;
  }

  const rawData = await executeFigmaRequest(url, headers, fileKey, options);
  const parsed = JSON.parse(rawData);

  // Fetch variables unless explicitly disabled
  let varMap = {};
  let tokensDictionary = null;
  if (!options.noVariables) {
    const varsMeta = await fetchFigmaVariables(fileKey, headers, options);
    const built = buildVariableMap(varsMeta);
    varMap = built.varMap;
    tokensDictionary = built.dictionary;
  }

  const context = {
    varMap,
    components: parsed.components || {},
    componentSets: parsed.componentSets || {},
  };

  if (nodeId && parsed.nodes) {
    const targetNode = parsed.nodes[nodeId];
    if (!targetNode || !targetNode.document) {
      throw new Error(`Node ID "${nodeId}" not found in Figma file "${fileKey}".`);
    }

    // Merge components if present in target node
    if (targetNode.components) {
      context.components = { ...context.components, ...targetNode.components };
    }
    if (targetNode.componentSets) {
      context.componentSets = { ...context.componentSets, ...targetNode.componentSets };
    }

    if (options.raw) {
      const rawRes = {
        name: parsed.name,
        lastModified: parsed.lastModified,
        thumbnailUrl: parsed.thumbnailUrl,
        node: targetNode.document,
        components: targetNode.components,
        componentSets: targetNode.componentSets,
        schemaVersion: parsed.schemaVersion,
      };
      if (options.includeTokens && tokensDictionary) {
        rawRes.tokens = tokensDictionary;
      }
      return rawRes;
    }

    const res = {
      name: parsed.name,
      node: pruneFigmaNode(targetNode.document, context, options),
    };
    if (options.includeTokens && tokensDictionary) {
      res.tokens = tokensDictionary;
    }
    return res;
  }

  if (options.raw) {
    const rawRes = {
      name: parsed.name,
      lastModified: parsed.lastModified,
      document: parsed.document,
      components: parsed.components,
      componentSets: parsed.componentSets,
    };
    if (options.includeTokens && tokensDictionary) {
      rawRes.tokens = tokensDictionary;
    }
    return rawRes;
  }

  const res = {
    name: parsed.name,
    document: pruneFigmaNode(parsed.document, context, options),
  };
  if (options.includeTokens && tokensDictionary) {
    res.tokens = tokensDictionary;
  }
  return res;
}

async function fetchFigmaImage(fileKey, nodeId, headers, targetPath, options = {}) {
  const scale = options.scale || 2;
  const format = options.format || 'png';
  const url = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&scale=${scale}&format=${format}`;

  const rawData = await executeFigmaRequest(url, headers, fileKey, options);
  const parsed = JSON.parse(rawData);

  if (parsed.err) {
    throw new Error(`Figma Image API error: ${parsed.err}`);
  }

  const imageUrl = parsed.images ? parsed.images[nodeId] : null;
  if (!imageUrl) {
    throw new Error(`No rendered image returned for node ID "${nodeId}".`);
  }

  const resolvedPath = path.resolve(
    targetPath || `./.specs/figma_${fileKey}_${nodeId.replace(/:/g, '_')}.${format}`,
  );

  await downloadBinaryFile(imageUrl, resolvedPath);
  return {
    path: resolvedPath,
    format,
    scale,
    remoteUrl: imageUrl,
  };
}

// -----------------------------------------------------------------------------
// CLI Argument Parsing
// -----------------------------------------------------------------------------

function parseArguments(argv) {
  const args = argv.slice(2);
  const result = {
    fileKey: null,
    nodeId: null,
    imagePath: null,
    downloadImage: false,
    raw: false,
    depth: null,
    scale: 2,
    format: 'png',
    tokensOnly: false,
    shallowInstances: false,
    noVariables: false,
    includeTokens: false,
    includeIds: false,
    pretty: false,
    force: false,
    help: false,
  };

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    result.help = true;
    return result;
  }

  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--raw') {
      result.raw = true;
    } else if (arg === '--image' || arg === '-i' || arg === '--download-image') {
      result.downloadImage = true;
    } else if (arg === '--image-path' || arg === '-o' || arg === '--output') {
      if (i + 1 >= args.length) continue;
      result.imagePath = args[++i];
      result.downloadImage = true;
    } else if (arg === '--depth') {
      if (i + 1 >= args.length) continue;
      result.depth = parseInt(args[++i], 10);
    } else if (arg === '--scale') {
      if (i + 1 >= args.length) continue;
      result.scale = parseFloat(args[++i]);
    } else if (arg === '--format') {
      if (i + 1 >= args.length) continue;
      result.format = args[++i].toLowerCase();
    } else if (arg === '--tokens' || arg === '--variables') {
      result.tokensOnly = true;
    } else if (arg === '--shallow-instances') {
      result.shallowInstances = true;
    } else if (arg === '--no-variables') {
      result.noVariables = true;
    } else if (arg === '--include-tokens') {
      result.includeTokens = true;
    } else if (arg === '--include-ids') {
      result.includeIds = true;
    } else if (arg === '--pretty') {
      result.pretty = true;
    } else if (arg === '--reset-circuit-breaker' || arg === '--reset-rate-gate') {
      result.resetRateGate = true;
    } else if (arg === '--bypass-circuit-breaker' || arg === '--bypass-rate-gate' || arg === '--no-rate-gate') {
      result.bypassRateGate = true;
    } else if (arg === '--force' || arg === '-f' || arg === '--fresh') {
      result.force = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length === 0 && !result.help) {
    return result;
  }

  const first = positional[0];
  const isUrl = first.includes('figma.com') || first.startsWith('http://') || first.startsWith('https://');

  if (isUrl) {
    const parsed = parseFigmaUrl(first);
    result.fileKey = parsed.fileKey;
    result.nodeId = parsed.nodeId || (positional.length >= 2 ? normalizeNodeId(positional[1]) : null);
  } else {
    // Parameters style: <fileKey> [nodeId]
    result.fileKey = positional[0];
    if (positional.length >= 2) {
      result.nodeId = normalizeNodeId(positional[1]);
    }
  }

  return result;
}

function printUsage() {
  console.log(`
Figma Extractor - Design-System-Aware Agent Skill

Usage:
  node fetch_figma.js <FigmaURL> [options]
  node fetch_figma.js <fileKey> [nodeId] [options]

Options:
  --image, -i                  Download rendered preview image from Figma (Tier 1 call; optional)
  --image-path, -o <path>      Target path for saved preview image (implies --image)
  --tokens, --variables        Export only the design token dictionary (colors, spacing, radii)
  --shallow-instances          Collapse internal layers of component instances into props
  --include-tokens             Include complete tokens dictionary in node output
  --include-ids                Keep Figma internal node IDs in pruned AST
  --pretty                     Pretty-print JSON with 2-space indentation (default is minified)
  --raw                        Return full raw Figma API response (unpruned)
  --depth <number>             Traverse node tree down to specific depth
  --scale <1|2|3|4>            Image render scale (default: 2)
  --format <png|svg|jpg|pdf>   Image format (default: png)
  --no-variables               Skip querying /variables/local
  --help, -h                   Show this help message

Examples:
  # Standard AST extraction (1 Tier 1 call)
  node fetch_figma.js "https://www.figma.com/design/1KP9pVQ1ptZzHa3Gcpr6ta/App?node-id=4023-474"

  # Optional: with companion preview image (2 Tier 1 calls)
  node fetch_figma.js "https://www.figma.com/design/1KP9pVQ1ptZzHa3Gcpr6ta/App?node-id=4023-474" -i
  node fetch_figma.js "https://www.figma.com/design/1KP9pVQ1ptZzHa3Gcpr6ta/App" --tokens
`);
}

// -----------------------------------------------------------------------------
// Main CLI Function
// -----------------------------------------------------------------------------

async function main() {
  loadEnv();
  const config = parseArguments(process.argv);

  if (config.resetRateGate) {
    resetRateGateState(config.fileKey);
    console.log(
      JSON.stringify(
        {
          message: `Rate limit safety gate cleared${config.fileKey ? ` for "${config.fileKey}"` : ''}.`,
          success: true,
        },
        null,
        config.pretty ? 2 : 0,
      ),
    );
    return;
  }

  if (config.help || !config.fileKey) {
    printUsage();
    if (!config.help) {
      console.error(
        JSON.stringify(
          {
            error: 'Missing required Figma URL or fileKey.',
          },
          null,
          config.pretty ? 2 : 0,
        ),
      );
      process.exit(1);
    }
    process.exit(0);
  }

  const token = getFigmaToken();
  if (!token) {
    console.error(
      JSON.stringify(
        {
          error:
            'FIGMA_ACCESS_TOKEN is not set. Please set FIGMA_ACCESS_TOKEN in your environment or in the workspace .env file.',
          isTokenMissing: true,
        },
        null,
        config.pretty ? 2 : 0,
      ),
    );
    process.exit(1);
  }

  const headers = getAuthHeaders(token);

  try {
    // Mode: Tokens Only
    if (config.tokensOnly) {
      const varsMeta = await fetchFigmaVariables(config.fileKey, headers, {
        bypassRateGate: config.bypassRateGate,
      });
      if (!varsMeta) {
        console.error(
          JSON.stringify(
            {
              error:
                'FIGMA_VARIABLES_NOT_ACCESSIBLE: Variables could not be fetched from /variables/local. Ensure your Figma access token has the "file_variables:read" scope and the file belongs to an Organization or Enterprise workspace supporting design tokens.',
              statusCode: 403,
            },
            null,
            config.pretty ? 2 : 0,
          ),
        );
        process.exit(1);
      }
      const { dictionary } = buildVariableMap(varsMeta);
      console.log(
        JSON.stringify(
          {
            tokens: dictionary,
          },
          null,
          config.pretty ? 2 : 0,
        ),
      );
      return;
    }

    // 1. Fetch Node JSON
    const nodeData = await fetchFigmaNodes(config.fileKey, config.nodeId, headers, {
      raw: config.raw,
      depth: config.depth,
      shallowInstances: config.shallowInstances,
      noVariables: config.noVariables,
      includeTokens: config.includeTokens,
      includeIds: config.includeIds,
      bypassRateGate: config.bypassRateGate,
    });

    // 2. Fetch Image Preview if requested
    let imageResult = null;
    if (config.downloadImage && config.nodeId) {
      try {
        if (config.imagePath && fs.existsSync(path.resolve(config.imagePath)) && !config.force) {
          imageResult = {
            path: path.resolve(config.imagePath),
            source: 'local',
          };
        } else {
          imageResult = await fetchFigmaImage(
            config.fileKey,
            config.nodeId,
            headers,
            config.imagePath,
            { scale: config.scale, format: config.format, bypassRateGate: config.bypassRateGate },
          );
        }
      } catch (imgErr) {
        imageResult = {
          error: `Failed to download image preview: ${imgErr.message}`,
        };
      }
    }

    // 3. Assemble structured result (compact & token-optimized)
    const output = {
      ...nodeData,
    };

    if (imageResult) {
      output.image = imageResult;
    }

    console.log(JSON.stringify(output, null, config.pretty ? 2 : 0));
  } catch (error) {
    if (error.statusCode === 429 && error.retryAfter && !error.isCircuitBreaker) {
      recordRateLimitLockout(config.fileKey, error.retryAfter);
    }
    const errorPayload = formatApiError(error);
    console.error(JSON.stringify(errorPayload, null, config.pretty ? 2 : 0));
    process.exit(1);
  }
}

function formatApiError(error) {
  let errorMessage = error.message;
  let isCircuitBreaker = Boolean(error.isCircuitBreaker);
  let isTokenExpiredOrInvalid = false;
  let isSslError = false;
  let isRateLimited = error.statusCode === 429 || isCircuitBreaker;
  const retryAfter = error.retryAfter !== undefined ? error.retryAfter : null;
  const rateLimitType = error.rateLimitType || null;

  if (isCircuitBreaker) {
    errorMessage = error.message;
  } else if (error.statusCode === 401 || error.statusCode === 403) {
    isTokenExpiredOrInvalid = true;
    errorMessage =
      'FIGMA_TOKEN_EXPIRED_OR_INVALID: The provided Figma access token is expired, invalid, or unauthorized. Create a new token in Figma Settings -> Personal Access Tokens and export FIGMA_ACCESS_TOKEN or add it to .env.';
  } else if (error.statusCode === 429) {
    isRateLimited = true;
    let retryMsg = ' Please wait 30-60 seconds before making more requests.';
    if (retryAfter !== null) {
      if (retryAfter > 3600) {
        const hours = Math.round(retryAfter / 3600);
        const days = (retryAfter / 86400).toFixed(1);
        retryMsg = ` Please retry after ${retryAfter} seconds (~${hours} hours / ${days} days). This file or token may have exceeded the monthly Starter plan quota (up to 20 calls/month). Consider moving the file to a paid team or waiting until the quota resets.`;
      } else {
        retryMsg = ` Please retry after ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`;
      }
    }
    const typeMsg = rateLimitType ? ` (Policy: ${rateLimitType})` : '';
    errorMessage = `FIGMA_RATE_LIMIT_EXCEEDED: Figma API rate limit reached.${typeMsg}${retryMsg}`;
  } else if (
    error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    (error.message &&
      (error.message.toLowerCase().includes('self-signed') ||
        error.message.toLowerCase().includes('self signed')))
  ) {
    isSslError = true;
    errorMessage =
      'FIGMA_SSL_CERTIFICATE_ERROR: Self-signed certificate error. Set FIGMA_IGNORE_SSL=true in your .env file or environment to bypass.';
  }

  const payload = {
    error: errorMessage,
    statusCode: error.statusCode || null,
    isCircuitBreaker,
    isTokenExpiredOrInvalid,
    isSslError,
    isRateLimited,
  };

  if (retryAfter !== null) {
    payload.retryAfter = retryAfter;
  }
  if (rateLimitType) {
    payload.rateLimitType = rateLimitType;
  }

  return payload;
}

// Export internal functions for unit testing
module.exports = {
  loadEnv,
  parseEnvLine,
  getFigmaToken,
  getAuthHeaders,
  parseFigmaUrl,
  normalizeNodeId,
  formatRgba,
  simplifyFills,
  simplifyStrokes,
  normalizePropKey,
  normalizeComponentProps,
  buildVariableMap,
  pruneFigmaNode,
  parseArguments,
  formatApiError,
  executeFigmaRequest,
  fetchFigmaVariables,
  checkAndApplyRateGate,
  loadRateGateState,
  saveRateGateState,
  resetRateGateState,
  recordRateLimitLockout,
  getRateGateFilePath,
};

if (require.main === module) {
  main();
}
