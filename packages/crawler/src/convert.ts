/**
 * HTML to Text Converter
 * 
 * Converts sanitized HTML to readable plain text while preserving:
 * - Headings (h1-h6) as # through ###### markdown
 * - Links as [text](url) markdown
 * - Lists (ul/ol) as bullet points
 * - Tables as pipe-delimited markdown
 * - Stripping remaining HTML tags
 * - Normalizing whitespace
 */

import * as cheerio from "cheerio";

/**
 * Converts sanitized HTML to readable plain text.
 * 
 * @param html - Sanitized HTML string
 * @returns Plain text with markdown-like formatting
 */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  
  // Process body or root element
  const body = $("body").length > 0 ? $("body") : $.root();
  let result = "";
  
  body.contents().each((_, node) => {
    if (node.type === "tag" || node.type === "text") {
      result += processNode(node as cheerio.Node, $);
    }
  });
  
  // Fallback: if body parsing gave nothing, process entire document
  if (!result.trim()) {
    $("*").each((_, elem) => {
      result += processNode(elem as cheerio.Node, $);
    });
  }
  
  return normalizeWhitespace(result.trim());
}

type Node = ReturnType<cheerio.CheerioAPI["root"]> extends cheerio.Cheerio<infer T> ? T : never;

/**
 * Recursively process a cheerio node and its children.
 */
function processNode(node: cheerio.Node, $: cheerio.CheerioAPI): string {
  if (node.type === "text") {
    return (node as cheerio.TextNode).data || "";
  }
  
  if (node.type !== "tag") {
    return "";
  }
  
  const elem = node as cheerio.Element;
  const tagName = (elem.tagName || "").toLowerCase();
  const $elem = $(elem);
  
  switch (tagName) {
    // Headings: h1-h6 → # through ######
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = parseInt(tagName.charAt(1), 10);
      const prefix = "#".repeat(level);
      const content = $elem.text().trim();
      return content ? `\n${prefix} ${content}\n` : "";
    }
    
    // Links: [text](url)
    case "a": {
      const text = $elem.text().trim();
      const href = $elem.attr("href") || "";
      if (href && text) {
        return `[${text}](${href})`;
      }
      return text;
    }
    
    // Unordered list / ordered list
    case "ul":
    case "ol": {
      let listText = "\n";
      $elem.children("li").each((_, li) => {
        const liText = $(li).text().trim();
        if (liText) {
          listText += `- ${liText}\n`;
        }
      });
      return listText + "\n";
    }
    
    // Table
    case "table": {
      return processTable($elem, $);
    }
    
    // Block-level elements get newlines
    case "p":
    case "div":
    case "section":
    case "article":
    case "blockquote": {
      let content = "";
      $elem.contents().each((_, child) => {
        content += processNode(child as cheerio.Node, $);
      });
      return content + "\n";
    }
    
    // Line break
    case "br": {
      return "\n";
    }
    
    // Inline elements: just process children
    case "span":
    case "strong":
    case "b":
    case "em":
    case "i":
    case "u":
    case "code":
    case "pre": {
      let content = "";
      $elem.contents().each((_, child) => {
        content += processNode(child as cheerio.Node, $);
      });
      return content;
    }
    
    // Horizontal rule
    case "hr": {
      return "\n---\n";
    }
    
    // Default: process children
    default: {
      let content = "";
      $elem.contents().each((_, child) => {
        content += processNode(child as cheerio.Node, $);
      });
      return content;
    }
  }
}

/**
 * Process a table element and return pipe-delimited markdown.
 */
function processTable($table: cheerio.Cheerio, $: cheerio.CheerioAPI): string {
  const rows: string[][] = [];
  
  // Extract header row
  $table.find("thead tr").each((_, tr) => {
    const row: string[] = [];
    $(tr).find("th, td").each((_, cell) => {
      row.push($(cell).text().trim());
    });
    if (row.length > 0) rows.push(row);
  });
  
  // Extract body rows
  $table.find("tbody tr").each((_, tr) => {
    const row: string[] = [];
    $(tr).find("td").each((_, cell) => {
      row.push($(cell).text().trim());
    });
    if (row.length > 0) rows.push(row);
  });
  
  // Fallback: extract all rows if tbody/thead not found
  if (rows.length === 0) {
    $table.find("tr").each((_, tr) => {
      const row: string[] = [];
      $(tr).find("th, td").each((_, cell) => {
        row.push($(cell).text().trim());
      });
      if (row.length > 0) rows.push(row);
    });
  }
  
  if (rows.length === 0) return "";
  
  // Build pipe-delimited table
  let tableText = "\n";
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.map(cell => cell || "");
    
    // Add separator row after header
    if (i === 0 && rows.length > 1) {
      const separator = cells.map(() => "---");
      tableText += `| ${cells.join(" | ")} |\n`;
      tableText += `| ${separator.join(" | ")} |\n`;
    } else {
      tableText += `| ${cells.join(" | ")} |\n`;
    }
  }
  
  return tableText + "\n";
}

/**
 * Normalize whitespace: collapse multiple spaces/newlines to single ones.
 */
function normalizeWhitespace(text: string): string {
  return text
    // Replace multiple newlines with double newline (paragraph break)
    .replace(/\n{3,}/g, "\n\n")
    // Replace multiple spaces with single space
    .replace(/[ \t]+/g, " ")
    // Trim leading/trailing whitespace per line
    .split("\n")
    .map(line => line.trim())
    .join("\n")
    // Final trim
    .trim();
}

// Default export for convenience
export default htmlToText;