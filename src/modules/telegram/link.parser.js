/**
 * Link parser — detects and validates video URLs from Telegram messages.
 * No external dependencies. Pure regex + URL parsing.
 */

// Private/reserved IP ranges — block to prevent SSRF
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^localhost$/i,
  /^0\.0\.0\.0$/
];

const SUPPORTED_SOURCES = {
  CLIPNOVA: 'CLIPNOVA',   // our own short links — highest priority
  TERABOX: 'TERABOX',
  DAILYMOTION: 'DAILYMOTION',
  DIRECT_MP4: 'DIRECT_MP4',
  STREAMTAPE: 'STREAMTAPE',
  MIXDROP: 'MIXDROP',
  DOODSTREAM: 'DOODSTREAM'
};

// Ordered: most specific first — ClipNova links checked FIRST
const SOURCE_PATTERNS = [
  {
    // Matches:
    //   https://anything.com/watch/SHORTCODE
    //   https://anything.vercel.app/watch/SHORTCODE
    //   https://anything.com/api/l/SHORTCODE
    //   https://anything.com/l/SHORTCODE
    source: SUPPORTED_SOURCES.CLIPNOVA,
    pattern: /https?:\/\/[^\s"'<>]+\/(?:watch|(?:api\/)?l)\/([A-Za-z0-9]{4,32})(?:[\s"'<>?#/]|$)/i
  },
  {
    source: SUPPORTED_SOURCES.TERABOX,
    pattern: /https?:\/\/(?:www\.)?(?:1024terabox|terabox|4funbox|freeterabox|mirrobox|nephobox|teraboxapp|momerybox|tibibox|teraboxlink|terafileshare|terasharelink|terasharefile|1024tera)\.(?:com|site|app|io|net)\/[^\s"'<>]{4,}/i
  },
  {
    source: SUPPORTED_SOURCES.DAILYMOTION,
    pattern: /https?:\/\/(?:www\.)?(?:dailymotion\.com\/video\/|dai\.ly\/)[a-zA-Z0-9_-]+/i
  },
  {
    source: SUPPORTED_SOURCES.STREAMTAPE,
    pattern: /https?:\/\/(?:www\.)?streamtape\.com\/v\/[^\s"'<>]+/i
  },
  {
    source: SUPPORTED_SOURCES.MIXDROP,
    pattern: /https?:\/\/(?:www\.)?mixdrop\.[a-z]+\/[^\s"'<>]+/i
  },
  {
    source: SUPPORTED_SOURCES.DOODSTREAM,
    pattern: /https?:\/\/(?:www\.)?(?:dood\.[a-z]+|doodstream\.com)\/[^\s"'<>]+/i
  },
  {
    source: SUPPORTED_SOURCES.DIRECT_MP4,
    pattern: /https?:\/\/[^\s"'<>]+\.(?:mp4|mkv|webm|avi|mov|m3u8)(?:\?[^\s"'<>]*)?/i
  }
];

/**
 * Extract all text from a Telegram message (text + caption + forwarded).
 */
const extractMessageText = (msg) => {
  const parts = [];
  if (msg.text) parts.push(msg.text);
  if (msg.caption) parts.push(msg.caption);
  // forwarded channel post may have caption only
  if (msg.forward_from_chat && msg.caption && !parts.includes(msg.caption)) {
    parts.push(msg.caption);
  }
  return parts.join(' ');
};

/**
 * Check if a URL points to a private/reserved IP (SSRF protection).
 */
const isPrivateUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return PRIVATE_IP_PATTERNS.some((p) => p.test(host));
  } catch {
    return true; // unparseable = reject
  }
};

/**
 * Detect the first supported video link in a message.
 * Returns { url, source, shortCode? } or null.
 */
const detectVideoLink = (msg) => {
  const text = extractMessageText(msg);
  if (!text || text.length > 4096) return null;

  for (const { source, pattern } of SOURCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // For ClipNova links, extract just the shortCode cleanly
      if (source === SUPPORTED_SOURCES.CLIPNOVA) {
        const shortCode = match[1];
        if (!shortCode) continue;
        const rawUrl = match[0].trim().replace(/[\s"'<>?#].*$/, '');
        // Still block SSRF for ClipNova-like patterns on private IPs
        if (isPrivateUrl(rawUrl)) continue;
        return { url: rawUrl, source, shortCode };
      }
      const url = match[0].trim().replace(/[.,;!?)]+$/, '');
      if (isPrivateUrl(url)) continue;
      if (url.length > 2048) continue;
      return { url, source };
    }
  }

  return null;
};

/**
 * Detect ALL supported video links in a message (for batch processing).
 * Returns array of { url, source, shortCode? } or empty array.
 */
const detectAllVideoLinks = (msg) => {
  const text = extractMessageText(msg);
  if (!text || text.length > 4096) return [];

  const results = [];
  const seen = new Set(); // dedup

  for (const { source, pattern } of SOURCE_PATTERNS) {
    // Use global flag to find all matches
    const globalPattern = new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g'));
    let match;
    
    while ((match = globalPattern.exec(text)) !== null) {
      let url, shortCode;
      
      if (source === SUPPORTED_SOURCES.CLIPNOVA) {
        shortCode = match[1];
        if (!shortCode) continue;
        url = match[0].trim().replace(/[\s"'<>?#].*$/, '');
        if (isPrivateUrl(url)) continue;
        
        // Dedup by shortCode
        if (seen.has(shortCode)) continue;
        seen.add(shortCode);
        
        results.push({ url, source, shortCode });
      } else {
        url = match[0].trim().replace(/[.,;!?)]+$/, '');
        if (isPrivateUrl(url)) continue;
        if (url.length > 2048) continue;
        
        // Dedup by full URL
        if (seen.has(url)) continue;
        seen.add(url);
        
        results.push({ url, source });
      }
    }
  }

  return results;
};

/**
 * Normalize a TeraBox URL to a canonical form.
 */
const normalizeTeraboxUrl = (url) => {
  try {
    const parsed = new URL(url);
    // Normalize all terabox domains to 1024terabox.com
    parsed.hostname = '1024terabox.com';
    // Strip tracking params, keep only path + essential query
    const allowed = ['surl', 's'];
    const params = new URLSearchParams();
    for (const key of allowed) {
      if (parsed.searchParams.has(key)) {
        params.set(key, parsed.searchParams.get(key));
      }
    }
    parsed.search = params.toString() ? `?${params.toString()}` : '';
    return parsed.toString();
  } catch {
    return url;
  }
};

module.exports = {
  SUPPORTED_SOURCES,
  detectVideoLink,
  detectAllVideoLinks,
  extractMessageText,
  normalizeTeraboxUrl,
  isPrivateUrl
};
