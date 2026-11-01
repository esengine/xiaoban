export function plain(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~|`)/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
