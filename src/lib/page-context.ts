// src/lib/page-context.ts
import { isVisible } from './dom-utils';

export interface PageMetadata {
  url: string;
  title: string;
  scrollPercent: number;
  viewportHeight: number;
  viewportWidth: number;
  focusedElement: string;
}

export interface RichPageMetadata extends PageMetadata {
  domain: string;
  name: string;
  description: string;
  canonicalUrl: string;
  language: string;
  formsCount: number;
  tablesCount: number;
  wordCount: number;
  snippet: string;
  faviconChar: string;
  faviconBg: string;
}

const FAVICON_BG_PALETTE = [
  '#7772E8', '#6366F1', '#8B5CF6', '#EC4899', '#3B82F6', 
  '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#14B8A6'
];

function getDomainColor(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FAVICON_BG_PALETTE.length;
  return FAVICON_BG_PALETTE[index];
}

function getCleanSiteName(hostname: string, title: string): string {
  if (!hostname) return 'Active Webpage';
  const cleanHost = hostname.replace(/^www\./i, '');
  const parts = cleanHost.split('.');
  if (parts.length > 0 && parts[0]) {
    const raw = parts[0];
    if (raw.toLowerCase() === 'github') return 'GitHub';
    if (raw.toLowerCase() === 'youtube') return 'YouTube';
    if (raw.toLowerCase() === 'google') return 'Google';
    if (raw.toLowerCase() === 'wikipedia') return 'Wikipedia';
    if (raw.toLowerCase() === 'reddit') return 'Reddit';
    if (raw.toLowerCase() === 'x' || raw.toLowerCase() === 'twitter') return 'X / Twitter';
    if (raw.toLowerCase() === 'linkedin') return 'LinkedIn';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return title.split(/[-|—]/)[0]?.trim() || cleanHost;
}

export function getPageMetadata(): PageMetadata {
  const scrollHeight = Math.max(
    document.body.scrollHeight, document.documentElement.scrollHeight,
    document.body.offsetHeight, document.documentElement.offsetHeight,
    document.body.clientHeight, document.documentElement.clientHeight
  );
  
  const scrollPercent = scrollHeight > window.innerHeight 
    ? Math.round((window.scrollY / (scrollHeight - window.innerHeight)) * 100)
    : 0;

  let focusedElementStr = 'None';
  if (document.activeElement && document.activeElement !== document.body) {
    const el = document.activeElement as HTMLElement;
    // Guard: do NOT extract sensitive password values or tokens
    const isSensitive = el.getAttribute('type') === 'password' || 
                        el.getAttribute('autocomplete')?.includes('password') ||
                        el.getAttribute('autocomplete')?.includes('cc-');
    
    focusedElementStr = `${el.tagName.toLowerCase()}`;
    const label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || (isSensitive ? '[REDACTED]' : el.textContent);
    if (label) focusedElementStr += ` — "${label.substring(0, 30).trim()}"`;
  }

  return {
    url: window.location.href,
    title: document.title || 'Untitled Webpage',
    scrollPercent,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    focusedElement: focusedElementStr,
  };
}

export function getRichPageMetadata(semanticText = ''): RichPageMetadata {
  const base = getPageMetadata();
  const domain = window.location.hostname.replace(/^www\./i, '') || 'browser.tab';
  const name = getCleanSiteName(window.location.hostname, base.title);
  
  const descEl = document.querySelector('meta[name="description"]') || 
                 document.querySelector('meta[property="og:description"]');
  const description = descEl?.getAttribute('content')?.trim() || '';

  const canonicalEl = document.querySelector('link[rel="canonical"]');
  const canonicalUrl = canonicalEl?.getAttribute('href') || window.location.href;

  const language = document.documentElement.lang || 'en';
  const formsCount = document.forms.length;
  const tablesCount = document.querySelectorAll('table').length;
  
  // Word count from visible semantic text
  const words = semanticText ? semanticText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  // Snippet preview (description or first 240 chars of semantic text)
  let snippet = description;
  if (!snippet && semanticText) {
    snippet = semanticText.replace(/^[#\-\s]+/gm, '').slice(0, 240).trim();
    if (semanticText.length > 240) snippet += '...';
  }

  const faviconChar = name.charAt(0).toUpperCase() || 'W';
  const faviconBg = getDomainColor(domain);

  return {
    ...base,
    domain,
    name,
    description,
    canonicalUrl,
    language,
    formsCount,
    tablesCount,
    wordCount,
    snippet,
    faviconChar,
    faviconBg,
  };
}

export function extractSemanticText(root: Element = document.body): string {
  let textLines: string[] = [];

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent?.trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
        
        const el = node as Element;
        
        if (!isVisible(el, true)) {
          return NodeFilter.FILTER_REJECT;
        }

        const tag = el.tagName.toLowerCase();
        if (
          tag === 'script' || 
          tag === 'style' || 
          tag === 'svg' || 
          tag === 'noscript' || 
          tag === 'iframe' ||
          tag === 'canvas'
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        // Exclude password and sensitive form elements
        if (tag === 'input' && (el as HTMLInputElement).type === 'password') {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let currentNode = walker.nextNode();
  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE && currentNode.textContent) {
      const text = currentNode.textContent.trim().replace(/\s+/g, ' ');
      if (text) {
        const parent = currentNode.parentElement;
        if (parent) {
          const tag = parent.tagName.toLowerCase();
          if (tag === 'h1') textLines.push(`# ${text}`);
          else if (tag === 'h2') textLines.push(`## ${text}`);
          else if (tag === 'h3') textLines.push(`### ${text}`);
          else if (tag === 'li') textLines.push(`- ${text}`);
          else textLines.push(text);
        } else {
          textLines.push(text);
        }
      }
    }
    currentNode = walker.nextNode();
  }

  const fullText = textLines.join('\n');
  const MAX_CHARS = 10000;
  
  if (fullText.length <= MAX_CHARS) {
    return fullText;
  }
  
  // Find the last newline or space before the cutoff to cleanly truncate
  const cutoffIndex = fullText.lastIndexOf('\n', MAX_CHARS) > -1 
    ? fullText.lastIndexOf('\n', MAX_CHARS) 
    : fullText.lastIndexOf(' ', MAX_CHARS);
    
  const cleanTruncation = cutoffIndex > -1 ? fullText.substring(0, cutoffIndex) : fullText.substring(0, MAX_CHARS);
  
  return cleanTruncation + '\n\n... [Page content truncated. If you cannot find the answer, scroll down to reveal more text.]';
}
