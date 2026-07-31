// Renders the small markup subset used by editable copy — [label](url) links and
// **bold** — into React elements.
//
// Deliberately not HTML-in-the-database rendered through dangerouslySetInnerHTML:
// output here is real React nodes, so stored text can never inject markup no
// matter what ends up in Firestore. The subset is exactly what the copy needs;
// anything richer would mean a rich-text editor and a sanitiser to go with it.

// Built per call rather than hoisted to module scope. The regex is /g, so it
// carries a mutable lastIndex, and this function recurses into its own matches —
// a shared instance would have the inner walk reset the outer one's position
// mid-loop.
function inlineMatcher() {
  return /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
}

// A link label may contain **bold** and bold may contain a link, so each match
// recurses into its own contents. Every match consumes at least one character,
// so the recursion always shrinks.
function renderInline(text, keyPrefix) {
  const nodes = [];
  const matcher = inlineMatcher();
  let last = 0;
  let match;

  while ((match = matcher.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));

    const [whole, label, url, bold] = match;
    const key = `${keyPrefix}-${match.index}`;

    if (label !== undefined) {
      nodes.push(
        <a key={key} href={url} target="_blank" rel="noopener noreferrer">
          {renderInline(label, key)}
        </a>,
      );
    } else {
      nodes.push(<b key={key}>{renderInline(bold, key)}</b>);
    }

    last = match.index + whole.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Splits stored text into blocks and returns each as an array of React nodes,
// leaving the caller to decide what element wraps a block and how it is styled.
// A blank line starts a new block; a single newline is a line break inside one.
export function parseRichText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, blockIndex) =>
      block.split("\n").flatMap((line, lineIndex) => [
        ...(lineIndex > 0 ? [<br key={`br-${blockIndex}-${lineIndex}`} />] : []),
        ...renderInline(line, `${blockIndex}-${lineIndex}`),
      ]),
    );
}
