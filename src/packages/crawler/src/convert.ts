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
  
  // Process the document from body
  let result = "";
  
  $("body").contents().each((_: number, elem: any) => {
    result += processNode(elem, $);
  });
  
  // Fallback: if body gave nothing, try all elements
  if (!result.trim()) {
    $("*").each((_: number, elem: any) => {
      result += processNode(elem, $);
    });
  }
  
  return normalizeWhitespace(result.trim());
}

/**
 * Process a DOM node and return its text representation.
 */
function processNode(elem: any, $: any): string {
  if (elem.type === "text") {
    return elem.data || "";
  }
  
  if (elem.type !== "tag") {
    return "";
  }
  
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
      $elem.children("li").each((_: number, li: any) => {
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
      $elem.contents().each((_: number, child: any) => {
        content += processNode(child, $);
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
      $elem.contents().each((_: number, child: any) => {
        content += processNode(child, $);
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
      $elem.contents().each((_: number, child: any) => {
        content += processNode(child, $);
      });
      return content;
    }
  }
}

/**
 * Process a table element and return pipe-delimited markdown.
 */
function processTable($table: any, $: ReturnType<typeof cheerio.load>): string {
  const rows: string[][] = [];
  
  // Extract header row
  $table.find("thead tr").each((_: number, tr: any) => {
    const row: string[] = [];
    $(tr).find("th, td").each((__: number, cell: any) => {
      row.push($(cell).text().trim());
    });
    if (row.length > 0) rows.push(row);
  });
  
  // Extract body rows
  $table.find("tbody tr").each((_: number, tr: any) => {
    const row: string[] = [];
    $(tr).find("td").each((__: number, cell: any) => {
      row.push($(cell).text().trim());
    });
    if (row.length > 0) rows.push(row);
  });
  
  // Fallback: extract all rows if tbody/thead not found
  if (rows.length === 0) {
    $table.find("tr").each((_: number, tr: any) => {
      const row: string[] = [];
      $(tr).find("th, td").each((__: number, cell: any) => {
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