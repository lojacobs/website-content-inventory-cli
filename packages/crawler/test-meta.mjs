import { extractMeta } from "./dist/meta.js";
import fs from "fs";

const testHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <title>Test Page</title>
  <meta name="description" content="Test description">
  <link rel="canonical" href="https://example.com/test">
  <meta name="robots" content="noindex, nofollow">
</head>
<body>
  <img src="img1.jpg">
  <img src="img2.jpg">
  <a href="doc.pdf">PDF</a>
  <a href="file.docx">Word</a>
  This is some body text with multiple words to count.
  More text here for testing purposes.
</body>
</html>`;

const result = extractMeta(testHtml, "https://example.com/deep/nested/path/page");
console.log(JSON.stringify(result, null, 2));
console.log("\nVerification:");
console.log("  Titre:", result.Titre === "Test Page" ? "✓" : "✗", result.Titre);
console.log("  Description:", result.Description === "Test description" ? "✓" : "✗", result.Description);
console.log("  Langue:", result.Langue === "fr" ? "✓" : "✗", result.Langue);
console.log("  Canonical:", result.Canonical === "https://example.com/test" ? "✓" : "✗", result.Canonical);
console.log("  Noindex:", result.Noindex === true ? "✓" : "✗", result.Noindex);
console.log("  Nb_images:", result.Nb_images === 2 ? "✓" : "✗", result.Nb_images);
console.log("  Fichiers_liés:", result.Fichiers_liés === 2 ? "✓" : "✗", result.Fichiers_liés);
console.log("  Profondeur_URL:", result.Profondeur_URL === 4 ? "✓" : "✗", result.Profondeur_URL);
