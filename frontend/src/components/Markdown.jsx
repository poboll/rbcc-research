import React from "react";

const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;

function safeHref(value) {
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : "#";
  } catch { return "#"; }
}

function inline(text, keyPrefix) {
  return String(text).split(INLINE_PATTERN).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link) return <a key={key} href={safeHref(link[2])} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

export function Markdown({ children, className = "markdown" }) {
  const lines = String(children ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      index += index < lines.length ? 1 : 0;
      blocks.push(<pre key={`code-${index}`}><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length + 2}`;
      blocks.push(<Tag key={`heading-${index}`}>{inline(heading[2], `heading-${index}`)}</Tag>);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={`quote-${index}`}>{quote.map((item, i) => <p key={i}>{inline(item, `quote-${index}-${i}`)}</p>)}</blockquote>);
      continue;
    }
    const listMatch = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const items = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/);
        if (!match || Boolean(match[2]) !== ordered) break;
        items.push(match[3]); index += 1;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(<Tag key={`list-${index}`}>{items.map((item, i) => <li key={i}>{inline(item, `list-${index}-${i}`)}</li>)}</Tag>);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s|^```|^>\s?|^\s*(?:[-*+]|\d+\.)\s+/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.map((item, i) => <React.Fragment key={i}>{i ? <br/> : null}{inline(item, `paragraph-${index}-${i}`)}</React.Fragment>)}</p>);
  }
  return <div className={className}>{blocks}</div>;
}
