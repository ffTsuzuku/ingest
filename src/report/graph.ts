import { ANSI, stripAnsi, visibleLength } from "../tui/ansi.js";

export interface GraphNode {
  id: string;
  labelLines: string[];
  isDiamond?: boolean;
  width: number;
  height: number;
  x?: number;
  y?: number;
  layer?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ParsedGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  direction: "TD" | "LR";
}

export class CharCanvas {
  private grid: string[][];
  private styleGrid: string[][];
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.grid = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => " "));
    this.styleGrid = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => ""));
  }

  public set(x: number, y: number, char: string, style = ""): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.grid[y]![x] = char;
    this.styleGrid[y]![x] = style;
  }

  public get(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return " ";
    return this.grid[y]![x] ?? " ";
  }

  public write(x: number, y: number, text: string, style = ""): void {
    if (y < 0 || y >= this.height) return;
    const clean = stripAnsi(text);
    for (let i = 0; i < clean.length; i++) {
      const targetX = x + i;
      if (targetX >= 0 && targetX < this.width) {
        this.grid[y]![targetX] = clean[i]!;
        this.styleGrid[y]![targetX] = style;
      }
    }
  }

  public drawHLine(x: number, y: number, length: number, char = "─", style = ""): void {
    if (y < 0 || y >= this.height) return;
    for (let i = 0; i < length; i++) {
      const targetX = x + i;
      if (targetX >= 0 && targetX < this.width) {
        const current = this.grid[y]![targetX]!;
        if (current === "│" || current === "┼") {
          this.grid[y]![targetX] = "┼";
        } else {
          this.grid[y]![targetX] = char;
        }
        this.styleGrid[y]![targetX] = style;
      }
    }
  }

  public drawVLine(x: number, y: number, length: number, char = "│", style = ""): void {
    for (let i = 0; i < length; i++) {
      const targetY = y + i;
      if (targetY >= 0 && targetY < this.height && x >= 0 && x < this.width) {
        const current = this.grid[targetY]![x]!;
        if (current === "─" || current === "┼") {
          this.grid[targetY]![x] = "┼";
        } else {
          this.grid[targetY]![x] = char;
        }
        this.styleGrid[targetY]![x] = style;
      }
    }
  }

  public drawBox(
    x: number,
    y: number,
    w: number,
    h: number,
    lines: string[],
    isDiamond = false,
    borderColor = ANSI.gray,
  ): void {
    if (w < 4 || h < 2) return;

    // Top border
    const topLeft = isDiamond ? "◇" : "┌";
    const topRight = isDiamond ? "◇" : "┐";
    const bottomLeft = isDiamond ? "◇" : "└";
    const bottomRight = isDiamond ? "◇" : "┘";

    this.set(x, y, topLeft, borderColor);
    this.drawHLine(x + 1, y, w - 2, isDiamond ? "─" : "─", borderColor);
    this.set(x + w - 1, y, topRight, borderColor);

    // Sides and text
    for (let row = 0; row < h - 2; row++) {
      const currentY = y + 1 + row;
      this.set(x, currentY, "│", borderColor);
      this.set(x + w - 1, currentY, "│", borderColor);

      const lineText = lines[row] ?? "";
      const textLen = visibleLength(lineText);
      const startTextX = x + 1 + Math.max(0, Math.floor((w - 2 - textLen) / 2));
      
      const textColor = row === 0 ? `${ANSI.bold}${ANSI.brightWhite}` : `${ANSI.cyan}`;
      this.write(startTextX, currentY, lineText, textColor);
    }

    // Bottom border
    this.set(x, y + h - 1, bottomLeft, borderColor);
    this.drawHLine(x + 1, y + h - 1, w - 2, "─", borderColor);
    this.set(x + w - 1, y + h - 1, bottomRight, borderColor);
  }

  public renderLines(): string[] {
    const result: string[] = [];

    for (let y = 0; y < this.height; y++) {
      let lineStr = "";
      let activeStyle = "";

      // Find last non-space character
      let lastCharIdx = -1;
      for (let x = this.width - 1; x >= 0; x--) {
        if (this.grid[y]![x] !== " ") {
          lastCharIdx = x;
          break;
        }
      }

      if (lastCharIdx === -1) {
        result.push("");
        continue;
      }

      for (let x = 0; x <= lastCharIdx; x++) {
        const ch = this.grid[y]![x]!;
        const st = this.styleGrid[y]![x] || "";

        if (st !== activeStyle) {
          if (activeStyle && !st) {
            lineStr += ANSI.reset;
          } else if (st) {
            lineStr += (activeStyle ? ANSI.reset : "") + st;
          }
          activeStyle = st;
        }
        lineStr += ch;
      }

      if (activeStyle) {
        lineStr += ANSI.reset;
      }

      result.push(lineStr);
    }

    // Trim trailing empty lines
    while (result.length > 0 && result[result.length - 1]?.trim() === "") {
      result.pop();
    }

    return result;
  }
}

export function parseMermaidCode(codeLines: string[]): ParsedGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  let direction: "TD" | "LR" = "TD";

  const cleanLabelLines = (str: string): string[] => {
    return str
      .replace(/<br\s*\/?>\s*<code>(.*?)<\/code>/gi, "\n($1)")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<code>(.*?)<\/code>/gi, "($1)")
      .replace(/<[^>]+>/g, "")
      .replace(/\\n/g, "\n")
      .replace(/"/g, "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const parseSnippet = (snippet: string): { id: string; labelLines: string[]; isDiamond: boolean } | null => {
    const s = snippet.trim();
    if (!s) return null;

    // Diamond: ID{"Label"} or ID{Label}
    const diamondMatch = s.match(/^([A-Za-z0-9_-]+)\s*\{(?:"([^"]+)"|([^}]+))\}/);
    if (diamondMatch) {
      const id = diamondMatch[1]!;
      const raw = diamondMatch[2] || diamondMatch[3] || id;
      return { id, labelLines: cleanLabelLines(raw), isDiamond: true };
    }

    // Standard box: ID["Label"] or ID[Label]
    const boxMatch = s.match(/^([A-Za-z0-9_-]+)\s*\[(?:"([^"]+)"|([^\]]+))\]/);
    if (boxMatch) {
      const id = boxMatch[1]!;
      const raw = boxMatch[2] || boxMatch[3] || id;
      return { id, labelLines: cleanLabelLines(raw), isDiamond: false };
    }

    // Rounded box: ID("Label") or ID(Label)
    const roundedMatch = s.match(/^([A-Za-z0-9_-]+)\s*\((?:"([^"]+)"|([^)]+))\)/);
    if (roundedMatch) {
      const id = roundedMatch[1]!;
      const raw = roundedMatch[2] || roundedMatch[3] || id;
      return { id, labelLines: cleanLabelLines(raw), isDiamond: false };
    }

    // Bare identifier
    const idMatch = s.match(/^([A-Za-z0-9_-]+)$/);
    if (idMatch) {
      const id = idMatch[1]!;
      return { id, labelLines: [id], isDiamond: false };
    }

    return null;
  };

  for (const raw of codeLines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^(flowchart|graph)\s+LR\b/i.test(line)) {
      direction = "LR";
      continue;
    }
    if (/^(flowchart|graph)\s+(TD|TB)\b/i.test(line)) {
      direction = "TD";
      continue;
    }
    if (/^(flowchart|graph|sequenceDiagram|classDiagram)\b/i.test(line)) {
      continue;
    }

    // Check for arrow flow
    const arrowMatch = line.match(
      /^(.*?)\s*(?:-->|==>|-\.->|--\s*([^->]+?)\s*-->|==\s*([^=>]+?)\s*==>|-\.\s*([^->]+?)\s*\.->)\s*(?:\|([^|]+)\|)?\s*(.*?)$/,
    );

    if (arrowMatch) {
      const leftPart = arrowMatch[1] ?? "";
      const inlineLabel = arrowMatch[2] || arrowMatch[3] || arrowMatch[4] || arrowMatch[5];
      const rightPart = arrowMatch[6] ?? "";

      const leftNode = parseSnippet(leftPart);
      const rightNode = parseSnippet(rightPart);

      if (leftNode) {
        if (!nodes.has(leftNode.id) || leftNode.labelLines.length > 1 || leftNode.labelLines[0] !== leftNode.id) {
          const maxLineLen = Math.max(...leftNode.labelLines.map((l) => visibleLength(l)), 8);
          nodes.set(leftNode.id, {
            id: leftNode.id,
            labelLines: leftNode.labelLines,
            isDiamond: leftNode.isDiamond,
            width: Math.max(16, Math.min(36, maxLineLen + 4)),
            height: leftNode.labelLines.length + 2,
          });
        }
      }

      if (rightNode) {
        if (!nodes.has(rightNode.id) || rightNode.labelLines.length > 1 || rightNode.labelLines[0] !== rightNode.id) {
          const maxLineLen = Math.max(...rightNode.labelLines.map((l) => visibleLength(l)), 8);
          nodes.set(rightNode.id, {
            id: rightNode.id,
            labelLines: rightNode.labelLines,
            isDiamond: rightNode.isDiamond,
            width: Math.max(16, Math.min(36, maxLineLen + 4)),
            height: rightNode.labelLines.length + 2,
          });
        }
      }

      if (leftNode && rightNode) {
        edges.push({
          from: leftNode.id,
          to: rightNode.id,
          label: inlineLabel ? inlineLabel.trim() : undefined,
        });
      }
    } else {
      const node = parseSnippet(line);
      if (node) {
        const maxLineLen = Math.max(...node.labelLines.map((l) => visibleLength(l)), 8);
        nodes.set(node.id, {
          id: node.id,
          labelLines: node.labelLines,
          isDiamond: node.isDiamond,
          width: Math.max(16, Math.min(36, maxLineLen + 4)),
          height: node.labelLines.length + 2,
        });
      }
    }
  }

  return { nodes, edges, direction };
}

export function render2DUnicodeGraph(codeLines: string[], maxWidth = 80): string[] {
  const parsed = parseMermaidCode(codeLines);
  if (parsed.nodes.size === 0) return [];

  const nodes = parsed.nodes;
  const edges = parsed.edges;

  // 1. Assign layers (topological ranking)
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of nodes.keys()) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const edge of edges) {
    if (nodes.has(edge.from) && nodes.has(edge.to)) {
      adj.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }
  }

  const layers: string[][] = [];
  const nodeLayer = new Map<string, number>();

  // Queue roots (in-degree 0)
  const queue: Array<{ id: string; layer: number }> = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push({ id, layer: 0 });
      nodeLayer.set(id, 0);
    }
  }

  // If cycle or no in-degree 0, seed with first node
  if (queue.length === 0 && nodes.size > 0) {
    const firstId = nodes.keys().next().value!;
    queue.push({ id: firstId, layer: 0 });
    nodeLayer.set(firstId, 0);
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const { id, layer } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    while (layers.length <= layer) {
      layers.push([]);
    }
    if (!layers[layer]?.includes(id)) {
      layers[layer]?.push(id);
    }

    const neighbors = adj.get(id) ?? [];
    for (const next of neighbors) {
      const nextLayer = Math.max(layer + 1, (nodeLayer.get(next) ?? 0));
      nodeLayer.set(next, nextLayer);
      queue.push({ id: next, layer: nextLayer });
    }
  }

  // Include any remaining unvisited nodes
  for (const id of nodes.keys()) {
    if (!visited.has(id)) {
      const l = layers.length > 0 ? layers.length - 1 : 0;
      while (layers.length <= l) layers.push([]);
      layers[l]?.push(id);
      nodeLayer.set(id, l);
    }
  }

  // 2. Position nodes in 2D grid
  let currentY = 1;
  const layerGapY = 3;
  let canvasWidth = Math.max(maxWidth, 40);

  // Measure layer widths and assign (x, y)
  for (const layerNodes of layers) {
    const nodeCount = layerNodes.length;
    const layerMaxHeight = Math.max(...layerNodes.map((id) => nodes.get(id)?.height ?? 3), 3);
    const totalBoxWidth = layerNodes.reduce((sum, id) => sum + (nodes.get(id)?.width ?? 20), 0);
    const gapX = 4;
    const totalLayerWidth = totalBoxWidth + (nodeCount - 1) * gapX;

    if (totalLayerWidth + 4 > canvasWidth) {
      canvasWidth = totalLayerWidth + 6;
    }

    let startX = Math.max(2, Math.floor((canvasWidth - totalLayerWidth) / 2));

    for (const id of layerNodes) {
      const node = nodes.get(id);
      if (!node) continue;
      node.x = startX;
      node.y = currentY + Math.floor((layerMaxHeight - node.height) / 2);
      node.layer = layers.indexOf(layerNodes);
      startX += node.width + gapX;
    }

    currentY += layerMaxHeight + layerGapY;
  }

  const canvasHeight = currentY + 1;
  const canvas = new CharCanvas(canvasWidth, canvasHeight);

  // 3. Draw connection lines and arrows first (underneath boxes)
  for (const edge of edges) {
    const src = nodes.get(edge.from);
    const dst = nodes.get(edge.to);
    if (!src || !dst || src.x === undefined || src.y === undefined || dst.x === undefined || dst.y === undefined) {
      continue;
    }

    const srcCenterX = src.x + Math.floor(src.width / 2);
    const srcBottomY = src.y + src.height;
    const dstCenterX = dst.x + Math.floor(dst.width / 2);
    const dstTopY = dst.y;

    const edgeColor = ANSI.gray;
    const arrowColor = `${ANSI.bold}${ANSI.brightCyan}`;
    const labelColor = `${ANSI.bold}${ANSI.cyan}`;

    if (srcBottomY < dstTopY) {
      // Downward flow
      if (Math.abs(srcCenterX - dstCenterX) <= 2) {
        // Direct vertical line
        canvas.drawVLine(srcCenterX, srcBottomY, dstTopY - srcBottomY, "│", edgeColor);
        canvas.set(srcCenterX, dstTopY - 1, "▼", arrowColor);

        if (edge.label) {
          canvas.write(srcCenterX + 2, Math.floor((srcBottomY + dstTopY) / 2), edge.label, labelColor);
        }
      } else {
        // Stepped routing with corners
        const midY = Math.floor((srcBottomY + dstTopY) / 2);

        // 1. Vertical from source down to midY
        canvas.drawVLine(srcCenterX, srcBottomY, midY - srcBottomY + 1, "│", edgeColor);

        // 2. Horizontal across to dstCenterX
        const leftX = Math.min(srcCenterX, dstCenterX);
        const rightX = Math.max(srcCenterX, dstCenterX);
        canvas.drawHLine(leftX, midY, rightX - leftX + 1, "─", edgeColor);

        // Corners
        if (dstCenterX > srcCenterX) {
          canvas.set(srcCenterX, midY, "└", edgeColor);
          canvas.set(dstCenterX, midY, "┐", edgeColor);
        } else {
          canvas.set(srcCenterX, midY, "┘", edgeColor);
          canvas.set(dstCenterX, midY, "┌", edgeColor);
        }

        // 3. Vertical down to destination
        canvas.drawVLine(dstCenterX, midY + 1, dstTopY - (midY + 1), "│", edgeColor);
        canvas.set(dstCenterX, dstTopY - 1, "▼", arrowColor);

        // Edge label on horizontal segment
        if (edge.label) {
          const labelX = leftX + Math.max(1, Math.floor((rightX - leftX - visibleLength(edge.label)) / 2));
          canvas.write(labelX, midY - 1, edge.label, labelColor);
        }
      }
    } else if (src.y === dst.y) {
      // Same layer (horizontal flow)
      const isLeftToRight = src.x < dst.x;
      const startX = isLeftToRight ? src.x + src.width : src.x;
      const endX = isLeftToRight ? dst.x : dst.x + dst.width;
      const lineY = src.y + Math.floor(src.height / 2);
      const minX = Math.min(startX, endX);
      const len = Math.abs(endX - startX);

      canvas.drawHLine(minX, lineY, len, "─", edgeColor);
      canvas.set(isLeftToRight ? endX - 1 : endX, lineY, isLeftToRight ? "►" : "◄", arrowColor);

      if (edge.label) {
        canvas.write(minX + 1, lineY - 1, edge.label, labelColor);
      }
    } else {
      // Loopback / Upward connection (routed around the right gutter)
      const gutterX = Math.max(src.x + src.width, dst.x + dst.width) + 3;
      const srcMidY = src.y + Math.floor(src.height / 2);
      const dstMidY = dst.y + Math.floor(dst.height / 2);

      // Out to gutter
      canvas.drawHLine(src.x + src.width, srcMidY, gutterX - (src.x + src.width) + 1, "─", edgeColor);
      canvas.set(gutterX, srcMidY, "┐", edgeColor);

      // Up gutter
      const topY = Math.min(srcMidY, dstMidY);
      const botY = Math.max(srcMidY, dstMidY);
      canvas.drawVLine(gutterX, topY, botY - topY + 1, "│", edgeColor);
      canvas.set(gutterX, dstMidY, "┘", edgeColor);

      // Back to destination
      canvas.drawHLine(dst.x + dst.width + 1, dstMidY, gutterX - (dst.x + dst.width), "─", edgeColor);
      canvas.set(dst.x + dst.width, dstMidY, "◄", arrowColor);

      if (edge.label) {
        canvas.write(gutterX + 1, Math.floor((srcMidY + dstMidY) / 2), edge.label, labelColor);
      }
    }
  }

  // 4. Draw node boxes on top of lines
  for (const node of nodes.values()) {
    if (node.x === undefined || node.y === undefined) continue;
    const borderColor = node.isDiamond ? `${ANSI.bold}${ANSI.brightYellow}` : `${ANSI.gray}`;
    canvas.drawBox(node.x, node.y, node.width, node.height, node.labelLines, node.isDiamond, borderColor);
  }

  const rawLines = canvas.renderLines();
  const output: string[] = [];
  const barWidth = Math.max(30, Math.min(canvasWidth + 4, 80));

  output.push("");
  output.push(`  ${ANSI.gray}╭── ${ANSI.bold}${ANSI.brightCyan}[📊 2D Interactive Architecture Flow]${ANSI.reset} ${ANSI.gray}${"─".repeat(Math.max(2, barWidth - 40))}${ANSI.reset}`);
  output.push(`  ${ANSI.gray}│${ANSI.reset}`);

  for (const line of rawLines) {
    output.push(`  ${ANSI.gray}│${ANSI.reset}  ${line}`);
  }

  output.push(`  ${ANSI.gray}│${ANSI.reset}`);
  output.push(`  ${ANSI.gray}│${ANSI.reset}  ${ANSI.dim}${ANSI.italic}💡 Tip: Pan & zoom in web dashboard: '${ANSI.yellow}ingest --ui${ANSI.reset}${ANSI.dim}${ANSI.italic}'${ANSI.reset}`);
  output.push(`  ${ANSI.gray}╰${"─".repeat(barWidth)}${ANSI.reset}`);
  output.push("");

  return output;
}
